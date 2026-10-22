"""FastAPI application entrypoint for SafeLoop AI."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.agent import router as agent_router
from app.api.routes.health import router as health_router
from app.core.config import settings
from app.core.logging import logger


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan context for startup and shutdown events."""
    logger.info(
        "Starting %s v%s (environment: %s, debug: %s)",
        settings.app_name,
        settings.app_version,
        settings.environment,
        settings.debug,
    )
    logger.info("Allowed CORS origins: %s", settings.allowed_origins)
    yield
    logger.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "SafeLoop AI: Safe Feedback-Driven Continuous Improvement of Agentic AI Systems "
        "Without Model Retraining (Phase 1 Foundation)"
    ),
    debug=settings.debug,
    lifespan=lifespan,
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-Requested-With"],
)

# Register routes
# Primary endpoints required by Phase 1:
# - GET /health
# - GET /api/agent/status
app.include_router(health_router)
app.include_router(agent_router)


@app.get("/", tags=["Root"])
async def root_info() -> dict[str, str]:
    """Root metadata endpoint providing links to documentation and health status."""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
        "status": "operational",
        "docs_url": "/docs",
        "health_url": "/health",
        "agent_status_url": "/api/agent/status",
    }
