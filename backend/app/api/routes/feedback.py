"""Feedback API endpoints for SafeLoop AI continuous improvement."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Path, Query, status

from app.models.schemas import (
    ErrorResponse,
    FeedbackCreateRequest,
    FeedbackListResponse,
    FeedbackResponse,
    FeedbackStatsResponse,
)
from app.services.feedback_service import feedback_service

router = APIRouter(prefix="/api/feedback", tags=["Feedback"])


@router.post(
    "",
    response_model=FeedbackResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Submit user feedback",
    description="Record user feedback (helpful, not_helpful, or correction) optionally associated with an AI task ID.",
    responses={
        422: {"model": ErrorResponse, "description": "Validation error in rating or missing correction text"},
        500: {"model": ErrorResponse, "description": "Internal server or database error"},
    },
)
async def submit_feedback(payload: FeedbackCreateRequest) -> FeedbackResponse:
    """Submit feedback for an AI generation task."""
    try:
        created = feedback_service.create_feedback(payload)
        return created
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to record feedback: {str(exc)}",
        )


@router.get(
    "/stats",
    response_model=FeedbackStatsResponse,
    summary="Get feedback statistics",
    description="Retrieve aggregate metrics: total count, helpful count, not-helpful count, and correction count.",
)
async def get_feedback_stats() -> FeedbackStatsResponse:
    """Retrieve aggregate statistics on recorded feedback."""
    try:
        return feedback_service.get_stats()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve feedback statistics: {str(exc)}",
        )


@router.get(
    "",
    response_model=FeedbackListResponse,
    summary="List feedback records",
    description="Retrieve paginated feedback records with optional filtering by task ID or rating type.",
)
async def list_feedback(
    limit: int = Query(default=50, ge=1, le=100, description="Maximum number of records to return"),
    offset: int = Query(default=0, ge=0, description="Offset for pagination"),
    task_id: Optional[str] = Query(default=None, description="Filter records by associated AI task ID"),
    rating: Optional[str] = Query(default=None, description="Filter records by rating type"),
) -> FeedbackListResponse:
    """Retrieve paginated feedback records."""
    try:
        return feedback_service.list_feedback(
            limit=limit,
            offset=offset,
            task_id=task_id,
            rating=rating,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list feedback records: {str(exc)}",
        )


@router.get(
    "/{feedback_id}",
    response_model=FeedbackResponse,
    summary="Get feedback by ID",
    description="Retrieve a single feedback record by its unique database identifier.",
    responses={
        404: {"model": ErrorResponse, "description": "Feedback record not found"},
    },
)
async def get_feedback(
    feedback_id: int = Path(..., ge=1, description="Unique identifier of the feedback record"),
) -> FeedbackResponse:
    """Retrieve a single feedback record by ID."""
    record = feedback_service.get_feedback_by_id(feedback_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Feedback record #{feedback_id} not found.",
        )
    return record
