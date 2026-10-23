"""Phase 8: Continuous Regression Monitoring and Safety Guardrails Endpoints."""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.models.schemas import (
    AlertActionRequest,
    AlertListResponse,
    AlertSeverity,
    AlertStatus,
    BaselineComparisonResponse,
    MonitoringAlertRecord,
    MonitoringMetricsResponse,
    RecoveryHistoryResponse,
    RegressionBenchmarkResponse,
    RegressionTestRunRequest,
    RollbackRequest,
    SystemHealthResponse,
)
from app.services.monitoring_service import monitoring_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/monitoring", tags=["Monitoring & Safety Guardrails"])


@router.get("/health", response_model=SystemHealthResponse)
async def get_system_health() -> SystemHealthResponse:
    """Retrieve current system health, regression status, and guardrail checks."""
    try:
        return monitoring_service.get_system_health()
    except Exception as exc:
        logger.error("Error retrieving system health: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve system health: {str(exc)}",
        )


@router.get("/metrics", response_model=MonitoringMetricsResponse)
async def get_monitoring_metrics() -> MonitoringMetricsResponse:
    """Retrieve continuous regression monitoring metrics aggregated from actual DB records."""
    try:
        return monitoring_service.get_monitoring_metrics()
    except Exception as exc:
        logger.error("Error retrieving monitoring metrics: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve monitoring metrics: {str(exc)}",
        )


@router.get("/alerts", response_model=AlertListResponse)
async def list_monitoring_alerts(
    status_filter: Optional[AlertStatus] = Query(default=None, alias="status", description="Filter by status"),
    severity: Optional[AlertSeverity] = Query(default=None, description="Filter by severity"),
    limit: int = Query(default=50, ge=1, le=200, description="Page limit"),
    offset: int = Query(default=0, ge=0, description="Page offset"),
) -> AlertListResponse:
    """List monitoring alerts with optional filtering and pagination."""
    try:
        return monitoring_service.list_alerts(
            status=status_filter, severity=severity, limit=limit, offset=offset
        )
    except Exception as exc:
        logger.error("Error listing alerts: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list alerts: {str(exc)}",
        )


@router.get("/alerts/{alert_id}", response_model=MonitoringAlertRecord)
async def get_alert_detail(alert_id: str) -> MonitoringAlertRecord:
    """Retrieve details of a specific alert by ID."""
    try:
        return monitoring_service.get_alert_by_id(alert_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.error("Error retrieving alert %s: %s", alert_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve alert: {str(exc)}",
        )


@router.post("/alerts/{alert_id}/acknowledge", response_model=MonitoringAlertRecord)
async def acknowledge_alert(alert_id: str, request: AlertActionRequest) -> MonitoringAlertRecord:
    """Mark an active alert as acknowledged by an operator."""
    try:
        return monitoring_service.acknowledge_alert(alert_id, request)
    except ValueError as exc:
        if "not found" in str(exc).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error("Error acknowledging alert %s: %s", alert_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to acknowledge alert: {str(exc)}",
        )


@router.post("/alerts/{alert_id}/resolve", response_model=MonitoringAlertRecord)
async def resolve_alert(alert_id: str, request: AlertActionRequest) -> MonitoringAlertRecord:
    """Mark an alert as resolved with audit explanation."""
    try:
        return monitoring_service.resolve_alert(alert_id, request)
    except ValueError as exc:
        if "not found" in str(exc).lower():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    except Exception as exc:
        logger.error("Error resolving alert %s: %s", alert_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resolve alert: {str(exc)}",
        )


@router.get("/baseline", response_model=BaselineComparisonResponse)
async def get_baseline_comparison(
    candidate_version: Optional[str] = Query(default=None, description="Candidate version to compare against baseline")
) -> BaselineComparisonResponse:
    """Compare candidate performance against the reproducible baseline."""
    try:
        return monitoring_service.get_baseline_comparison(candidate_version)
    except Exception as exc:
        logger.error("Error comparing baseline: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compare baseline: {str(exc)}",
        )


@router.post("/regression-test", response_model=RegressionBenchmarkResponse)
async def run_regression_test(request: RegressionTestRunRequest) -> RegressionBenchmarkResponse:
    """Trigger the regression benchmark suite against candidate version."""
    try:
        return monitoring_service.run_regression_suite(
            candidate_version=request.candidate_version, benchmark_name=request.benchmark_name
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error("Error executing regression test: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to run regression test: {str(exc)}",
        )


@router.get("/recovery/history", response_model=RecoveryHistoryResponse)
async def get_recovery_history(
    limit: int = Query(default=50, ge=1, le=100, description="Page limit"),
    offset: int = Query(default=0, ge=0, description="Page offset"),
) -> RecoveryHistoryResponse:
    """Retrieve auditable history of safeguard recovery and rollback events."""
    try:
        return monitoring_service.list_recovery_events(limit=limit, offset=offset)
    except Exception as exc:
        logger.error("Error retrieving recovery history: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve recovery history: {str(exc)}",
        )


@router.post("/recovery/rollback")
async def rollback_configuration(request: RollbackRequest) -> dict:
    """Roll back the active configuration to a verified known-good version."""
    # Administrative safeguard: reject empty or malformed requests
    if not request.target_version or not request.reason:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both target_version and auditable reason are mandatory.",
        )

    success, message, event_id = monitoring_service.rollback_to_known_good(request)
    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    return {
        "success": True,
        "message": message,
        "event_id": event_id,
        "target_version": request.target_version,
    }
