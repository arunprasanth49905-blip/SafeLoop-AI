"""FastAPI endpoints for Phase 7 Context-Aware Workflow and Tool Optimization."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Path, Query, status

from app.core.logging import logger
from app.models.schemas import (
    ErrorResponse,
    TaskClassificationRequest,
    TaskClassificationResponse,
    ToolExecuteRequest,
    ToolExecuteResponse,
    WorkflowDefinition,
    WorkflowExecuteRequest,
    WorkflowExecuteResponse,
    WorkflowExecutionListResponse,
    WorkflowListResponse,
    WorkflowMetricsResponse,
    WorkflowPreviewRequest,
    WorkflowPreviewResponse,
    WorkflowToolsListResponse,
)
from app.services.workflow_service import workflow_service

router = APIRouter(prefix="/api/workflows", tags=["Workflows"])


# ---------------------------------------------------------------------------
# Workflow Registry & Telemetry Endpoints
# ---------------------------------------------------------------------------

@router.get(
    "",
    response_model=WorkflowListResponse,
    summary="List available workflows",
    description="Retrieve all registered and explicitly supported execution workflows.",
)
async def list_workflows() -> WorkflowListResponse:
    """Retrieve all supported workflows from the registry."""
    items = workflow_service.list_workflows()
    return WorkflowListResponse(workflows=items, total=len(items))


@router.get(
    "/metrics",
    response_model=WorkflowMetricsResponse,
    summary="Get workflow performance metrics",
    description="Retrieve aggregate performance metrics across recorded workflow executions.",
)
async def get_workflow_metrics() -> WorkflowMetricsResponse:
    """Retrieve aggregated performance metrics for workflow executions."""
    return workflow_service.get_metrics()


@router.get(
    "/tools",
    response_model=WorkflowToolsListResponse,
    summary="List supported tools and permission boundaries",
    description="Retrieve registered tools, permission status, and safety boundaries.",
)
async def list_tools() -> WorkflowToolsListResponse:
    """Retrieve capability tools and their operational authorization statuses."""
    tools = workflow_service.list_tools()
    return WorkflowToolsListResponse(tools=tools, total=len(tools))


@router.get(
    "/executions",
    response_model=WorkflowExecutionListResponse,
    summary="List workflow execution history",
    description="Retrieve paginated workflow execution records from the database.",
)
async def list_executions(
    limit: int = Query(default=20, ge=1, le=100, description="Items per page"),
    offset: int = Query(default=0, ge=0, description="Offset"),
    workflow_id: Optional[str] = Query(default=None, description="Optional workflow filter"),
    status: Optional[str] = Query(default=None, description="Optional status filter"),
) -> WorkflowExecutionListResponse:
    """Retrieve recorded workflow executions."""
    return workflow_service.list_executions(
        limit=limit,
        offset=offset,
        workflow_id=workflow_id,
        status=status,
    )


@router.get(
    "/{workflow_id}",
    response_model=WorkflowDefinition,
    summary="Get workflow details",
    description="Retrieve configuration and capability parameters for a specific workflow.",
    responses={
        404: {"model": ErrorResponse, "description": "Workflow not found"},
    },
)
async def get_workflow(
    workflow_id: str = Path(..., description="Unique workflow identifier"),
) -> WorkflowDefinition:
    """Retrieve workflow definition by ID."""
    wf = workflow_service.get_workflow(workflow_id)
    if not wf:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow '{workflow_id}' not found in registry.",
        )
    return wf


# ---------------------------------------------------------------------------
# Classification & Preview Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/classify",
    response_model=TaskClassificationResponse,
    summary="Classify a task",
    description="Analyze a task prompt to determine category, confidence, and recommended workflow.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid input payload"},
    },
)
async def classify_task(payload: TaskClassificationRequest) -> TaskClassificationResponse:
    """Determine task category and grounded confidence score."""
    try:
        return workflow_service.classify_task(payload.prompt)
    except Exception as exc:
        logger.error("Task classification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Task classification encountered an error: {str(exc)}",
        )


@router.post(
    "/preview",
    response_model=WorkflowPreviewResponse,
    summary="Preview workflow selection",
    description="Context-aware preview determining optimal workflow, fallback status, and validated memory inputs.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid input payload"},
    },
)
async def preview_workflow(payload: WorkflowPreviewRequest) -> WorkflowPreviewResponse:
    """Preview workflow selection given task context."""
    try:
        return workflow_service.preview_workflow_selection(
            prompt=payload.prompt,
            requested_workflow_id=payload.requested_workflow_id,
        )
    except Exception as exc:
        logger.error("Workflow preview failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Workflow preview encountered an error: {str(exc)}",
        )


# ---------------------------------------------------------------------------
# Execution Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/execute",
    response_model=WorkflowExecuteResponse,
    summary="Execute task via context-aware workflow",
    description="Executes user prompt using selected workflow, applies specialized guidelines, and records telemetry.",
    responses={
        400: {"model": ErrorResponse, "description": "Invalid input payload"},
        500: {"model": ErrorResponse, "description": "Execution failure"},
    },
)
async def execute_workflow(payload: WorkflowExecuteRequest) -> WorkflowExecuteResponse:
    """Execute a workflow and record execution telemetry."""
    try:
        return await workflow_service.execute_workflow(
            prompt=payload.prompt,
            task_id=payload.task_id,
            workflow_id_override=payload.workflow_id_override,
            timeout_seconds=payload.timeout_seconds or 30.0,
        )
    except Exception as exc:
        logger.error("Workflow execution failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Workflow execution failed: {str(exc)}",
        )


@router.post(
    "/tools/execute",
    response_model=ToolExecuteResponse,
    summary="Execute permitted tool",
    description="Invokes a registered tool within strict authorization boundaries. Disallowed or unavailable tools are rejected.",
    responses={
        400: {"model": ErrorResponse, "description": "Unknown tool"},
        403: {"model": ErrorResponse, "description": "Unauthorized or unavailable tool"},
    },
)
async def execute_tool(payload: ToolExecuteRequest) -> ToolExecuteResponse:
    """Execute permitted tool or reject with permission error."""
    try:
        return workflow_service.execute_tool(
            tool_id=payload.tool_id,
            parameters=payload.parameters,
        )
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except PermissionError as perm_err:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=str(perm_err),
        )
    except Exception as exc:
        logger.error("Tool execution failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Tool execution encountered an error: {str(exc)}",
        )
