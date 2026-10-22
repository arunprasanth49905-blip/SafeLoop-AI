"""Health check endpoints."""

from fastapi import APIRouter
from app.core.config import settings
from app.models.schemas import HealthResponse

router = APIRouter(tags=["Health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Backend Health Check",
    description="Confirms that the FastAPI backend process is operating normally.",
)
async def get_health() -> HealthResponse:
    """Return the health status of the backend service."""
    return HealthResponse(
        status="healthy",
        service="safeloop-backend",
        version=settings.app_version,
    )
