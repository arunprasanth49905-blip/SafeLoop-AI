"""AI Agent status endpoints."""

from fastapi import APIRouter
from app.models.schemas import AgentStatusResponse
from app.services.agent_service import agent_service

router = APIRouter(prefix="/api/agent", tags=["Agent"])


@router.get(
    "/status",
    response_model=AgentStatusResponse,
    summary="Agent Configuration Status",
    description="Returns current AI provider integration readiness without exposing credentials.",
)
async def get_agent_status() -> AgentStatusResponse:
    """Return the configuration readiness of the agent provider for Phase 1."""
    return agent_service.get_status()
