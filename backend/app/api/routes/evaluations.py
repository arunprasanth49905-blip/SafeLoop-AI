"""Phase 4: Feedback Evaluation API Endpoints.

Provides endpoints to evaluate user feedback records, compute transparent
quality scores (0-100), enforce the safety gate, and retrieve evaluations.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Path, Query, status

from app.models.schemas import (
    ErrorResponse,
    EvaluationListResponse,
    EvaluationResponse,
    EvaluationStatsResponse,
)
from app.services.evaluation_service import evaluation_service

router = APIRouter(prefix="/api/evaluations", tags=["Evaluation"])


@router.post(
    "/evaluate/{feedback_id}",
    response_model=EvaluationResponse,
    status_code=status.HTTP_200_OK,
    summary="Evaluate a feedback record",
    description="Evaluates a feedback record using testable rules across relevance, specificity, evidence, consistency, and safety gate.",
    responses={
        404: {"model": ErrorResponse, "description": "Feedback record not found"},
        500: {"model": ErrorResponse, "description": "Internal evaluation error"},
    },
)
async def evaluate_feedback_record(
    feedback_id: int = Path(..., ge=1, description="Unique ID of the feedback record to evaluate"),
) -> EvaluationResponse:
    """Evaluate one feedback record and store the resulting evaluation decision and score."""
    try:
        return evaluation_service.evaluate_feedback(feedback_id)
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(val_err),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to evaluate feedback #{feedback_id}: {str(exc)}",
        )


@router.get(
    "/stats",
    response_model=EvaluationStatsResponse,
    summary="Get evaluation statistics",
    description="Retrieve aggregate metrics for evaluated feedback: total evaluated, approved, needs review, rejected, and average score.",
)
async def get_evaluation_stats() -> EvaluationStatsResponse:
    """Retrieve aggregate statistics on completed evaluations."""
    try:
        return evaluation_service.get_stats()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve evaluation statistics: {str(exc)}",
        )


@router.get(
    "/feedback/{feedback_id}",
    response_model=EvaluationResponse,
    summary="Get evaluation by feedback ID",
    description="Retrieve the latest evaluation record for a specific feedback ID.",
    responses={
        404: {"model": ErrorResponse, "description": "Evaluation for this feedback ID not found"},
    },
)
async def get_evaluation_by_feedback_id(
    feedback_id: int = Path(..., ge=1, description="Associated feedback ID"),
) -> EvaluationResponse:
    """Retrieve evaluation record by feedback ID."""
    evaluation = evaluation_service.get_evaluation_by_feedback_id(feedback_id)
    if not evaluation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No evaluation found for feedback #{feedback_id}.",
        )
    return evaluation


@router.get(
    "/{evaluation_id}",
    response_model=EvaluationResponse,
    summary="Get evaluation by ID",
    description="Retrieve a single evaluation record by its evaluation ID.",
    responses={
        404: {"model": ErrorResponse, "description": "Evaluation record not found"},
    },
)
async def get_evaluation_by_id(
    evaluation_id: int = Path(..., ge=1, description="Unique identifier of the evaluation record"),
) -> EvaluationResponse:
    """Retrieve an evaluation record by evaluation ID."""
    evaluation = evaluation_service.get_evaluation_by_id(evaluation_id)
    if not evaluation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evaluation record #{evaluation_id} not found.",
        )
    return evaluation


@router.get(
    "",
    response_model=EvaluationListResponse,
    summary="List evaluation records",
    description="Retrieve paginated evaluation records with optional decision filtering (approved, needs_review, rejected).",
)
async def list_evaluations(
    limit: int = Query(default=50, ge=1, le=100, description="Maximum number of evaluations to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
    decision: Optional[str] = Query(default=None, description="Filter evaluations by decision (approved, needs_review, rejected)"),
) -> EvaluationListResponse:
    """Retrieve paginated evaluation records."""
    try:
        return evaluation_service.list_evaluations(
            limit=limit,
            offset=offset,
            decision=decision,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list evaluation records: {str(exc)}",
        )
