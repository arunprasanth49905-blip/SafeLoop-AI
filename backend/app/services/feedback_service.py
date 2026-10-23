import json
from datetime import datetime, timezone
from typing import List, Optional

from app.core.database import get_db_connection
from app.core.logging import logger
from app.models.schemas import (
    EvaluationResponse,
    FeedbackCreateRequest,
    FeedbackListResponse,
    FeedbackResponse,
    FeedbackStatsResponse,
)


class FeedbackService:
    """Service encapsulating database persistence and queries for feedback records."""

    def __init__(self, db_path: Optional[str] = None):
        self._db_path = db_path

    def _row_to_feedback(self, row) -> FeedbackResponse:
        """Map SQLite row to FeedbackResponse, including optional evaluation if joined."""
        evaluation = None
        evaluation_status = "unevaluated"
        decision = None
        explanation = None
        quality_score = None
        is_safe = None
        evaluated_at = None

        if "eval_id" in row.keys() and row["eval_id"] is not None:
            raw_flags = row["safety_flags"]
            try:
                flags = json.loads(raw_flags) if raw_flags else []
            except Exception:
                flags = []

            evaluation_status = "evaluated"
            decision = row["decision"]
            explanation = row["explanation"]
            quality_score = float(row["quality_score"]) if row["quality_score"] is not None else None
            is_safe = bool(row["is_safe"]) if row["is_safe"] is not None else None
            evaluated_at = row["evaluated_at"]

            rel_score = float(row["relevance_score"]) if row["relevance_score"] is not None else None
            spec_score = float(row["specificity_score"]) if row["specificity_score"] is not None else None
            ev_score = float(row["evidence_score"]) if row["evidence_score"] is not None else None
            cons_score = float(row["consistency_score"]) if row["consistency_score"] is not None else None
            dup_score = float(row["non_duplication_score"]) if row["non_duplication_score"] is not None else None
            safety_reason = row["safety_reason"]
            eval_version = row["evaluator_version"]
            has_ctx = bool(row["has_context"])

            evaluation = EvaluationResponse(
                id=row["eval_id"],
                feedback_id=row["id"],
                quality_score=quality_score if quality_score is not None else 0.0,
                relevance_score=rel_score if rel_score is not None else 0.0,
                specificity_score=spec_score if spec_score is not None else 0.0,
                evidence_score=ev_score if ev_score is not None else 0.0,
                consistency_score=cons_score if cons_score is not None else 0.0,
                non_duplication_score=dup_score if dup_score is not None else 0.0,
                is_safe=bool(is_safe),
                safety_flags=flags,
                safety_reason=safety_reason,
                decision=decision,
                explanation=explanation,
                evaluated_at=evaluated_at,
                evaluator_version=eval_version,
                has_context=has_ctx,
            )
        else:
            rel_score = None
            spec_score = None
            ev_score = None
            cons_score = None
            dup_score = None
            flags = []
            safety_reason = None
            eval_version = None
            has_ctx = None

        return FeedbackResponse(
            id=row["id"],
            task_id=row["task_id"],
            rating=row["rating"],
            correction=row["correction"],
            comment=row["comment"],
            created_at=row["created_at"],
            evaluation_status=evaluation_status,
            decision=decision,
            explanation=explanation,
            quality_score=quality_score,
            relevance_score=rel_score,
            specificity_score=spec_score,
            evidence_score=ev_score,
            consistency_score=cons_score,
            non_duplication_score=dup_score,
            is_safe=is_safe,
            safety_flags=flags,
            safety_reason=safety_reason,
            evaluated_at=evaluated_at,
            evaluator_version=eval_version,
            has_context=has_ctx,
            evaluation_decision=decision,
            reason=explanation,
            evaluation=evaluation,
        )

    def create_feedback(self, data: FeedbackCreateRequest) -> FeedbackResponse:
        """Persist a new feedback submission into SQLite."""
        created_at = datetime.now(timezone.utc).isoformat()
        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO feedback (task_id, rating, correction, comment, created_at)
                VALUES (?, ?, ?, ?, ?);
                """,
                (
                    data.task_id,
                    data.rating,
                    data.correction,
                    data.comment,
                    created_at,
                ),
            )
            feedback_id = cursor.lastrowid
            conn.commit()

        logger.info(
            "Feedback record #%d saved (task_id=%s, rating=%s)",
            feedback_id,
            data.task_id,
            data.rating,
        )

        return FeedbackResponse(
            id=feedback_id,
            task_id=data.task_id,
            rating=data.rating,
            correction=data.correction,
            comment=data.comment,
            created_at=created_at,
            evaluation_status="unevaluated",
            decision=None,
            explanation=None,
            quality_score=None,
            relevance_score=None,
            specificity_score=None,
            evidence_score=None,
            consistency_score=None,
            non_duplication_score=None,
            is_safe=None,
            safety_flags=[],
            safety_reason=None,
            evaluated_at=None,
            evaluator_version=None,
            has_context=None,
            evaluation_decision=None,
            reason=None,
            evaluation=None,
        )

    def get_feedback_by_id(self, feedback_id: int) -> Optional[FeedbackResponse]:
        """Retrieve a specific feedback record by its primary key ID with evaluation if present."""
        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT f.id, f.task_id, f.rating, f.correction, f.comment, f.created_at,
                       e.id as eval_id, e.quality_score, e.relevance_score, e.specificity_score,
                       e.evidence_score, e.consistency_score, e.non_duplication_score,
                       e.is_safe, e.safety_flags, e.safety_reason, e.decision, e.explanation,
                       e.evaluated_at, e.evaluator_version, e.has_context
                FROM feedback f
                LEFT JOIN evaluations e ON e.feedback_id = f.id
                WHERE f.id = ?;
                """,
                (feedback_id,),
            )
            row = cursor.fetchone()
            if not row:
                return None
            return self._row_to_feedback(row)

    def list_feedback(
        self,
        limit: int = 50,
        offset: int = 0,
        task_id: Optional[str] = None,
        rating: Optional[str] = None,
    ) -> FeedbackListResponse:
        """Retrieve paginated feedback records with optional filtering and joined evaluations."""
        limit = max(1, min(limit, 100))
        offset = max(0, offset)

        conditions: List[str] = []
        params: List[object] = []

        if task_id:
            conditions.append("f.task_id = ?")
            params.append(task_id.strip())

        if rating:
            conditions.append("f.rating = ?")
            params.append(rating.strip().lower())

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""

        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()

            # Count total matching rows
            count_query = f"SELECT COUNT(*) FROM feedback f {where_clause};"
            cursor.execute(count_query, params)
            total = cursor.fetchone()[0]

            # Fetch paginated rows with evaluation data
            select_query = f"""
                SELECT f.id, f.task_id, f.rating, f.correction, f.comment, f.created_at,
                       e.id as eval_id, e.quality_score, e.relevance_score, e.specificity_score,
                       e.evidence_score, e.consistency_score, e.non_duplication_score,
                       e.is_safe, e.safety_flags, e.safety_reason, e.decision, e.explanation,
                       e.evaluated_at, e.evaluator_version, e.has_context
                FROM feedback f
                LEFT JOIN evaluations e ON e.feedback_id = f.id
                {where_clause}
                ORDER BY f.created_at DESC, f.id DESC
                LIMIT ? OFFSET ?;
            """
            cursor.execute(select_query, params + [limit, offset])
            rows = cursor.fetchall()
            items = [self._row_to_feedback(row) for row in rows]

        return FeedbackListResponse(
            items=items,
            total=total,
            limit=limit,
            offset=offset,
        )

    def get_stats(self) -> FeedbackStatsResponse:
        """Compute aggregate feedback statistics."""
        with get_db_connection(self._db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT
                    COUNT(*) as total_count,
                    COALESCE(SUM(CASE WHEN rating = 'helpful' THEN 1 ELSE 0 END), 0) as helpful_count,
                    COALESCE(SUM(CASE WHEN rating = 'not_helpful' THEN 1 ELSE 0 END), 0) as not_helpful_count,
                    COALESCE(SUM(CASE WHEN rating = 'correction' THEN 1 ELSE 0 END), 0) as correction_count
                FROM feedback;
                """
            )
            row = cursor.fetchone()
            total = int(row["total_count"] or 0)
            helpful = int(row["helpful_count"] or 0)
            not_helpful = int(row["not_helpful_count"] or 0)
            correction = int(row["correction_count"] or 0)

            ratio = round(helpful / total, 4) if total > 0 else 0.0

            return FeedbackStatsResponse(
                total_count=total,
                helpful_count=helpful,
                not_helpful_count=not_helpful,
                correction_count=correction,
                helpful_ratio=ratio,
            )


# Default singleton instance
feedback_service = FeedbackService()
