"""FastAPI router for Phase 6 Persistent Adaptive Memory management."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.core.config import settings
from app.core.logging import logger
from app.models.schemas import (
    MemoryActionRequest,
    MemoryCandidateCreateRequest,
    MemoryCategory,
    MemoryListResponse,
    MemoryResponse,
    MemoryRetrievalConfigResponse,
    MemoryRetrievalConfigUpdateRequest,
    MemoryRetrievalTestRequest,
    MemoryRetrievalTestResponse,
    MemoryStatsResponse,
    MemoryStatus,
    MemoryValidationStatus,
)
from app.services.memory_service import (
    MemoryDuplicateError,
    MemoryNotFoundError,
    MemoryProvenanceError,
    MemorySafetyError,
    MemoryServiceError,
    MemoryStateTransitionError,
    memory_service,
)

router = APIRouter(prefix="/api/memory", tags=["Persistent Adaptive Memory"])


@router.get(
    "/stats",
    response_model=MemoryStatsResponse,
    summary="Get memory statistics",
    description="Returns aggregate counts of total, active, candidate, archived, and rejected memories, plus usage count.",
)
async def get_memory_stats() -> MemoryStatsResponse:
    """Retrieve aggregate statistics on persistent adaptive memories."""
    return memory_service.get_stats()


@router.get(
    "/config/retrieval",
    response_model=MemoryRetrievalConfigResponse,
    summary="Get memory retrieval configuration",
    description="Returns whether adaptive memory retrieval is currently enabled.",
)
async def get_retrieval_config() -> MemoryRetrievalConfigResponse:
    """Check whether dynamic memory retrieval is active."""
    return MemoryRetrievalConfigResponse(
        enabled=memory_service.is_retrieval_enabled,
        max_retrieval_count=settings.memory_max_retrieval_count,
        min_relevance_score=settings.memory_min_relevance_score,
    )


@router.post(
    "/config/retrieval",
    response_model=MemoryRetrievalConfigResponse,
    summary="Toggle memory retrieval configuration",
    description="Enable or disable dynamic memory retrieval in agent chat.",
)
async def update_retrieval_config(payload: MemoryRetrievalConfigUpdateRequest) -> MemoryRetrievalConfigResponse:
    """Toggle dynamic memory retrieval."""
    memory_service.set_retrieval_enabled(payload.enabled)
    return MemoryRetrievalConfigResponse(
        enabled=memory_service.is_retrieval_enabled,
        max_retrieval_count=settings.memory_max_retrieval_count,
        min_relevance_score=settings.memory_min_relevance_score,
    )


@router.post(
    "/retrieve",
    response_model=MemoryRetrievalTestResponse,
    summary="Test memory retrieval for a prompt",
    description="Simulates memory retrieval for a given prompt without altering usage stats or invoking Gemini.",
)
async def test_memory_retrieval(payload: MemoryRetrievalTestRequest) -> MemoryRetrievalTestResponse:
    """Simulate retrieval against active memories."""
    return memory_service.test_retrieval(payload)


@router.get(
    "",
    response_model=MemoryListResponse,
    summary="List persistent adaptive memories",
    description="Fetch a paginated list of memories with optional filtering by status, validation status, category, or search term.",
)
async def list_memories(
    status: Optional[str] = Query(None, description="Filter by status (candidate, active, archived, rejected)"),
    validation_status: Optional[str] = Query(None, description="Filter by validation status (candidate, approved, rejected)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    task_domain: Optional[str] = Query(None, description="Filter by task domain"),
    search: Optional[str] = Query(None, description="Search in title or lesson"),
    limit: int = Query(50, ge=1, le=100, description="Items per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
) -> MemoryListResponse:
    """Retrieve memories with pagination and filters."""
    return memory_service.list_memories(
        status=status,
        validation_status=validation_status,
        category=category,
        task_domain=task_domain,
        search=search,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{memory_id}",
    response_model=MemoryResponse,
    summary="Get memory details by ID",
    description="Fetch a single memory record including its provenance and version history.",
)
async def get_memory_details(memory_id: str) -> MemoryResponse:
    """Fetch an individual memory record by ID."""
    try:
        return memory_service.get_memory_by_id(memory_id, include_provenance=True)
    except MemoryNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.post(
    "/candidate",
    response_model=MemoryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create memory candidate from eligible source",
    description=(
        "Screen and create a new memory candidate from an approved evaluation, "
        "approved improvement proposal, or verified expert knowledge."
    ),
)
async def create_memory_candidate(payload: MemoryCandidateCreateRequest) -> MemoryResponse:
    """Create a new memory candidate with strict provenance and safety screening."""
    try:
        return memory_service.create_candidate(payload)
    except MemoryProvenanceError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)
    except MemorySafetyError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=exc.message)
    except MemoryDuplicateError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.message)
    except MemoryServiceError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post(
    "/{memory_id}/approve",
    response_model=MemoryResponse,
    summary="Approve memory candidate",
    description="Administrative action promoting a validated candidate to active runtime memory.",
)
async def approve_memory(memory_id: str, payload: Optional[MemoryActionRequest] = None) -> MemoryResponse:
    """Approve a memory candidate and activate it in runtime."""
    try:
        reason = payload.reason if payload else None
        return memory_service.approve_memory(memory_id=memory_id, reason=reason)
    except MemoryNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except MemoryStateTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)


@router.post(
    "/{memory_id}/reject",
    response_model=MemoryResponse,
    summary="Reject memory candidate",
    description="Administrative action rejecting a memory candidate with reason.",
)
async def reject_memory(memory_id: str, payload: Optional[MemoryActionRequest] = None) -> MemoryResponse:
    """Reject a memory candidate."""
    try:
        reason = payload.reason if payload else None
        return memory_service.reject_memory(memory_id=memory_id, reason=reason)
    except MemoryNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except MemoryStateTransitionError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)


@router.post(
    "/{memory_id}/archive",
    response_model=MemoryResponse,
    summary="Archive memory",
    description="Deactivate and archive an outdated memory while preserving auditable history.",
)
async def archive_memory(memory_id: str, payload: Optional[MemoryActionRequest] = None) -> MemoryResponse:
    """Archive an active or candidate memory."""
    try:
        reason = payload.reason if payload else None
        return memory_service.archive_memory(memory_id=memory_id, reason=reason)
    except MemoryNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)


@router.post(
    "/{memory_id}/deactivate",
    response_model=MemoryResponse,
    summary="Deactivate memory",
    description="Convenience alias to archive/deactivate an active memory.",
)
async def deactivate_memory(memory_id: str, payload: Optional[MemoryActionRequest] = None) -> MemoryResponse:
    """Deactivate memory (alias for archive)."""
    try:
        reason = payload.reason if payload else None
        return memory_service.archive_memory(memory_id=memory_id, reason=reason or "Deactivated by user")
    except MemoryNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
