"""FastAPI application entrypoint for SafeLoop AI."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.agent import router as agent_router
from app.api.routes.evaluations import router as evaluations_router
from app.api.routes.feedback import router as feedback_router
from app.api.routes.health import router as health_router
from app.api.routes.improvements import router as improvements_router
from app.api.routes.memory import router as memory_router
from app.api.routes.monitoring import router as monitoring_router
from app.api.routes.workflows import router as workflows_router
from app.api.routes.analytics import router as analytics_router
from app.core.config import settings
from app.core.database import init_db
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
    # Initialize SQLite database schema
    init_db()
    yield
    logger.info("Shutting down %s", settings.app_name)


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description=(
        "SafeLoop AI: Safe Feedback-Driven Continuous Improvement of Agentic AI Systems "
        "Without Model Retraining (Phase 9 Continuous Evaluation, Performance Analytics, and Learning Insights)"
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
app.include_router(health_router)
app.include_router(agent_router)
app.include_router(feedback_router)
app.include_router(evaluations_router)
app.include_router(improvements_router)
app.include_router(memory_router)
app.include_router(workflows_router)
app.include_router(monitoring_router)
app.include_router(analytics_router)



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
        "agent_chat_url": "/api/agent/chat",
        "feedback_url": "/api/feedback",
        "feedback_stats_url": "/api/feedback/stats",
        "evaluations_url": "/api/evaluations",
        "evaluations_stats_url": "/api/evaluations/stats",
        "improvements_proposals_url": "/api/improvements/proposals",
        "improvements_configurations_url": "/api/improvements/configurations",
        "improvements_stats_url": "/api/improvements/stats",
        "memory_url": "/api/memory",
        "memory_stats_url": "/api/memory/stats",
        "memory_config_url": "/api/memory/config/retrieval",
        "workflows_url": "/api/workflows",
        "workflows_metrics_url": "/api/workflows/metrics",
        "workflows_tools_url": "/api/workflows/tools",
        "workflows_executions_url": "/api/workflows/executions",
        "monitoring_health_url": "/api/monitoring/health",
        "monitoring_metrics_url": "/api/monitoring/metrics",
        "monitoring_alerts_url": "/api/monitoring/alerts",
        "monitoring_baseline_url": "/api/monitoring/baseline",
        "monitoring_recovery_history_url": "/api/monitoring/recovery/history",
        "analytics_metrics_url": "/api/analytics/metrics",
        "analytics_datasets_url": "/api/analytics/datasets",
        "analytics_runs_url": "/api/analytics/runs",
        "analytics_compare_url": "/api/analytics/compare",
        "analytics_insights_url": "/api/analytics/insights",
        "analytics_recommendations_url": "/api/analytics/recommendations",
    }


