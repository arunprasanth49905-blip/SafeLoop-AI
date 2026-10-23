"""Phase 5: Controlled Continuous Improvement API Endpoints.

Provides endpoints for generating behavioral improvement proposals from
approved feedback, validating safety, executing regression benchmarks,
managing versioned agent configurations, and controlling safe activation/rollback.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Path, Query, status

from app.models.schemas import (
    AgentConfigurationResponse,
    AuditListResponse,
    ConfigurationComparisonResponse,
    ErrorResponse,
    ImprovementStatsResponse,
    ProposalActionRequest,
    ProposalCreateRequest,
    ProposalListResponse,
    ProposalResponse,
)
from app.services.improvement_service import improvement_service

router = APIRouter(prefix="/api/improvements", tags=["Continuous Improvement"])


# ---------------------------------------------------------------------------
# Statistics & Overview
# ---------------------------------------------------------------------------

@router.get(
    "/stats",
    response_model=ImprovementStatsResponse,
    summary="Get continuous improvement summary statistics",
    description="Returns aggregate counts of proposals by status, active version, and total configurations.",
)
async def get_improvement_stats() -> ImprovementStatsResponse:
    """Retrieve aggregate metrics for proposals, active version, and versions."""
    try:
        return improvement_service.get_stats()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve improvement statistics: {str(exc)}",
        )


# ---------------------------------------------------------------------------
# Proposal Lifecycle Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/proposals/generate",
    response_model=ProposalResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate an improvement proposal from approved feedback",
    description="Synthesizes a bounded behavioral rule proposal exclusively from Phase 4 approved feedback.",
    responses={
        400: {"model": ErrorResponse, "description": "Validation or policy error (e.g. unapproved feedback)"},
        422: {"model": ErrorResponse, "description": "Invalid input payload"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
async def generate_proposal(payload: ProposalCreateRequest) -> ProposalResponse:
    """Generate a candidate improvement proposal from approved feedback evidence."""
    try:
        return improvement_service.generate_proposal(payload)
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate proposal: {str(exc)}",
        )


@router.get(
    "/proposals",
    response_model=ProposalListResponse,
    summary="List improvement proposals",
    description="Retrieve paginated proposals with optional status filtering (draft, tested, approved, rejected, activated).",
)
async def list_proposals(
    limit: int = Query(default=50, ge=1, le=100, description="Page limit"),
    offset: int = Query(default=0, ge=0, description="Page offset"),
    status: Optional[str] = Query(default=None, description="Filter by status"),
) -> ProposalListResponse:
    """List improvement proposals."""
    try:
        return improvement_service.list_proposals(limit=limit, offset=offset, status=status)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list proposals: {str(exc)}",
        )


@router.get(
    "/proposals/{proposal_id}",
    response_model=ProposalResponse,
    summary="Get proposal details by ID",
    responses={
        404: {"model": ErrorResponse, "description": "Proposal not found"},
    },
)
async def get_proposal(
    proposal_id: str = Path(..., description="Unique proposal identifier"),
) -> ProposalResponse:
    """Retrieve details for a single improvement proposal."""
    proposal = improvement_service.get_proposal_by_id(proposal_id)
    if not proposal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Proposal '{proposal_id}' not found.",
        )
    return proposal


@router.post(
    "/proposals/{proposal_id}/test",
    response_model=ProposalResponse,
    summary="Run validation and regression tests on candidate proposal",
    description="Executes static safety validation and benchmark regression testing on the candidate instruction.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid proposal state"},
        404: {"model": ErrorResponse, "description": "Proposal not found"},
    },
)
async def test_proposal(
    proposal_id: str = Path(..., description="Unique proposal identifier"),
) -> ProposalResponse:
    """Execute regression benchmarks and safety validation on proposal."""
    try:
        return improvement_service.test_proposal(proposal_id)
    except ValueError as val_err:
        err_msg = str(val_err)
        status_code = status.HTTP_404_NOT_FOUND if "not found" in err_msg.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=err_msg)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute regression test: {str(exc)}",
        )


@router.post(
    "/proposals/{proposal_id}/approve",
    response_model=ProposalResponse,
    summary="Approve a tested proposal",
    description="Explicitly approves a proposal that has passed safety and regression testing, making it eligible for activation.",
    responses={
        400: {"model": ErrorResponse, "description": "Proposal not in tested state or failed checks"},
        404: {"model": ErrorResponse, "description": "Proposal not found"},
    },
)
async def approve_proposal(
    proposal_id: str = Path(..., description="Unique proposal identifier"),
    payload: Optional[ProposalActionRequest] = None,
) -> ProposalResponse:
    """Approve a tested improvement proposal."""
    action = payload or ProposalActionRequest()
    try:
        return improvement_service.approve_proposal(proposal_id, action)
    except ValueError as val_err:
        err_msg = str(val_err)
        status_code = status.HTTP_404_NOT_FOUND if "not found" in err_msg.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=err_msg)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve proposal: {str(exc)}",
        )


@router.post(
    "/proposals/{proposal_id}/reject",
    response_model=ProposalResponse,
    summary="Reject an improvement proposal",
    description="Marks a proposal as rejected with an audit reason.",
    responses={
        400: {"model": ErrorResponse, "description": "Cannot reject already activated proposal"},
        404: {"model": ErrorResponse, "description": "Proposal not found"},
    },
)
async def reject_proposal(
    proposal_id: str = Path(..., description="Unique proposal identifier"),
    payload: Optional[ProposalActionRequest] = None,
) -> ProposalResponse:
    """Reject an improvement proposal."""
    action = payload or ProposalActionRequest()
    try:
        return improvement_service.reject_proposal(proposal_id, action)
    except ValueError as val_err:
        err_msg = str(val_err)
        status_code = status.HTTP_404_NOT_FOUND if "not found" in err_msg.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=err_msg)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reject proposal: {str(exc)}",
        )


@router.post(
    "/proposals/{proposal_id}/activate",
    response_model=AgentConfigurationResponse,
    summary="Activate an approved proposal into active configuration",
    description="Atomically creates a new immutable configuration version, deactivates the old version, and updates active instructions.",
    responses={
        400: {"model": ErrorResponse, "description": "Proposal not approved or failed safety/regression checks"},
        404: {"model": ErrorResponse, "description": "Proposal not found"},
    },
)
async def activate_proposal(
    proposal_id: str = Path(..., description="Unique proposal identifier"),
    payload: Optional[ProposalActionRequest] = None,
) -> AgentConfigurationResponse:
    """Activate an approved proposal."""
    action = payload or ProposalActionRequest()
    try:
        return improvement_service.activate_proposal(proposal_id, action)
    except ValueError as val_err:
        err_msg = str(val_err)
        status_code = status.HTTP_404_NOT_FOUND if "not found" in err_msg.lower() else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=status_code, detail=err_msg)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to activate proposal: {str(exc)}",
        )


# ---------------------------------------------------------------------------
# Configuration & Rollback Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "/configurations/active",
    response_model=AgentConfigurationResponse,
    summary="Get currently active configuration",
    description="Retrieves the active configuration version and approved behavioral instructions.",
)
async def get_active_configuration() -> AgentConfigurationResponse:
    """Retrieve active configuration."""
    try:
        return improvement_service.get_active_configuration()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve active configuration: {str(exc)}",
        )


@router.get(
    "/configurations",
    response_model=List[AgentConfigurationResponse],
    summary="List all preserved configuration versions",
    description="Returns chronological version history of immutable agent configurations.",
)
async def list_configurations() -> List[AgentConfigurationResponse]:
    """List all historical configuration versions."""
    try:
        return improvement_service.list_configurations()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list configurations: {str(exc)}",
        )


@router.get(
    "/configurations/compare",
    response_model=ConfigurationComparisonResponse,
    summary="Compare two configuration versions",
    description="Computes difference (added, removed, unchanged rules) between version_a and version_b.",
    responses={
        404: {"model": ErrorResponse, "description": "Version not found"},
    },
)
async def compare_configurations(
    version_a: str = Query(..., description="Base version"),
    version_b: str = Query(..., description="Target version"),
) -> ConfigurationComparisonResponse:
    """Compare two configuration versions."""
    try:
        return improvement_service.compare_configurations(version_a, version_b)
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(val_err),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compare configurations: {str(exc)}",
        )


@router.post(
    "/configurations/rollback",
    response_model=AgentConfigurationResponse,
    summary="Rollback active configuration to previous known-good version",
    description="Atomically deactivates current version and restores previous historical version.",
    responses={
        400: {"model": ErrorResponse, "description": "Already at baseline version or invalid rollback"},
    },
)
async def rollback_configuration(
    payload: Optional[ProposalActionRequest] = None,
) -> AgentConfigurationResponse:
    """Rollback to previous known-good configuration version."""
    action = payload or ProposalActionRequest()
    try:
        return improvement_service.rollback_configuration(action)
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to rollback configuration: {str(exc)}",
        )


# ---------------------------------------------------------------------------
# Audit Trail Endpoint
# ---------------------------------------------------------------------------

@router.get(
    "/audit",
    response_model=AuditListResponse,
    summary="List improvement audit trail entries",
    description="Returns chronological audit logs for proposal lifecycle, testing, approvals, activations, and rollbacks.",
)
async def list_audits(
    limit: int = Query(default=50, ge=1, le=100, description="Page limit"),
    offset: int = Query(default=0, ge=0, description="Page offset"),
) -> AuditListResponse:
    """Retrieve audit history."""
    try:
        return improvement_service.list_audits(limit=limit, offset=offset)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list audit entries: {str(exc)}",
        )
