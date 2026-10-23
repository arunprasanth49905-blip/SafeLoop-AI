"""Phase 9: Continuous Evaluation, Performance Analytics, and Learning Insights Endpoints."""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.models.schemas import (
    ContinuousEvaluationMetricsResponse,
    DatasetListResponse,
    EvaluationCaseCreateRequest,
    EvaluationCaseListResponse,
    EvaluationCaseRecord,
    EvaluationDatasetRecord,
    EvaluationRunListResponse,
    EvaluationRunRecord,
    EvaluationRunRequest,
    FailureInsightsListResponse,
    ImprovementRecommendationRecord,
    RecommendationActionRequest,
    RecommendationsListResponse,
    RunComparisonResponse,
)
from app.services.analytics_service import analytics_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["Continuous Evaluation & Performance Analytics"])


@router.get("/metrics", response_model=ContinuousEvaluationMetricsResponse)
async def get_evaluation_metrics() -> ContinuousEvaluationMetricsResponse:
    """Retrieve high-level continuous evaluation metrics and category score breakdowns."""
    try:
        return analytics_service.get_evaluation_metrics()
    except Exception as exc:
        logger.error("Error retrieving continuous evaluation metrics: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve evaluation metrics: {str(exc)}",
        )


# ---------------------------------------------------------------------------
# Datasets & Cases Endpoints
# ---------------------------------------------------------------------------

@router.get("/datasets", response_model=DatasetListResponse)
async def list_datasets() -> DatasetListResponse:
    """List all versioned evaluation datasets."""
    try:
        return analytics_service.list_datasets()
    except Exception as exc:
        logger.error("Error listing evaluation datasets: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list evaluation datasets: {str(exc)}",
        )


@router.get("/datasets/{dataset_id}", response_model=EvaluationDatasetRecord)
async def get_dataset(dataset_id: str) -> EvaluationDatasetRecord:
    """Retrieve details for a specific evaluation dataset."""
    try:
        return analytics_service.get_dataset(dataset_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.error("Error retrieving dataset %s: %s", dataset_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve dataset: {str(exc)}",
        )


@router.get("/datasets/{dataset_id}/cases", response_model=EvaluationCaseListResponse)
async def list_cases(
    dataset_id: str,
    active_only: bool = Query(default=True, description="Filter active cases only"),
) -> EvaluationCaseListResponse:
    """List test cases for a dataset."""
    try:
        return analytics_service.list_cases(dataset_id, active_only=active_only)
    except Exception as exc:
        logger.error("Error listing cases for dataset %s: %s", dataset_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list evaluation cases: {str(exc)}",
        )


@router.post("/datasets/{dataset_id}/cases", response_model=EvaluationCaseRecord)
async def create_case(dataset_id: str, payload: EvaluationCaseCreateRequest) -> EvaluationCaseRecord:
    """Add a new evaluation case to an active dataset."""
    try:
        return analytics_service.create_case(dataset_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error("Error creating case in dataset %s: %s", dataset_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create evaluation case: {str(exc)}",
        )


# ---------------------------------------------------------------------------
# Evaluation Runs & Comparisons
# ---------------------------------------------------------------------------

@router.post("/runs", response_model=EvaluationRunRecord)
async def execute_run(payload: EvaluationRunRequest) -> EvaluationRunRecord:
    """Trigger a bounded evaluation run on a dataset against target configuration."""
    try:
        return await analytics_service.execute_evaluation_run(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error("Evaluation run execution error: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to execute evaluation run: {str(exc)}",
        )


@router.get("/runs", response_model=EvaluationRunListResponse)
async def list_runs(
    dataset_id: Optional[str] = Query(default=None, description="Filter by dataset ID"),
    configuration_version: Optional[str] = Query(default=None, description="Filter by config version"),
    limit: int = Query(default=50, ge=1, le=100, description="Page limit"),
    offset: int = Query(default=0, ge=0, description="Page offset"),
) -> EvaluationRunListResponse:
    """List recorded evaluation runs with optional filtering."""
    try:
        return analytics_service.list_runs(
            dataset_id=dataset_id,
            configuration_version=configuration_version,
            limit=limit,
            offset=offset,
        )
    except Exception as exc:
        logger.error("Error listing evaluation runs: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list evaluation runs: {str(exc)}",
        )


@router.get("/runs/{run_id}", response_model=EvaluationRunRecord)
async def get_run_detail(
    run_id: str,
    include_cases: bool = Query(default=True, description="Include individual case results"),
) -> EvaluationRunRecord:
    """Retrieve details and case-by-case outcomes for an evaluation run."""
    try:
        return analytics_service.get_run(run_id, include_cases=include_cases)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except Exception as exc:
        logger.error("Error retrieving run %s: %s", run_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve evaluation run: {str(exc)}",
        )


@router.get("/compare", response_model=RunComparisonResponse)
async def compare_runs(
    baseline_run_id: str = Query(..., description="Run ID of the baseline evaluation"),
    candidate_run_id: str = Query(..., description="Run ID of the candidate evaluation"),
) -> RunComparisonResponse:
    """Compare candidate evaluation run against baseline on equivalent datasets."""
    try:
        return analytics_service.compare_runs(baseline_run_id, candidate_run_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error("Error comparing runs %s and %s: %s", baseline_run_id, candidate_run_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to compare runs: {str(exc)}",
        )


# ---------------------------------------------------------------------------
# Failure Analysis & Evidence-Based Recommendations
# ---------------------------------------------------------------------------

@router.get("/insights", response_model=FailureInsightsListResponse)
async def get_failure_insights() -> FailureInsightsListResponse:
    """Inspect records to identify grouped failure patterns and operational insights."""
    try:
        return analytics_service.analyze_failure_patterns()
    except Exception as exc:
        logger.error("Error analyzing failure insights: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate failure insights: {str(exc)}",
        )


@router.get("/recommendations", response_model=RecommendationsListResponse)
async def get_recommendations() -> RecommendationsListResponse:
    """Retrieve actionable, evidence-based improvement recommendations."""
    try:
        return analytics_service.generate_recommendations()
    except Exception as exc:
        logger.error("Error generating recommendations: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve recommendations: {str(exc)}",
        )


@router.post("/recommendations/{recommendation_id}/action", response_model=ImprovementRecommendationRecord)
async def handle_recommendation_action(
    recommendation_id: str, payload: RecommendationActionRequest
) -> ImprovementRecommendationRecord:
    """Process an action (accept, reject, create_proposal) on a recommendation.

    Routing to create_proposal creates a Phase 5 proposal requiring rigorous testing/review.
    """
    try:
        return analytics_service.handle_recommendation_action(recommendation_id, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception as exc:
        logger.error("Error acting on recommendation %s: %s", recommendation_id, exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process recommendation action: {str(exc)}",
        )
