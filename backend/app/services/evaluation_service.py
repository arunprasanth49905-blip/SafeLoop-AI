"""Phase 4: Feedback Evaluation and Quality Scoring Engine.

Determines which user feedback is useful, relevant, consistent, and safe enough
to consider for future agent improvement without retraining underlying models.
"""

from datetime import datetime, timezone
import json
import re
from typing import Dict, List, Optional, Set, Tuple

from app.core.database import get_db_connection
from app.core.logging import logger
from app.models.schemas import (
    EvaluationDecision,
    EvaluationListResponse,
    EvaluationResponse,
    EvaluationStatsResponse,
)

EVALUATOR_VERSION = "v1.0.0-rules"

# ---------------------------------------------------------------------------
# Safety Rule Definitions (Hard Gate)
# ---------------------------------------------------------------------------

SAFETY_PATTERNS: List[Tuple[str, str]] = [
    # Prompt injection / jailbreak patterns
    (r"(?i)\bignore\s+(all\s+)?(previous|prior)\s+instructions\b", "prompt_injection"),
    (r"(?i)\bdisregard\s+(all\s+)?(previous|prior)\s+instructions\b", "prompt_injection"),
    (r"(?i)\bforget\s+(all\s+)?(previous|prior)\s+instructions\b", "prompt_injection"),
    (r"(?i)\byou\s+are\s+now\s+(an?\s+)?(unrestricted|jailbroken|evil|dan\s+mode)\b", "jailbreak_attempt"),
    (r"(?i)\bdeveloper\s+mode\s+enabled\b", "jailbreak_attempt"),
    (r"(?i)\bbypass\s+(all\s+)?(safety|content)\s+filters?\b", "safety_bypass"),
    (r"(?i)\bsystem\s+prompt\s*:\s*override\b", "system_override"),

    # Secret / credential extraction patterns
    (r"(?i)\b(print|reveal|show|dump|expose|leak)\s+(your\s+)?(api[_\s]?key|gemini[_\s]?api[_\s]?key|secret|password|credentials?)\b", "credential_extraction"),
    (r"(?i)\bGEMINI_API_KEY\b", "credential_extraction"),
    (r"(?i)\benv\s+variables?\b", "credential_extraction"),

    # Harmful / destructive system commands & code injection
    (r"(?i)\brm\s+-rf\s+[/~]", "destructive_command"),
    (r"(?i)\bdrop\s+table\s+\w+", "destructive_command"),
    (r"(?i)\bformat\s+[a-z]:\s*[/f]?", "destructive_command"),
    (r"(?i)\bcurl\b.+\|\s*(bash|sh)\b", "malicious_script"),
    (r"(?i)<\s*script\b[^>]*>.*<\s*/\s*script\s*>", "script_injection"),
    (r"(?i)\b(exec|eval)\s*\(\s*['\"].+['\"]\s*\)", "arbitrary_execution"),

    # Exfiltration / data leakage
    (r"(?i)\b(send|exfiltrate|post)\s+(all\s+)?(user\s+data|emails|passwords)\s+to\b", "data_exfiltration"),
]

# Stopwords for relevance token analysis
STOPWORDS: Set[str] = {
    "a", "about", "above", "after", "again", "against", "all", "am", "an", "and", "any", "are",
    "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but",
    "by", "could", "did", "do", "does", "doing", "down", "during", "each", "few", "for", "from",
    "further", "had", "has", "have", "having", "he", "her", "here", "hers", "herself", "him",
    "himself", "his", "how", "i", "if", "in", "into", "is", "it", "its", "itself", "just", "me",
    "more", "most", "my", "myself", "no", "nor", "not", "now", "of", "off", "on", "once", "only",
    "or", "other", "ought", "our", "ours", "ourselves", "out", "over", "own", "same", "she",
    "should", "so", "some", "such", "than", "that", "the", "their", "theirs", "them", "themselves",
    "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "until",
    "up", "very", "was", "we", "were", "what", "when", "where", "which", "while", "who", "whom",
    "why", "with", "would", "you", "your", "yours", "yourself", "yourselves",
}

# Domain critique keywords used when task context is unavailable
DOMAIN_CRITIQUE_KEYWORDS: Set[str] = {
    "accuracy", "accurate", "algorithm", "answer", "bug", "citation", "code", "complexity",
    "context", "correct", "correction", "dataset", "error", "example", "explanation", "fact",
    "factual", "format", "hallucination", "implementation", "incorrect", "issue", "latency",
    "logic", "memory", "method", "model", "output", "performance", "prompt", "reasoning",
    "response", "syntax", "system", "task", "token", "wrong",
}


def _tokenize(text: Optional[str]) -> Set[str]:
    """Tokenize and normalize text into clean words excluding stopwords."""
    if not text:
        return set()
    raw_tokens = re.findall(r"\b[a-zA-Z0-9_-]{2,}\b", text.lower())
    return {tok for tok in raw_tokens if tok not in STOPWORDS}


def _normalize_text_for_duplication(text: Optional[str]) -> str:
    """Normalize text by stripping run IDs, numbers, punctuation, and extraneous whitespace."""
    if not text:
        return ""
    # Strip run identifiers like 'test run #1792690017', 'run #1792690017', 'task_123'
    t = re.sub(r"(?i)\b(test\s+)?run\s*#?\d+\b", "", text)
    t = re.sub(r"(?i)\btask[_\w-]+\b", "", t)
    t = re.sub(r"\b\d{5,}\b", "", t)
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t).strip().lower()
    return t


class EvaluationService:
    """Service encapsulating feedback evaluation, scoring, decision assignment, and persistence."""

    def __init__(self, db_path: Optional[str] = None):
        self._db_path = db_path

    # -----------------------------------------------------------------------
    # Task Interaction Storage & Retrieval
    # -----------------------------------------------------------------------

    def record_interaction(
        self,
        task_id: str,
        prompt: str,
        response_text: str,
        model: Optional[str] = None,
    ) -> None:
        """Store task prompt and response for future evaluation relevance verification."""
        if not task_id or not prompt:
            return
        created_at = datetime.now(timezone.utc).isoformat()
        try:
            with get_db_connection(self._db_path) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT OR REPLACE INTO task_interactions (task_id, prompt, response_text, model, created_at)
                    VALUES (?, ?, ?, ?, ?);
                    """,
                    (task_id.strip(), prompt.strip(), response_text.strip(), model, created_at),
                )
                conn.commit()
            logger.debug("Task interaction %s recorded for evaluation context.", task_id)
        except Exception as exc:
            logger.warning("Failed to store task interaction %s: %s", task_id, exc)

    def get_interaction(self, task_id: Optional[str]) -> Optional[Dict[str, str]]:
        """Retrieve stored task prompt and response context."""
        if not task_id:
            return None
        try:
            with get_db_connection(self._db_path) as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    SELECT task_id, prompt, response_text, model, created_at
                    FROM task_interactions
                    WHERE task_id = ?;
                    """,
                    (task_id.strip(),),
                )
                row = cursor.fetchone()
                if row:
                    return {
                        "task_id": row["task_id"],
                        "prompt": row["prompt"],
                        "response_text": row["response_text"],
                        "model": row["model"],
                        "created_at": row["created_at"],
                    }
        except Exception as exc:
            logger.warning("Error fetching task interaction %s: %s", task_id, exc)
        return None

    # -----------------------------------------------------------------------
    # Core Evaluation Engine (Testable Rules)
    # -----------------------------------------------------------------------

    def evaluate_safety(
        self, comment: Optional[str], correction: Optional[str]
    ) -> Tuple[bool, List[str], Optional[str]]:
        """Assess feedback safety.

        Safety acts as a non-negotiable hard gate: any detected violation
        immediately flags the feedback as unsafe, preventing approval.
        """
        combined_text = f"{comment or ''} {correction or ''}".strip()
        if not combined_text:
            return True, [], "No text content to evaluate; default safe."

        flags: List[str] = []
        for pattern, flag_name in SAFETY_PATTERNS:
            if re.search(pattern, combined_text):
                flags.append(flag_name)

        if flags:
            reason = f"Safety gate triggered: detected [{', '.join(sorted(set(flags)))}]."
            return False, sorted(set(flags)), reason

        return True, [], "Passed all safety rules and checks."

    def evaluate_relevance(
        self,
        feedback_content: str,
        interaction: Optional[Dict[str, str]],
    ) -> Tuple[float, str, bool]:
        """Assess relevance of feedback to the task context.

        Returns: (relevance_score [0..25], explanation, has_context [bool])
        """
        fb_tokens = _tokenize(feedback_content)
        if not fb_tokens:
            if interaction:
                return 16.0, "Rating submitted for known task interaction without additional text critique.", True
            return 12.0, "Minimal feedback content provided; baseline relevance applied.", False

        if interaction:
            ctx_text = f"{interaction.get('prompt', '')} {interaction.get('response_text', '')}"
            ctx_tokens = _tokenize(ctx_text)

            if not ctx_tokens:
                return 15.0, "Context present but lacking distinctive tokens; moderate score assigned.", True

            overlap = fb_tokens.intersection(ctx_tokens)
            overlap_ratio = len(overlap) / max(len(fb_tokens), 1)

            if overlap_ratio >= 0.35 or len(overlap) >= 4:
                return 25.0, f"High relevance: strong overlap with task ({len(overlap)} matching concepts).", True
            elif overlap_ratio >= 0.15 or len(overlap) >= 2:
                return 20.0, f"Moderate relevance: references task concepts ({len(overlap)} matching terms).", True
            elif len(overlap) == 1:
                return 14.0, "Weak relevance: minimal direct overlap with task content.", True
            else:
                # Check for domain critique keywords
                domain_overlap = fb_tokens.intersection(DOMAIN_CRITIQUE_KEYWORDS)
                if domain_overlap:
                    return 10.0, "Feedback uses general critique terms but does not directly reference task content.", True
                return 3.0, "Irrelevant: feedback content has zero overlap with the task or domain.", True

        # Missing context limitation
        domain_overlap = fb_tokens.intersection(DOMAIN_CRITIQUE_KEYWORDS)
        if domain_overlap:
            return 16.0, "Original task context missing; scored via domain critique relevance.", False

        # Random or gibberish check
        if len(feedback_content) > 30 and len(fb_tokens) < 3:
            return 2.0, "Original task context missing and content appears non-informative/gibberish.", False

        return 12.0, "Original task context missing; evaluated on feedback content alone.", False

    def evaluate_specificity(
        self,
        rating: str,
        comment: Optional[str],
        correction: Optional[str],
    ) -> Tuple[float, str]:
        """Assess how specific and actionable the feedback is (0..20 points)."""
        clean_comment = (comment or "").strip()
        clean_correction = (correction or "").strip()
        total_len = len(clean_comment) + len(clean_correction)

        if rating == "correction" and clean_correction:
            if len(clean_correction) >= 50:
                return 20.0, "High specificity: comprehensive corrective demonstration provided."
            elif len(clean_correction) >= 20:
                return 17.0, "Good specificity: concrete correction provided."
            return 13.0, "Moderate specificity: brief correction provided."

        if clean_comment:
            if total_len >= 80:
                return 19.0, "High specificity: detailed, explanatory critique provided."
            elif total_len >= 30:
                return 15.0, "Good specificity: clear explanation of observation."
            elif total_len >= 10:
                return 10.0, "Moderate specificity: short explanatory note."
            elif total_len > 3:
                return 7.0, "Low specificity: very brief/vague comment."
            return 3.0, "Minimal specificity: ambiguous or extremely short comment without context."

        return 4.0, "Minimal specificity: binary vote without explanatory details."

    def evaluate_evidence(
        self,
        rating: str,
        comment: Optional[str],
        correction: Optional[str],
        has_context: bool,
    ) -> Tuple[float, str]:
        """Assess concrete evidence, examples, code, or citations (0..20 points)."""
        clean_correction = (correction or "").strip()
        clean_comment = (comment or "").strip()

        # Gold corrective output demonstration is the highest form of evidence
        if rating == "correction" and clean_correction:
            # Check for structured evidence (code blocks, quotes, algorithms)
            if any(marker in clean_correction for marker in ["def ", "class ", "return ", "http", "SELECT ", "O(", "`", "{", "->"]):
                return 20.0, "Exceptional evidence: includes formal code or algorithmic demonstration."
            if len(clean_correction) >= 40:
                return 18.0, "Strong evidence: detailed corrective output demonstration."
            return 14.0, "Moderate evidence: corrective output demonstration provided."

        if clean_comment:
            # Check for citations, error codes, or technical indicators
            if any(ind in clean_comment for ind in ["error", "line ", "because", "instead of", "expected", "got", "traceback"]):
                return 15.0, "Good evidence: includes technical indicators and causal reasoning."
            if len(clean_comment) >= 40:
                score = 12.0 if has_context else 10.0
                return score, "Moderate evidence: descriptive rationale without concrete artifact."
            if len(clean_comment) > 3:
                score = 6.0 if has_context else 5.0
                return score, "Low evidence: opinion-based feedback lacking concrete proof."
            return 2.0, "Insufficient evidence: extremely brief or ambiguous feedback lacking proof."

        return 2.0, "Insufficient evidence: no supporting explanation or demonstration provided."

    def evaluate_consistency(
        self,
        rating: str,
        comment: Optional[str],
        correction: Optional[str],
        prior_task_feedback: List[Dict[str, object]],
    ) -> Tuple[float, str]:
        """Assess internal consistency and cross-submission consistency (0..20 points)."""
        clean_comment = (comment or "").strip().lower()

        # Check internal sentiment contradiction
        strong_negatives = ["awful", "terrible", "completely wrong", "totally broken", "useless", "garbage", "hallucination"]
        strong_positives = ["perfect", "flawless", "brilliant", "100% correct", "excellent", "superb"]

        if rating == "helpful" and any(neg in clean_comment for neg in strong_negatives):
            return 4.0, "Internal contradiction: rated 'helpful' but comment expresses strong negative critique."

        if rating == "not_helpful" and any(pos in clean_comment for pos in strong_positives):
            return 4.0, "Internal contradiction: rated 'not_helpful' but comment expresses pure praise."

        # Check cross-feedback consistency with other submissions for same task
        if prior_task_feedback:
            conflicting_ratings = [
                f for f in prior_task_feedback
                if (f["rating"] == "helpful" and rating in ("not_helpful", "correction"))
                or (f["rating"] in ("not_helpful", "correction") and rating == "helpful")
            ]
            if len(conflicting_ratings) >= 2:
                return 10.0, "Moderate consistency: conflicts with multiple existing submissions on this task."
            elif len(conflicting_ratings) == 1:
                return 14.0, "Acceptable consistency: minor divergence from previous submission on this task."

        return 20.0, "High consistency: internally coherent and aligns with existing records."

    def evaluate_duplication(
        self,
        current_id: Optional[int],
        feedback_content: str,
        prior_feedback: List[Dict[str, object]],
    ) -> Tuple[float, str]:
        """Assess whether the feedback is redundant with existing submissions (0..15 points)."""
        if not prior_feedback:
            return 15.0, "Unique submission: no matching previous feedback records."

        norm_curr = _normalize_text_for_duplication(feedback_content)
        curr_tokens = _tokenize(norm_curr)
        if not curr_tokens or len(norm_curr) < 5:
            return 10.0, "Minimal text content; baseline non-duplication score applied."

        max_similarity = 0.0
        matched_id: Optional[int] = None
        for prior in prior_feedback:
            # Skip comparing with self if re-evaluating
            if current_id and prior.get("id") == current_id:
                continue

            prior_content = f"{prior.get('comment') or ''} {prior.get('correction') or ''}".strip()
            norm_prior = _normalize_text_for_duplication(prior_content)
            prior_tokens = _tokenize(norm_prior)
            if not prior_tokens or len(norm_prior) < 5:
                continue

            intersection = curr_tokens.intersection(prior_tokens)
            union = curr_tokens.union(prior_tokens)
            sim = len(intersection) / max(len(union), 1)
            if sim > max_similarity:
                max_similarity = sim
                matched_id = prior.get("id")

        if max_similarity >= 0.85:
            ref = f" #{matched_id}" if matched_id else ""
            return 2.0, f"Duplicate detected: high content similarity ({round(max_similarity * 100)}%) with prior feedback{ref}."
        elif max_similarity >= 0.50:
            ref = f" #{matched_id}" if matched_id else ""
            return 8.0, f"Partial duplicate: notable conceptual overlap ({round(max_similarity * 100)}%) with prior feedback{ref}."

        return 15.0, "Distinct submission: novel critique or distinct formulation."

    # -----------------------------------------------------------------------
    # Decision Assignment
    # -----------------------------------------------------------------------

    def assign_decision(
        self,
        quality_score: float,
        is_safe: bool,
        relevance_score: float,
        evidence_score: float,
        non_duplication_score: float,
        consistency_score: float,
        safety_reason: Optional[str],
        relevance_reason: str,
        evidence_reason: str,
        is_ambiguous_or_brief: bool = False,
        brief_text: str = "",
    ) -> Tuple[EvaluationDecision, str]:
        """Assign final decision based on safety gate, score thresholds, and evidence sufficiency."""
        # 1. Safety Gate: Non-negotiable override (unsafe feedback cannot be approved regardless of score)
        if not is_safe:
            explanation = f"Rejected (Safety gate triggered: {safety_reason or 'potential safety violation detected'})"
            return "rejected", explanation

        # 2. Relevance threshold check
        if relevance_score < 10.0:
            explanation = f"Rejected (Irrelevant: {relevance_reason})"
            return "rejected", explanation

        # 3. Ambiguous / extremely brief feedback check (e.g. "ml", "ok")
        if is_ambiguous_or_brief:
            explanation = (
                f"Needs Review (Ambiguous or extremely brief feedback ('{brief_text}'); insufficient actionable detail provided)."
            )
            return "needs_review", explanation

        # 4. High Quality & Well-Supported -> Approved
        if (
            quality_score >= 70.0
            and evidence_score >= 10.0
            and non_duplication_score >= 8.0
            and consistency_score >= 10.0
        ):
            explanation = f"Approved (Score: {quality_score}/100; meets quality requirements and passed safety checks)."
            return "approved", explanation

        # 5. Low Quality (< 40) with no evidence -> Rejected
        if quality_score < 40.0 and evidence_score < 6.0:
            explanation = f"Rejected (Low quality score {quality_score}/100 with insufficient actionable critique)."
            return "rejected", explanation

        # 6. Middle ground -> Needs Review
        reasons: List[str] = []
        if quality_score < 70.0:
            reasons.append("quality score below auto-approval threshold")
        if evidence_score < 10.0:
            reasons.append(f"insufficient supporting evidence: {evidence_reason.lower().rstrip('.')}")
        if non_duplication_score < 8.0:
            reasons.append("possible duplicate of earlier submission")
        if consistency_score < 10.0:
            reasons.append("conflicting signals detected")

        reason_text = "; ".join(reasons) if reasons else "more evidence or clarification is needed"
        explanation = f"Needs Review ({reason_text})."
        return "needs_review", explanation

    # -----------------------------------------------------------------------
    # Full Evaluation Flow & Database Persistence
    # -----------------------------------------------------------------------

    def evaluate_feedback(self, feedback_id: int) -> EvaluationResponse:
        """Run complete Phase 4 evaluation on a feedback record and persist result."""
        # 1. Fetch target feedback record
        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, task_id, rating, correction, comment, created_at
                FROM feedback
                WHERE id = ?;
                """,
                (feedback_id,),
            )
            fb = cursor.fetchone()

        if not fb:
            raise ValueError(f"Feedback record #{feedback_id} not found.")

        task_id = fb["task_id"]
        rating = fb["rating"]
        comment = fb["comment"]
        correction = fb["correction"]
        combined_content = f"{comment or ''} {correction or ''}".strip()

        # 2. Retrieve task interaction context if available
        interaction = self.get_interaction(task_id) if task_id else None

        # 3. Retrieve prior feedback for consistency (same task) and duplication (global & task)
        prior_task_feedback: List[Dict[str, object]] = []
        global_prior_feedback: List[Dict[str, object]] = []
        try:
            with get_db_connection(self._db_path) as conn:
                cursor = conn.cursor()
                if task_id:
                    cursor.execute(
                        """
                        SELECT id, task_id, rating, comment, correction
                        FROM feedback
                        WHERE task_id = ? AND id != ?;
                        """,
                        (task_id, feedback_id),
                    )
                    prior_task_feedback = [dict(r) for r in cursor.fetchall()]

                cursor.execute(
                    """
                    SELECT id, task_id, rating, comment, correction
                    FROM feedback
                    WHERE id != ?
                    ORDER BY id DESC
                    LIMIT 100;
                    """,
                    (feedback_id,),
                )
                global_prior_feedback = [dict(r) for r in cursor.fetchall()]
        except Exception as exc:
            logger.warning("Failed to query prior feedback: %s", exc)

        # 4. Compute Scores via rules
        is_safe, safety_flags, safety_reason = self.evaluate_safety(comment, correction)
        relevance_score, relevance_reason, has_context = self.evaluate_relevance(combined_content, interaction)
        specificity_score, _ = self.evaluate_specificity(rating, comment, correction)
        evidence_score, evidence_reason = self.evaluate_evidence(rating, comment, correction, has_context)
        consistency_score, _ = self.evaluate_consistency(rating, comment, correction, prior_task_feedback)
        non_duplication_score, _ = self.evaluate_duplication(feedback_id, combined_content, global_prior_feedback)

        quality_score = round(
            relevance_score + specificity_score + evidence_score + consistency_score + non_duplication_score,
            1,
        )
        quality_score = max(0.0, min(quality_score, 100.0))

        # Check for ambiguous or extremely brief feedback (e.g. "ml", "ok")
        clean_comment = (comment or "").strip()
        clean_correction = (correction or "").strip()
        is_ambiguous_or_brief = bool(clean_comment and len(clean_comment) <= 3 and not clean_correction)

        # 5. Assign Decision
        decision, explanation = self.assign_decision(
            quality_score=quality_score,
            is_safe=is_safe,
            relevance_score=relevance_score,
            evidence_score=evidence_score,
            non_duplication_score=non_duplication_score,
            consistency_score=consistency_score,
            safety_reason=safety_reason,
            relevance_reason=relevance_reason,
            evidence_reason=evidence_reason,
            is_ambiguous_or_brief=is_ambiguous_or_brief,
            brief_text=clean_comment,
        )

        evaluated_at = datetime.now(timezone.utc).isoformat()

        # 6. Archive prior evaluation into evaluation_history table if re-evaluating
        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, feedback_id, quality_score, decision, explanation,
                       evaluator_version, evaluated_at
                FROM evaluations
                WHERE feedback_id = ?;
                """,
                (feedback_id,),
            )
            existing_eval = cursor.fetchone()
            if existing_eval:
                cursor.execute(
                    """
                    INSERT INTO evaluation_history (
                        evaluation_id, feedback_id, quality_score, decision, explanation,
                        evaluator_version, evaluated_at, superseded_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?);
                    """,
                    (
                        existing_eval["id"],
                        existing_eval["feedback_id"],
                        existing_eval["quality_score"],
                        existing_eval["decision"],
                        existing_eval["explanation"],
                        existing_eval["evaluator_version"],
                        existing_eval["evaluated_at"],
                        evaluated_at,
                    ),
                )

            # Persist active evaluation to SQLite
            cursor.execute(
                """
                INSERT INTO evaluations (
                    feedback_id, quality_score, relevance_score, specificity_score,
                    evidence_score, consistency_score, non_duplication_score,
                    is_safe, safety_flags, safety_reason, decision, explanation,
                    evaluated_at, evaluator_version, has_context
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(feedback_id) DO UPDATE SET
                    quality_score = excluded.quality_score,
                    relevance_score = excluded.relevance_score,
                    specificity_score = excluded.specificity_score,
                    evidence_score = excluded.evidence_score,
                    consistency_score = excluded.consistency_score,
                    non_duplication_score = excluded.non_duplication_score,
                    is_safe = excluded.is_safe,
                    safety_flags = excluded.safety_flags,
                    safety_reason = excluded.safety_reason,
                    decision = excluded.decision,
                    explanation = excluded.explanation,
                    evaluated_at = excluded.evaluated_at,
                    evaluator_version = excluded.evaluator_version,
                    has_context = excluded.has_context;
                """,
                (
                    feedback_id,
                    quality_score,
                    relevance_score,
                    specificity_score,
                    evidence_score,
                    consistency_score,
                    non_duplication_score,
                    1 if is_safe else 0,
                    json.dumps(safety_flags),
                    safety_reason,
                    decision,
                    explanation,
                    evaluated_at,
                    EVALUATOR_VERSION,
                    1 if has_context else 0,
                ),
            )
            cursor.execute("SELECT id FROM evaluations WHERE feedback_id = ?;", (feedback_id,))
            eval_row = cursor.fetchone()
            eval_id = eval_row["id"] if eval_row else cursor.lastrowid
            conn.commit()
            conn.commit()

        logger.info(
            "Feedback #%d evaluated: decision=%s, score=%.1f (safe=%s, version=%s)",
            feedback_id,
            decision,
            quality_score,
            is_safe,
            EVALUATOR_VERSION,
        )

        return EvaluationResponse(
            id=eval_id,
            feedback_id=feedback_id,
            quality_score=quality_score,
            relevance_score=relevance_score,
            specificity_score=specificity_score,
            evidence_score=evidence_score,
            consistency_score=consistency_score,
            non_duplication_score=non_duplication_score,
            is_safe=is_safe,
            safety_flags=safety_flags,
            safety_reason=safety_reason,
            decision=decision,
            explanation=explanation,
            evaluated_at=evaluated_at,
            evaluator_version=EVALUATOR_VERSION,
            has_context=has_context,
        )

    # -----------------------------------------------------------------------
    # Query Endpoints
    # -----------------------------------------------------------------------

    def get_evaluation_by_id(self, evaluation_id: int) -> Optional[EvaluationResponse]:
        """Fetch evaluation record by evaluation primary key."""
        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, feedback_id, quality_score, relevance_score, specificity_score,
                       evidence_score, consistency_score, non_duplication_score,
                       is_safe, safety_flags, safety_reason, decision, explanation,
                       evaluated_at, evaluator_version, has_context
                FROM evaluations
                WHERE id = ?;
                """,
                (evaluation_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_response(row)

    def get_evaluation_by_feedback_id(self, feedback_id: int) -> Optional[EvaluationResponse]:
        """Fetch evaluation record by associated feedback ID."""
        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT id, feedback_id, quality_score, relevance_score, specificity_score,
                       evidence_score, consistency_score, non_duplication_score,
                       is_safe, safety_flags, safety_reason, decision, explanation,
                       evaluated_at, evaluator_version, has_context
                FROM evaluations
                WHERE feedback_id = ?;
                """,
                (feedback_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_response(row)

    def list_evaluations(
        self,
        limit: int = 50,
        offset: int = 0,
        decision: Optional[str] = None,
    ) -> EvaluationListResponse:
        """List paginated evaluation records with optional decision filtering."""
        limit = max(1, min(limit, 100))
        offset = max(0, offset)

        conditions: List[str] = []
        params: List[object] = []

        if decision:
            conditions.append("decision = ?")
            params.append(decision.strip().lower())

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()

            count_query = f"SELECT COUNT(*) FROM evaluations {where_clause};"
            cursor.execute(count_query, params)
            total = cursor.fetchone()[0]

            select_query = f"""
                SELECT id, feedback_id, quality_score, relevance_score, specificity_score,
                       evidence_score, consistency_score, non_duplication_score,
                       is_safe, safety_flags, safety_reason, decision, explanation,
                       evaluated_at, evaluator_version, has_context
                FROM evaluations
                {where_clause}
                ORDER BY evaluated_at DESC, id DESC
                LIMIT ? OFFSET ?;
            """
            cursor.execute(select_query, params + [limit, offset])
            rows = cursor.fetchall()
            items = [self._row_to_response(row) for row in rows]

        return EvaluationListResponse(
            items=items,
            total=total,
            limit=limit,
            offset=offset,
        )

    def get_stats(self) -> EvaluationStatsResponse:
        """Calculate aggregate evaluation statistics grouped by decision."""
        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT
                    COUNT(*) as total_evaluated,
                    COALESCE(SUM(CASE WHEN decision = 'approved' THEN 1 ELSE 0 END), 0) as approved_count,
                    COALESCE(SUM(CASE WHEN decision = 'needs_review' THEN 1 ELSE 0 END), 0) as needs_review_count,
                    COALESCE(SUM(CASE WHEN decision = 'rejected' THEN 1 ELSE 0 END), 0) as rejected_count,
                    COALESCE(AVG(quality_score), 0.0) as average_score
                FROM evaluations;
                """
            )
            row = cursor.fetchone()
            total = int(row["total_evaluated"] or 0)
            approved = int(row["approved_count"] or 0)
            needs_review = int(row["needs_review_count"] or 0)
            rejected = int(row["rejected_count"] or 0)
            avg_score = round(float(row["average_score"] or 0.0), 1)

        return EvaluationStatsResponse(
            total_evaluated=total,
            approved_count=approved,
            needs_review_count=needs_review,
            rejected_count=rejected,
            average_quality_score=avg_score,
        )

    def _row_to_response(self, row: Dict[str, object]) -> EvaluationResponse:
        """Map SQLite row to Pydantic EvaluationResponse."""
        raw_flags = row["safety_flags"]
        try:
            flags = json.loads(raw_flags) if raw_flags else []
        except Exception:
            flags = []

        return EvaluationResponse(
            id=row["id"],
            feedback_id=row["feedback_id"],
            quality_score=float(row["quality_score"]),
            relevance_score=float(row["relevance_score"]),
            specificity_score=float(row["specificity_score"]),
            evidence_score=float(row["evidence_score"]),
            consistency_score=float(row["consistency_score"]),
            non_duplication_score=float(row["non_duplication_score"]),
            is_safe=bool(row["is_safe"]),
            safety_flags=flags,
            safety_reason=row["safety_reason"],
            decision=row["decision"],
            explanation=row["explanation"],
            evaluated_at=row["evaluated_at"],
            evaluator_version=row["evaluator_version"],
            has_context=bool(row["has_context"]),
        )


# Singleton instance
evaluation_service = EvaluationService()
