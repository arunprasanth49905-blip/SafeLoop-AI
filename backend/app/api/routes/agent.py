from typing import Optional
from fastapi import APIRouter, HTTPException, status
from app.models.schemas import (
    AgentStatusResponse,
    ChatRequest,
    ChatResponse,
    ErrorResponse,
    KeyDiagnosticResponse,
    ModelTestResponse,
)
from app.services.agent_service import (
    AgentAuthenticationError,
    AgentModelError,
    AgentModelNotFoundError,
    AgentNotConfiguredError,
    AgentProviderError,
    AgentRateLimitError,
    AgentTimeoutError,
    agent_service,
)

router = APIRouter(prefix="/api/agent", tags=["Agent"])


@router.get(
    "/status",
    response_model=AgentStatusResponse,
    summary="Agent Configuration Status",
    description="Returns current AI provider integration readiness without exposing credentials.",
)
async def get_agent_status() -> AgentStatusResponse:
    """Return the configuration readiness of the agent provider."""
    return agent_service.get_status()


@router.get(
    "/diagnostic",
    response_model=KeyDiagnosticResponse,
    summary="Safe AI Provider Diagnostic",
    description="Returns safe diagnostic metadata about key presence and format without revealing credentials.",
)
async def get_agent_diagnostic() -> KeyDiagnosticResponse:
    """Return safe key diagnostics without exposing secrets."""
    return agent_service.get_diagnostic()


@router.get(
    "/diagnostic/test",
    response_model=ModelTestResponse,
    summary="Minimal Model Integration Diagnostic",
    description="Tests text generation on the configured or specified model without exposing credentials.",
)
async def get_model_integration_test(model: Optional[str] = None) -> ModelTestResponse:
    """Run a minimal integration diagnostic text-generation request."""
    return await agent_service.test_generation(model=model)



@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorResponse, "description": "Validation error or invalid model parameters"},
        401: {"model": ErrorResponse, "description": "AI provider authentication failed (invalid or rejected key)"},
        404: {"model": ErrorResponse, "description": "AI provider model not found"},
        429: {"model": ErrorResponse, "description": "Rate limit or quota exceeded"},
        502: {"model": ErrorResponse, "description": "AI provider gateway error"},
        503: {"model": ErrorResponse, "description": "AI provider credentials not configured"},
        504: {"model": ErrorResponse, "description": "AI provider timeout"},
    },
    summary="Execute Agentic Task with Gemini",
    description="Sends user prompt and optional task ID/system instruction to the configured Gemini model.",
)
async def post_agent_chat(request: ChatRequest) -> ChatResponse:
    """Execute a task with the configured Gemini model and return structured telemetry."""
    try:
        response = await agent_service.generate_chat(
            prompt=request.prompt,
            task_id=request.task_id,
            system_instruction=request.system_instruction,
        )
        return response
    except AgentNotConfiguredError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=exc.message)
    except AgentAuthenticationError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=exc.message)
    except AgentModelNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=exc.message)
    except AgentModelError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=exc.message)
    except AgentRateLimitError as exc:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=exc.message)
    except AgentTimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=exc.message)
    except AgentProviderError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"An unexpected error occurred during execution: {str(exc)}",
        )

