"""Phase 6: Persistent Adaptive Memory Service for SafeLoop AI.

Manages persistent, safe, and bounded adaptive memory extracted from validated
feedback and approved improvement proposals without retraining underlying models.
"""

from datetime import datetime, timezone
import json
import re
from typing import Any, Dict, List, Optional, Set, Tuple
import uuid

from app.core.config import settings
from app.core.database import get_db_connection
from app.core.logging import logger
from app.models.schemas import (
    MemoryActionRequest,
    MemoryCandidateCreateRequest,
    MemoryCategory,
    MemoryListResponse,
    MemoryProvenanceLogResponse,
    MemoryResponse,
    MemoryRetrievalConfigResponse,
    MemoryRetrievalItem,
    MemoryRetrievalTestRequest,
    MemoryRetrievalTestResponse,
    MemoryStatsResponse,
    MemoryStatus,
    MemoryValidationStatus,
)
from app.services.evaluation_service import SAFETY_PATTERNS, STOPWORDS, _tokenize


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class MemoryServiceError(Exception):
    """Base exception for memory service errors."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class MemoryProvenanceError(MemoryServiceError):
    """Raised when source feedback or proposal is unapproved or invalid."""

    def __init__(self, message: str):
        super().__init__(message, status_code=400)


class MemorySafetyError(MemoryServiceError):
    """Raised when memory candidate contains malicious or unsafe content."""

    def __init__(self, message: str):
        super().__init__(message, status_code=422)


class MemoryDuplicateError(MemoryServiceError):
    """Raised when candidate is a duplicate of an existing active memory."""

    def __init__(self, message: str):
        super().__init__(message, status_code=409)


class MemoryNotFoundError(MemoryServiceError):
    """Raised when a requested memory record is not found."""

    def __init__(self, memory_id: str):
        super().__init__(f"Memory record '{memory_id}' not found.", status_code=404)


class MemoryStateTransitionError(MemoryServiceError):
    """Raised when an invalid state transition is attempted."""

    def __init__(self, message: str):
        super().__init__(message, status_code=400)


# ---------------------------------------------------------------------------
# Redaction Patterns
# ---------------------------------------------------------------------------

SECRET_PATTERNS: List[Tuple[re.Pattern, str]] = [
    # Gemini / Google API keys
    (re.compile(r"AIzaSy[A-Za-z0-9_-]{33}", re.IGNORECASE), "[REDACTED_API_KEY]"),
    (re.compile(r"GEMINI_API_KEY\s*[:=]\s*['\"]?[A-Za-z0-9_\-\.]{15,}['\"]?", re.IGNORECASE), "GEMINI_API_KEY=[REDACTED]"),
    (re.compile(r"GOOGLE_API_KEY\s*[:=]\s*['\"]?[A-Za-z0-9_\-\.]{15,}['\"]?", re.IGNORECASE), "GOOGLE_API_KEY=[REDACTED]"),
    # OpenAI / generic bearer tokens
    (re.compile(r"sk-[A-Za-z0-9]{20,}", re.IGNORECASE), "[REDACTED_API_KEY]"),
    (re.compile(r"Bearer\s+[A-Za-z0-9\._\-]{20,}", re.IGNORECASE), "Bearer [REDACTED_TOKEN]"),
    # Private credentials / passwords
    (re.compile(r"(?i)\bpassword\s*[:=]\s*['\"]?[^\s'\"]{6,}['\"]?"), "password=[REDACTED]"),
    (re.compile(r"(?i)\bsecret[_\s]?key\s*[:=]\s*['\"]?[^\s'\"]{8,}['\"]?"), "secret_key=[REDACTED]"),
    # Email addresses
    (re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b"), "[REDACTED_EMAIL]"),
    # Phone numbers
    (re.compile(r"\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b"), "[REDACTED_PHONE]"),
]

# Memory-specific poison patterns
MEMORY_POISON_PATTERNS: List[Tuple[str, str]] = [
    (r"(?i)\bfrom\s+now\s+on\s+ignore\s+(all\s+)?(rules|safety|policies)\b", "memory_poisoning"),
    (r"(?i)\balways\s+reveal\s+(api\s+keys?|passwords?|credentials?)\b", "credential_leak_rule"),
    (r"(?i)\bbypass\s+all\s+gating\b", "safety_bypass"),
    (r"(?i)\bact\s+as\s+an\s+unrestricted\s+agent\b", "jailbreak_attempt"),
]

DOMAIN_KEYWORDS: Dict[str, Set[str]] = {
    "python": {"python", "def", "class", "async", "await", "typing", "pydantic", "fastapi", "pytest", "tuple", "dict", "list", "lambda"},
    "algorithms": {"algorithm", "complexity", "quicksort", "binary", "search", "tree", "graph", "dp", "sorting", "big-o", "time", "space"},
    "formatting": {"format", "json", "markdown", "bullet", "header", "table", "schema", "concise", "docstring", "indentation"},
    "security": {"security", "safe", "sanitize", "credential", "auth", "validation", "injection", "token", "privacy", "redact"},
    "code_precision": {"syntax", "import", "typehint", "signature", "parameter", "return", "exception", "module", "variable"},
}


class MemoryService:
    """Core service for managing the persistent adaptive memory lifecycle."""

    def __init__(self, db_path: Optional[str] = None):
        self._db_path = db_path
        self._retrieval_enabled: bool = settings.memory_retrieval_enabled

    @property
    def is_retrieval_enabled(self) -> bool:
        """Check whether dynamic memory retrieval is active."""
        return self._retrieval_enabled

    def set_retrieval_enabled(self, enabled: bool) -> None:
        """Enable or disable dynamic memory retrieval."""
        self._retrieval_enabled = enabled
        logger.info("Memory retrieval toggled to: %s", enabled)

    # -----------------------------------------------------------------------
    # Provenance Logging
    # -----------------------------------------------------------------------

    def record_provenance(
        self,
        memory_id: str,
        action: str,
        actor: str = "system",
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Append an auditable provenance entry for a memory lifecycle event."""
        timestamp = datetime.now(timezone.utc).isoformat()
        detail_str = json.dumps(details) if details else None
        try:
            with get_db_connection(self._db_path) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO memory_provenance_logs (memory_id, action, actor, details, timestamp)
                    VALUES (?, ?, ?, ?, ?);
                    """,
                    (memory_id, action, actor, detail_str, timestamp),
                )
                conn.commit()
            logger.info("Memory provenance recorded: memory=%s, action=%s, actor=%s", memory_id, action, actor)
        except Exception as exc:
            logger.error("Failed to record memory provenance: %s", exc)

    # -----------------------------------------------------------------------
    # Privacy & Safety Screening / Redaction
    # -----------------------------------------------------------------------

    def screen_and_sanitize(self, title: str, lesson: str) -> Tuple[str, str, bool, List[str], Optional[str]]:
        """Screen memory candidate for safety violations, prompt injections, and redact secrets.

        Returns:
            Tuple of (sanitized_title, sanitized_lesson, is_safe, safety_flags, rejection_reason)
        """
        safety_flags: List[str] = []
        sanitized_title = title
        sanitized_lesson = lesson
        redacted_detected = False

        # 1. Detect and Redact Secrets / Credentials / PII first
        for pattern, replacement in SECRET_PATTERNS:
            if pattern.search(sanitized_title):
                sanitized_title = pattern.sub(replacement, sanitized_title)
                redacted_detected = True
            if pattern.search(sanitized_lesson):
                sanitized_lesson = pattern.sub(replacement, sanitized_lesson)
                redacted_detected = True

        if redacted_detected:
            safety_flags.append("credential_redacted")

        # 2. Check for malicious prompt injection / jailbreak / system overrides
        # Ignore raw credential pattern if it has already been safely redacted
        combined_text = f"{sanitized_title} {sanitized_lesson}"

        for pattern_str, flag in SAFETY_PATTERNS:
            # If credential was present and redacted, don't double-fail unless malicious extraction was requested
            if flag == "credential_extraction" and redacted_detected:
                continue
            if re.search(pattern_str, combined_text):
                safety_flags.append(flag)

        # 3. Check memory-specific poisoning patterns
        for pattern_str, flag in MEMORY_POISON_PATTERNS:
            if re.search(pattern_str, combined_text):
                safety_flags.append(flag)

        # If malicious instruction or injection detected, fail safety screening
        malicious_flags = [f for f in safety_flags if f != "credential_redacted"]
        if malicious_flags:
            reason = f"Candidate rejected due to safety violations: {', '.join(sorted(set(malicious_flags)))}"
            return sanitized_title, sanitized_lesson, False, list(sorted(set(safety_flags))), reason

        return sanitized_title, sanitized_lesson, True, safety_flags, None

    # -----------------------------------------------------------------------
    # Provenance Validation
    # -----------------------------------------------------------------------

    def validate_provenance(
        self,
        source_type: str,
        source_feedback_id: Optional[int],
        source_proposal_id: Optional[str],
    ) -> Tuple[bool, Optional[str]]:
        """Verify that the source feedback or proposal has been strictly validated and approved."""
        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()

            if source_type == "feedback":
                if not source_feedback_id:
                    return False, "source_feedback_id is required when source_type is 'feedback'"
                
                # Check feedback existence
                cursor.execute("SELECT id FROM feedback WHERE id = ?;", (source_feedback_id,))
                if not cursor.fetchone():
                    return False, f"Source feedback #{source_feedback_id} does not exist in database."

                # Check Phase 4 evaluation: MUST be approved and safe
                cursor.execute(
                    "SELECT decision, is_safe FROM evaluations WHERE feedback_id = ?;",
                    (source_feedback_id,),
                )
                eval_row = cursor.fetchone()
                if not eval_row:
                    return False, (
                        f"Source feedback #{source_feedback_id} has not been evaluated in Phase 4. "
                        "Raw unvalidated feedback cannot be converted to adaptive memory."
                    )
                decision, is_safe = eval_row["decision"], eval_row["is_safe"]
                if decision != "approved" or is_safe != 1:
                    return False, (
                        f"Source feedback #{source_feedback_id} has evaluation decision '{decision}' (is_safe={is_safe}). "
                        "Only 'approved' feedback can generate trusted adaptive memory."
                    )
                return True, None

            elif source_type == "proposal":
                if not source_proposal_id:
                    return False, "source_proposal_id is required when source_type is 'proposal'"

                cursor.execute(
                    "SELECT status, safety_validation_passed, regression_passed FROM improvement_proposals WHERE id = ?;",
                    (source_proposal_id,),
                )
                prop_row = cursor.fetchone()
                if not prop_row:
                    return False, f"Source proposal '{source_proposal_id}' does not exist in database."

                status = prop_row["status"]
                safety_passed = prop_row["safety_validation_passed"]
                if status not in ("approved", "activated") or safety_passed != 1:
                    return False, (
                        f"Source proposal '{source_proposal_id}' has status '{status}' (safety_passed={safety_passed}). "
                        "Only proposals approved through regression and safety gating can generate adaptive memory."
                    )
                return True, None

            elif source_type == "verified_expert":
                # Explicit expert / system seed source
                return True, None

            return False, f"Unsupported source type '{source_type}'."

    # -----------------------------------------------------------------------
    # Duplicate and Contradiction Detection
    # -----------------------------------------------------------------------

    def check_duplicate_and_conflict(
        self,
        lesson: str,
        category: str,
        task_domain: str,
    ) -> Tuple[Optional[str], Optional[str]]:
        """Check against existing active memories for near-duplicates and direct contradictions.

        Returns:
            Tuple of (duplicate_memory_id, conflict_memory_id)
        """
        cand_tokens = _tokenize(lesson)
        if not cand_tokens:
            return None, None

        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, title, lesson, category, task_domain
                FROM adaptive_memories
                WHERE status = 'active';
                """
            )
            rows = cursor.fetchall()

        for row in rows:
            exist_id = row["id"]
            exist_lesson = row["lesson"]
            exist_tokens = _tokenize(exist_lesson)
            if not exist_tokens:
                continue

            intersection = cand_tokens.intersection(exist_tokens)
            union = cand_tokens.union(exist_tokens)
            jaccard = len(intersection) / len(union) if union else 0.0

            # Check negation polarity
            has_cand_negation = bool(re.search(r"\b(never|do not|don't|avoid|prohibit|refuse|disallow)\b", lesson.lower()))
            has_exist_negation = bool(re.search(r"\b(never|do not|don't|avoid|prohibit|refuse|disallow)\b", exist_lesson.lower()))

            # 1. Contradiction / Conflict check on same domain/category with opposite polarity
            if (row["task_domain"] == task_domain or row["category"] == category) and has_cand_negation != has_exist_negation:
                if len(intersection) >= 3 and jaccard >= 0.35:
                    return None, exist_id

            # 2. Near duplicate check (high lexical similarity with identical polarity)
            overlap_ratio = len(intersection) / min(len(cand_tokens), len(exist_tokens)) if cand_tokens and exist_tokens else 0.0
            if jaccard >= 0.55 or overlap_ratio >= 0.70:
                return exist_id, None

        return None, None

    # -----------------------------------------------------------------------
    # Candidate Creation & Storage
    # -----------------------------------------------------------------------

    def create_candidate(
        self,
        request: MemoryCandidateCreateRequest,
        actor: str = "system",
    ) -> MemoryResponse:
        """Process, validate, screen, and persist a new adaptive memory candidate."""
        # 1. Provenance validation
        valid_provenance, prov_error = self.validate_provenance(
            source_type=request.source_type,
            source_feedback_id=request.source_feedback_id,
            source_proposal_id=request.source_proposal_id,
        )
        if not valid_provenance:
            logger.warning("Memory candidate creation rejected: %s", prov_error)
            raise MemoryProvenanceError(prov_error or "Provenance validation failed.")

        # 2. Safety screening & redaction
        clean_title, clean_lesson, is_safe, safety_flags, reject_reason = self.screen_and_sanitize(
            title=request.title,
            lesson=request.lesson,
        )

        memory_id = f"mem_{uuid.uuid4().hex[:8]}"
        created_at = datetime.now(timezone.utc).isoformat()
        updated_at = created_at

        # Extract search keywords
        combined_tokens = _tokenize(f"{clean_title} {clean_lesson} {request.task_domain} {request.category}")
        keywords_json = json.dumps(sorted(list(combined_tokens)))

        if not is_safe:
            # Candidate rejected outright by safety screen
            status: MemoryStatus = "rejected"
            validation_status: MemoryValidationStatus = "rejected"
            privacy_passed = 0
            review_notes = reject_reason
        else:
            # 3. Duplicate and conflict check
            dup_id, conflict_id = self.check_duplicate_and_conflict(
                lesson=clean_lesson,
                category=request.category,
                task_domain=request.task_domain,
            )
            if dup_id:
                raise MemoryDuplicateError(
                    f"Candidate is a near-duplicate of existing active memory '{dup_id}'."
                )

            if conflict_id:
                # Contradiction detected: mark for review, do not auto-approve
                review_notes = f"Flagged: Potential contradiction with active memory '{conflict_id}'. Requires review."
            else:
                review_notes = "Candidate created from validated source. Awaiting administrative approval."

            status = "candidate"
            validation_status = "candidate"
            privacy_passed = 1

        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO adaptive_memories (
                    id, title, lesson, category, source_feedback_id, source_proposal_id,
                    task_domain, confidence_score, validation_status, status, version,
                    usage_count, last_used_at, keywords, privacy_safety_passed,
                    safety_flags, review_notes, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, NULL, ?, ?, ?, ?, ?, ?);
                """,
                (
                    memory_id,
                    clean_title,
                    clean_lesson,
                    request.category,
                    request.source_feedback_id,
                    request.source_proposal_id,
                    request.task_domain,
                    request.confidence_score,
                    validation_status,
                    status,
                    keywords_json,
                    privacy_passed,
                    json.dumps(safety_flags),
                    review_notes,
                    created_at,
                    updated_at,
                ),
            )
            conn.commit()

        # Provenance audit log
        self.record_provenance(
            memory_id=memory_id,
            action="created_candidate",
            actor=actor,
            details={
                "source_type": request.source_type,
                "source_feedback_id": request.source_feedback_id,
                "source_proposal_id": request.source_proposal_id,
                "is_safe": is_safe,
                "safety_flags": safety_flags,
                "status": status,
            },
        )

        logger.info("Memory candidate created: %s (status: %s, safe: %s)", memory_id, status, is_safe)
        return self.get_memory_by_id(memory_id)

    # -----------------------------------------------------------------------
    # Retrieval by ID and Listing
    # -----------------------------------------------------------------------

    def get_memory_by_id(self, memory_id: str, include_provenance: bool = True) -> MemoryResponse:
        """Fetch an individual memory record by ID with optional provenance history."""
        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, title, lesson, category, source_feedback_id, source_proposal_id,
                       task_domain, confidence_score, validation_status, status, version,
                       usage_count, last_used_at, keywords, privacy_safety_passed,
                       safety_flags, review_notes, created_at, updated_at
                FROM adaptive_memories
                WHERE id = ?;
                """,
                (memory_id,),
            )
            row = cursor.fetchone()
            if not row:
                raise MemoryNotFoundError(memory_id)

            provenance_logs = None
            if include_provenance:
                cursor.execute(
                    """
                    SELECT id, memory_id, action, actor, details, timestamp
                    FROM memory_provenance_logs
                    WHERE memory_id = ?
                    ORDER BY id ASC;
                    """,
                    (memory_id,),
                )
                provenance_logs = [
                    MemoryProvenanceLogResponse(
                        id=p["id"],
                        memory_id=p["memory_id"],
                        action=p["action"],
                        actor=p["actor"],
                        details=p["details"],
                        timestamp=p["timestamp"],
                    )
                    for p in cursor.fetchall()
                ]

        keywords = json.loads(row["keywords"]) if row["keywords"] else []
        safety_flags = json.loads(row["safety_flags"]) if row["safety_flags"] else []

        return MemoryResponse(
            id=row["id"],
            title=row["title"],
            lesson=row["lesson"],
            category=row["category"],
            source_feedback_id=row["source_feedback_id"],
            source_proposal_id=row["source_proposal_id"],
            task_domain=row["task_domain"],
            confidence_score=row["confidence_score"],
            validation_status=row["validation_status"],
            status=row["status"],
            version=row["version"],
            usage_count=row["usage_count"],
            last_used_at=row["last_used_at"],
            keywords=keywords,
            privacy_safety_passed=bool(row["privacy_safety_passed"]),
            safety_flags=safety_flags,
            review_notes=row["review_notes"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            provenance_logs=provenance_logs,
        )

    def list_memories(
        self,
        status: Optional[str] = None,
        validation_status: Optional[str] = None,
        category: Optional[str] = None,
        task_domain: Optional[str] = None,
        search: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> MemoryListResponse:
        """Query memories with filtering, pagination, and optional search."""
        clauses = []
        params: List[Any] = []

        if status:
            clauses.append("status = ?")
            params.append(status)
        if validation_status:
            clauses.append("validation_status = ?")
            params.append(validation_status)
        if category:
            clauses.append("category = ?")
            params.append(category)
        if task_domain:
            clauses.append("task_domain = ?")
            params.append(task_domain)
        if search and search.strip():
            clauses.append("(title LIKE ? OR lesson LIKE ? OR task_domain LIKE ?)")
            s = f"%{search.strip()}%"
            params.extend([s, s, s])

        where_sql = f"WHERE {' AND '.join(clauses)}" if clauses else ""

        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(f"SELECT COUNT(*) FROM adaptive_memories {where_sql};", params)
            total = cursor.fetchone()[0]

            cursor.execute(
                f"""
                SELECT id, title, lesson, category, source_feedback_id, source_proposal_id,
                       task_domain, confidence_score, validation_status, status, version,
                       usage_count, last_used_at, keywords, privacy_safety_passed,
                       safety_flags, review_notes, created_at, updated_at
                FROM adaptive_memories
                {where_sql}
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?;
                """,
                params + [limit, offset],
            )
            rows = cursor.fetchall()

        items = []
        for row in rows:
            keywords = json.loads(row["keywords"]) if row["keywords"] else []
            safety_flags = json.loads(row["safety_flags"]) if row["safety_flags"] else []
            items.append(
                MemoryResponse(
                    id=row["id"],
                    title=row["title"],
                    lesson=row["lesson"],
                    category=row["category"],
                    source_feedback_id=row["source_feedback_id"],
                    source_proposal_id=row["source_proposal_id"],
                    task_domain=row["task_domain"],
                    confidence_score=row["confidence_score"],
                    validation_status=row["validation_status"],
                    status=row["status"],
                    version=row["version"],
                    usage_count=row["usage_count"],
                    last_used_at=row["last_used_at"],
                    keywords=keywords,
                    privacy_safety_passed=bool(row["privacy_safety_passed"]),
                    safety_flags=safety_flags,
                    review_notes=row["review_notes"],
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
            )

        return MemoryListResponse(items=items, total=total, limit=limit, offset=offset)

    def get_stats(self) -> MemoryStatsResponse:
        """Compute aggregate statistics on persistent adaptive memories."""
        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM adaptive_memories;")
            total_memories = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM adaptive_memories WHERE status = 'active';")
            active_memories = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM adaptive_memories WHERE status = 'candidate';")
            candidate_memories = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM adaptive_memories WHERE status = 'archived';")
            archived_memories = cursor.fetchone()[0]

            cursor.execute("SELECT COUNT(*) FROM adaptive_memories WHERE status = 'rejected';")
            rejected_memories = cursor.fetchone()[0]

            cursor.execute("SELECT COALESCE(SUM(usage_count), 0) FROM adaptive_memories;")
            total_usage = cursor.fetchone()[0]

            cursor.execute("SELECT COALESCE(AVG(confidence_score), 0.0) FROM adaptive_memories WHERE status = 'active';")
            avg_conf = round(float(cursor.fetchone()[0]), 3)

        return MemoryStatsResponse(
            total_memories=total_memories,
            active_memories=active_memories,
            candidate_memories=candidate_memories,
            archived_memories=archived_memories,
            rejected_memories=rejected_memories,
            total_usage=total_usage,
            average_confidence=avg_conf,
            retrieval_enabled=self.is_retrieval_enabled,
        )

    # -----------------------------------------------------------------------
    # Lifecycle Management: Approval, Rejection, Archival
    # -----------------------------------------------------------------------

    def approve_memory(
        self,
        memory_id: str,
        reason: Optional[str] = None,
        actor: str = "admin",
    ) -> MemoryResponse:
        """Approve a memory candidate, promoting it to active runtime memory."""
        mem = self.get_memory_by_id(memory_id, include_provenance=False)

        if not mem.privacy_safety_passed:
            raise MemoryStateTransitionError("Cannot approve memory that failed privacy or safety screening.")

        if mem.status == "rejected" and "safety_violations" in (mem.review_notes or ""):
            raise MemoryStateTransitionError("Cannot approve memory previously rejected for safety violations.")

        updated_at = datetime.now(timezone.utc).isoformat()
        notes = reason or "Approved by administrator for active agent context."

        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE adaptive_memories
                SET status = 'active',
                    validation_status = 'approved',
                    review_notes = ?,
                    updated_at = ?
                WHERE id = ?;
                """,
                (notes, updated_at, memory_id),
            )
            conn.commit()

        self.record_provenance(
            memory_id=memory_id,
            action="approved",
            actor=actor,
            details={"notes": notes},
        )

        logger.info("Memory approved and activated: %s by %s", memory_id, actor)
        return self.get_memory_by_id(memory_id)

    def reject_memory(
        self,
        memory_id: str,
        reason: Optional[str] = None,
        actor: str = "admin",
    ) -> MemoryResponse:
        """Reject a memory candidate or deactivate an invalid memory."""
        self.get_memory_by_id(memory_id, include_provenance=False)
        updated_at = datetime.now(timezone.utc).isoformat()
        notes = reason or "Rejected during memory validation review."

        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE adaptive_memories
                SET status = 'rejected',
                    validation_status = 'rejected',
                    review_notes = ?,
                    updated_at = ?
                WHERE id = ?;
                """,
                (notes, updated_at, memory_id),
            )
            conn.commit()

        self.record_provenance(
            memory_id=memory_id,
            action="rejected",
            actor=actor,
            details={"reason": notes},
        )

        logger.info("Memory rejected: %s by %s (reason: %s)", memory_id, actor, notes)
        return self.get_memory_by_id(memory_id)

    def archive_memory(
        self,
        memory_id: str,
        reason: Optional[str] = None,
        actor: str = "admin",
    ) -> MemoryResponse:
        """Archive an outdated, obsolete, or superseded memory without deleting evidence."""
        self.get_memory_by_id(memory_id, include_provenance=False)
        updated_at = datetime.now(timezone.utc).isoformat()
        notes = reason or "Archived: Outdated, superseded, or low utility."

        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE adaptive_memories
                SET status = 'archived',
                    review_notes = ?,
                    updated_at = ?
                WHERE id = ?;
                """,
                (notes, updated_at, memory_id),
            )
            conn.commit()

        self.record_provenance(
            memory_id=memory_id,
            action="archived",
            actor=actor,
            details={"reason": notes},
        )

        logger.info("Memory archived: %s by %s (reason: %s)", memory_id, actor, notes)
        return self.get_memory_by_id(memory_id)

    # -----------------------------------------------------------------------
    # Task Relevance & Retrieval Engine
    # -----------------------------------------------------------------------

    def detect_domain(self, prompt: str) -> Optional[str]:
        """Detect the general domain of the prompt based on key tokens."""
        prompt_tokens = _tokenize(prompt)
        best_domain = None
        max_matches = 0

        for domain, kw_set in DOMAIN_KEYWORDS.items():
            matches = len(prompt_tokens.intersection(kw_set))
            if matches > max_matches:
                max_matches = matches
                best_domain = domain

        return best_domain if max_matches >= 1 else None

    def retrieve_relevant_memories(
        self,
        prompt: str,
        task_domain: Optional[str] = None,
        limit: Optional[int] = None,
        min_score: Optional[float] = None,
    ) -> List[MemoryRetrievalItem]:
        """Retrieve a bounded subset of active, validated memories relevant to the prompt.

        Safety constraints:
        - Only active and approved memories (status='active', validation_status='approved', privacy_safety_passed=1).
        - Candidates, rejected, or archived memories are NEVER returned.
        - Respects memory_retrieval_enabled switch.
        - Bounded by max_retrieval_count to prevent context flooding.
        """
        if not self.is_retrieval_enabled:
            return []

        effective_limit = limit or settings.memory_max_retrieval_count
        effective_min_score = min_score or settings.memory_min_relevance_score
        prompt_tokens = _tokenize(prompt)

        if not prompt_tokens:
            return []

        detected_domain = task_domain or self.detect_domain(prompt)

        try:
            with get_db_connection(self._db_path) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT id, title, lesson, category, source_feedback_id, source_proposal_id,
                           task_domain, confidence_score, validation_status, status, version,
                           usage_count, last_used_at, keywords, privacy_safety_passed,
                           safety_flags, review_notes, created_at, updated_at
                    FROM adaptive_memories
                    WHERE status = 'active'
                      AND validation_status = 'approved'
                      AND privacy_safety_passed = 1;
                    """
                )
                rows = cursor.fetchall()
        except Exception as exc:
            logger.error("Database error during memory retrieval: %s", exc)
            return []

        scored_items: List[Tuple[float, List[str], Dict[str, Any]]] = []

        for row in rows:
            keywords: List[str] = json.loads(row["keywords"]) if row["keywords"] else []
            memory_tokens = set(keywords).union(_tokenize(f"{row['title']} {row['lesson']}"))

            matched = prompt_tokens.intersection(memory_tokens)
            if not matched:
                continue

            # Jaccard / Token Overlap Score
            union_len = len(prompt_tokens.union(memory_tokens))
            base_similarity = (len(matched) / union_len) if union_len > 0 else 0.0

            # Match bonus for high token count overlap
            overlap_bonus = min(len(matched) * 0.1, 0.4)

            # Domain alignment bonus
            domain_bonus = 0.0
            if detected_domain:
                if row["task_domain"] == detected_domain:
                    domain_bonus = 0.25
                elif row["task_domain"] == "general":
                    domain_bonus = 0.10

            # Confidence weighting
            conf_weight = float(row["confidence_score"])

            # Composite Relevance Score
            total_score = (base_similarity + overlap_bonus + domain_bonus) * conf_weight

            if total_score >= effective_min_score:
                scored_items.append((total_score, sorted(list(matched)), dict(row)))

        # Sort descending by relevance score
        scored_items.sort(key=lambda x: x[0], reverse=True)

        results: List[MemoryRetrievalItem] = []
        for score, matched_kw, r_dict in scored_items[:effective_limit]:
            kws = json.loads(r_dict["keywords"]) if r_dict["keywords"] else []
            flags = json.loads(r_dict["safety_flags"]) if r_dict["safety_flags"] else []
            mem_resp = MemoryResponse(
                id=r_dict["id"],
                title=r_dict["title"],
                lesson=r_dict["lesson"],
                category=r_dict["category"],
                source_feedback_id=r_dict["source_feedback_id"],
                source_proposal_id=r_dict["source_proposal_id"],
                task_domain=r_dict["task_domain"],
                confidence_score=r_dict["confidence_score"],
                validation_status=r_dict["validation_status"],
                status=r_dict["status"],
                version=r_dict["version"],
                usage_count=r_dict["usage_count"],
                last_used_at=r_dict["last_used_at"],
                keywords=kws,
                privacy_safety_passed=bool(r_dict["privacy_safety_passed"]),
                safety_flags=flags,
                review_notes=r_dict["review_notes"],
                created_at=r_dict["created_at"],
                updated_at=r_dict["updated_at"],
            )
            results.append(
                MemoryRetrievalItem(
                    memory=mem_resp,
                    relevance_score=round(score, 3),
                    matched_keywords=matched_kw,
                )
            )

        return results

    def record_usage(self, memory_ids: List[str]) -> None:
        """Increment usage count and update last_used_at for retrieved memories."""
        if not memory_ids:
            return

        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            with get_db_connection(self._db_path) as conn:
                cursor = conn.cursor()
                for mid in memory_ids:
                    cursor.execute(
                        """
                        UPDATE adaptive_memories
                        SET usage_count = usage_count + 1,
                            last_used_at = ?
                        WHERE id = ?;
                        """,
                        (now_iso, mid),
                    )
                conn.commit()

            for mid in memory_ids:
                self.record_provenance(
                    memory_id=mid,
                    action="retrieved",
                    actor="agent_chat",
                    details={"used_at": now_iso},
                )
        except Exception as exc:
            logger.error("Failed to record memory usage for %s: %s", memory_ids, exc)

    def test_retrieval(self, request: MemoryRetrievalTestRequest) -> MemoryRetrievalTestResponse:
        """Execute a test retrieval query without recording usage or invoking Gemini."""
        retrieved = self.retrieve_relevant_memories(
            prompt=request.prompt,
            task_domain=request.task_domain,
            limit=request.limit,
        )
        return MemoryRetrievalTestResponse(
            retrieved=retrieved,
            count=len(retrieved),
            prompt=request.prompt,
            retrieval_enabled=self.is_retrieval_enabled,
        )


# Global singleton bound to default DB path
memory_service = MemoryService()
