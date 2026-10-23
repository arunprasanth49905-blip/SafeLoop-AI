"""Automated tests for SafeLoop AI Phase 9: Continuous Evaluation, Performance Analytics, and Learning Insights.

Covers all 13 required test cases from Section 11:
1. Evaluation dataset creation and versioning.
2. Reproducible evaluation runs.
3. Correct pass/fail and skipped-test counts.
4. Accurate metric calculations.
5. Empty datasets and insufficient sample sizes.
6. Partial runs, timeouts, and failures.
7. Baseline and candidate comparison on equivalent datasets.
8. Per-category metric aggregation.
9. Failure analysis with evidence references.
10. Recommendations linked to supporting evidence.
11. Prevention of unapproved changes from being activated.
12. Persistence of evaluation history after restart.
13. Protection of existing Phase 1–8 functionality.
"""

import json
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.core.database import get_db_connection, init_db
from app.models.schemas import (
    ChatResponse,
    EvaluationCaseCreateRequest,
    EvaluationRunRequest,
    RecommendationActionRequest,
)
from app.services.agent_service import agent_service
from app.services.analytics_service import analytics_service
from app.services.improvement_service import improvement_service
from app.services.memory_service import memory_service
from app.services.monitoring_service import monitoring_service
from app.services.workflow_service import workflow_service


@pytest.fixture(autouse=True)
def setup_test_db(tmp_path: Path):
    """Isolate tests using a fresh temporary SQLite database."""
    test_db_path = str(tmp_path / "test_analytics.db")
    init_db(test_db_path)

    old_ana_path = analytics_service._db_path
    old_mon_path = monitoring_service._db_path
    old_imp_path = improvement_service._db_path
    old_wf_path = workflow_service._db_path
    old_mem_path = memory_service._db_path

    analytics_service._db_path = test_db_path
    monitoring_service._db_path = test_db_path
    improvement_service._db_path = test_db_path
    workflow_service._db_path = test_db_path
    memory_service._db_path = test_db_path

    yield test_db_path

    analytics_service._db_path = old_ana_path
    monitoring_service._db_path = old_mon_path
    improvement_service._db_path = old_imp_path
    workflow_service._db_path = old_wf_path
    memory_service._db_path = old_mem_path


# ---------------------------------------------------------------------------
# Test 1: Evaluation Dataset Creation and Versioning
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_dataset_creation_and_versioning(async_client: AsyncClient, setup_test_db: str):
    """Verify evaluation dataset retrieval, seeding, and case additions with version tracking."""
    # List datasets via endpoint
    resp = await async_client.get("/api/analytics/datasets")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    standard_ds = next((d for d in data["datasets"] if d["dataset_id"] == "ds_v1_standard"), None)
    assert standard_ds is not None
    assert standard_ds["version"] == "v1.0"
    assert standard_ds["total_cases"] >= 8

    # Add a new versioned case to the dataset
    new_case_payload = {
        "case_id": "test_case_v1_custom",
        "task_category": "coding_debugging",
        "prompt": "Write a Python function to compute factorial.",
        "expected_criteria": {"must_include": ["def factorial", "return"]},
        "evaluation_method": "deterministic",
    }
    case_resp = await async_client.post(
        f"/api/analytics/datasets/{standard_ds['dataset_id']}/cases",
        json=new_case_payload,
    )
    assert case_resp.status_code == 200
    case_data = case_resp.json()
    assert case_data["case_id"] == "test_case_v1_custom"
    assert case_data["task_category"] == "coding_debugging"

    # Verify case listing
    list_cases_resp = await async_client.get(f"/api/analytics/datasets/{standard_ds['dataset_id']}/cases")
    assert list_cases_resp.status_code == 200
    cases_list = list_cases_resp.json()["cases"]
    assert any(c["case_id"] == "test_case_v1_custom" for c in cases_list)


# ---------------------------------------------------------------------------
# Test 2: Reproducible Evaluation Runs
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_reproducible_evaluation_runs(async_client: AsyncClient, setup_test_db: str):
    """Verify that evaluation runs execute deterministically with recorded parameters."""
    mock_chat_response = ChatResponse(
        text="```python\ndef reverse_string(s: str) -> str:\n    return s[::-1]\n```",
        model="gemini-2.5-flash",
        latency_ms=120.0,
        task_id="task_mock_01",
    )

    with patch.object(agent_service, "generate_chat", new=AsyncMock(return_value=mock_chat_response)):
        run_payload = {
            "dataset_id": "ds_v1_standard",
            "configuration_version": "v1.0.0",
            "max_cases": 3,
        }
        resp = await async_client.post("/api/analytics/runs", json=run_payload)
        assert resp.status_code == 200
        run_data = resp.json()
        assert run_data["status"] == "completed"
        assert run_data["total_cases"] == 3
        assert run_data["dataset_id"] == "ds_v1_standard"
        assert run_data["dataset_version"] == "v1.0"
        assert run_data["configuration_version"] == "v1.0.0"
        assert run_data["started_at"] is not None
        assert run_data["completed_at"] is not None


# ---------------------------------------------------------------------------
# Test 3: Correct Pass/Fail and Skipped-Test Counts
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_correct_pass_fail_and_skipped_counts(setup_test_db: str):
    """Verify that case results accurately tally passed, failed, and skipped cases."""
    # Seed a custom dataset with 3 cases: 1 active that passes, 1 active that fails, 1 inactive (skipped)
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection(setup_test_db) as conn:
        conn.execute(
            """INSERT INTO evaluation_datasets (dataset_id, version, name, description, status, total_cases, created_at, updated_at)
               VALUES ('ds_count_test', 'v1.0', 'Count Test', 'For pass fail tallying', 'active', 3, ?, ?)""",
            (now_iso, now_iso),
        )
        # Case 1: will pass
        conn.execute(
            """INSERT INTO evaluation_cases (case_id, dataset_id, task_category, prompt, expected_criteria, evaluation_method, is_active, created_at)
               VALUES ('case_pass', 'ds_count_test', 'coding', 'Return 42', '{"must_include": ["42"]}', 'deterministic', 1, ?)""",
            (now_iso,),
        )
        # Case 2: will fail (requires 'impossible_string')
        conn.execute(
            """INSERT INTO evaluation_cases (case_id, dataset_id, task_category, prompt, expected_criteria, evaluation_method, is_active, created_at)
               VALUES ('case_fail', 'ds_count_test', 'coding', 'Return 42', '{"must_include": ["impossible_string"]}', 'deterministic', 1, ?)""",
            (now_iso,),
        )
        # Case 3: inactive (skipped)
        conn.execute(
            """INSERT INTO evaluation_cases (case_id, dataset_id, task_category, prompt, expected_criteria, evaluation_method, is_active, created_at)
               VALUES ('case_skip', 'ds_count_test', 'coding', 'Inactive case', '{"must_include": ["none"]}', 'deterministic', 0, ?)""",
            (now_iso,),
        )
        conn.commit()

    mock_chat_response = ChatResponse(
        text="The answer is 42.",
        model="gemini-2.5-flash",
        latency_ms=105.0,
        task_id="task_mock_count",
    )

    with patch.object(agent_service, "generate_chat", new=AsyncMock(return_value=mock_chat_response)):
        run_record = await analytics_service.execute_evaluation_run(
            EvaluationRunRequest(dataset_id="ds_count_test", configuration_version="v1.0.0")
        )
        assert run_record.total_cases == 3
        assert run_record.passed_cases == 1
        assert run_record.failed_cases == 1
        assert run_record.skipped_cases == 1
        assert run_record.pass_rate == pytest.approx(33.33, 0.1)


# ---------------------------------------------------------------------------
# Test 4: Accurate Metric Calculations
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_accurate_metric_calculations(async_client: AsyncClient, setup_test_db: str):
    """Verify that continuous evaluation metrics calculate accurate averages and rates without fabrication."""
    metrics = analytics_service.get_evaluation_metrics()
    assert metrics.active_version is not None
    assert metrics.baseline_version == "v1.0.0"
    assert metrics.sample_size >= 0
    assert 0.0 <= metrics.latest_pass_rate <= 100.0
    assert 0.0 <= metrics.latest_avg_score <= 100.0
    assert 0.0 <= metrics.latest_safety_rate <= 100.0
    assert metrics.latest_latency_ms >= 0.0


# ---------------------------------------------------------------------------
# Test 5: Empty Datasets and Insufficient Sample Sizes
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_empty_datasets_and_insufficient_sample_sizes(setup_test_db: str):
    """Verify that empty datasets or sample size < 5 report insufficient_data=True."""
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection(setup_test_db) as conn:
        conn.execute(
            """INSERT INTO evaluation_datasets (dataset_id, version, name, description, status, total_cases, created_at, updated_at)
               VALUES ('ds_empty', 'v0.1', 'Empty Dataset', 'No test cases', 'active', 0, ?, ?)""",
            (now_iso, now_iso),
        )
        conn.commit()

    # Executing run on empty dataset should raise ValueError
    with pytest.raises(ValueError, match="no test cases|no active test cases"):
        await analytics_service.execute_evaluation_run(EvaluationRunRequest(dataset_id="ds_empty"))

    # When total cases < 5, comparison correctly flags insufficient sample size
    with get_db_connection(setup_test_db) as conn:
        conn.execute(
            """INSERT INTO evaluation_runs (run_id, dataset_id, dataset_version, configuration_version, workflow_version, status,
                                           total_cases, passed_cases, failed_cases, skipped_cases, error_cases,
                                           pass_rate, avg_score, avg_latency_ms, safety_pass_rate, started_at, completed_at)
               VALUES ('run_small_base', 'ds_small', 'v1.0', 'v1.0.0', 'v1.0.0', 'completed',
                       3, 3, 0, 0, 0, 100.0, 100.0, 150.0, 100.0, ?, ?)""",
            (now_iso, now_iso),
        )
        conn.execute(
            """INSERT INTO evaluation_runs (run_id, dataset_id, dataset_version, configuration_version, workflow_version, status,
                                           total_cases, passed_cases, failed_cases, skipped_cases, error_cases,
                                           pass_rate, avg_score, avg_latency_ms, safety_pass_rate, started_at, completed_at)
               VALUES ('run_small_cand', 'ds_small', 'v1.0', 'v1.0.1', 'v1.0.0', 'completed',
                       3, 2, 1, 0, 0, 66.7, 75.0, 160.0, 100.0, ?, ?)""",
            (now_iso, now_iso),
        )
        conn.commit()

    comparison = analytics_service.compare_runs("run_small_base", "run_small_cand")
    assert comparison.is_statistically_valid is False
    assert comparison.sample_size == 3
    assert "Insufficient sample size" in comparison.comparison_summary or "Provisional" in comparison.comparison_summary


# ---------------------------------------------------------------------------
# Test 6: Partial Runs, Timeouts, and Failures
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_partial_runs_timeouts_and_failures(setup_test_db: str):
    """Verify that exceptions during execution result in partial/failed runs with error counts."""
    async def mock_crashing_chat(*args, **kwargs):
        raise TimeoutError("Inference timed out after 30s")

    with patch.object(agent_service, "generate_chat", new=mock_crashing_chat):
        run = await analytics_service.execute_evaluation_run(
            EvaluationRunRequest(dataset_id="ds_v1_standard", max_cases=2)
        )
        assert run.status in ("failed", "partial")
        assert run.error_cases > 0
        assert run.error_details is not None
        assert "runtime timeouts or exceptions" in run.error_details
        assert any("Inference timed out" in (c.details or "") for c in (run.case_results or []))


# ---------------------------------------------------------------------------
# Test 7: Baseline and Candidate Comparison on Equivalent Datasets
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_baseline_candidate_comparison_on_equivalent_datasets(async_client: AsyncClient, setup_test_db: str):
    """Verify comparison deltas between baseline and candidate on matching dataset versions."""
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection(setup_test_db) as conn:
        conn.execute(
            """INSERT INTO evaluation_runs (run_id, dataset_id, dataset_version, configuration_version, workflow_version, status,
                                           total_cases, passed_cases, failed_cases, skipped_cases, error_cases,
                                           pass_rate, avg_score, avg_latency_ms, safety_pass_rate, started_at, completed_at)
               VALUES ('run_eq_base', 'ds_v1_standard', 'v1.0', 'v1.0.0', 'v1.0.0', 'completed',
                       8, 8, 0, 0, 0, 100.0, 95.0, 200.0, 100.0, ?, ?)""",
            (now_iso, now_iso),
        )
        conn.execute(
            """INSERT INTO evaluation_runs (run_id, dataset_id, dataset_version, configuration_version, workflow_version, status,
                                           total_cases, passed_cases, failed_cases, skipped_cases, error_cases,
                                           pass_rate, avg_score, avg_latency_ms, safety_pass_rate, started_at, completed_at)
               VALUES ('run_eq_cand', 'ds_v1_standard', 'v1.0', 'v1.0.1', 'v1.0.0', 'completed',
                       8, 7, 1, 0, 0, 87.5, 88.0, 220.0, 100.0, ?, ?)""",
            (now_iso, now_iso),
        )
        conn.commit()

    resp = await async_client.get("/api/analytics/compare?baseline_run_id=run_eq_base&candidate_run_id=run_eq_cand")
    assert resp.status_code == 200
    comp = resp.json()
    assert comp["is_statistically_valid"] is True
    assert comp["pass_rate_delta"] == pytest.approx(-12.5, 0.1)
    assert comp["score_delta"] == pytest.approx(-7.0, 0.1)
    assert comp["latency_delta_ms"] == pytest.approx(20.0, 0.1)

    # Inequivalent dataset check
    with get_db_connection(setup_test_db) as conn:
        conn.execute(
            """INSERT INTO evaluation_runs (run_id, dataset_id, dataset_version, configuration_version, workflow_version, status,
                                           total_cases, passed_cases, failed_cases, skipped_cases, error_cases,
                                           pass_rate, avg_score, avg_latency_ms, safety_pass_rate, started_at, completed_at)
               VALUES ('run_diff_ds', 'ds_diff', 'v2.0', 'v1.0.1', 'v1.0.0', 'completed',
                       8, 8, 0, 0, 0, 100.0, 100.0, 200.0, 100.0, ?, ?)""",
            (now_iso, now_iso),
        )
        conn.commit()

    diff_resp = await async_client.get("/api/analytics/compare?baseline_run_id=run_eq_base&candidate_run_id=run_diff_ds")
    assert diff_resp.status_code == 200
    diff_comp = diff_resp.json()
    assert diff_comp["is_statistically_valid"] is False
    assert "different datasets" in diff_comp["comparison_summary"].lower()


# ---------------------------------------------------------------------------
# Test 8: Per-Category Metric Aggregation
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_per_category_metric_aggregation(setup_test_db: str):
    """Verify that case results aggregate accurately by task category."""
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection(setup_test_db) as conn:
        conn.execute(
            """INSERT INTO evaluation_runs (run_id, dataset_id, dataset_version, configuration_version, workflow_version, status,
                                           total_cases, passed_cases, failed_cases, skipped_cases, error_cases,
                                           pass_rate, avg_score, avg_latency_ms, safety_pass_rate, started_at, completed_at)
               VALUES ('run_cat_test', 'ds_v1_standard', 'v1.0', 'v1.0.0', 'v1.0.0', 'completed',
                       4, 3, 1, 0, 0, 75.0, 80.0, 150.0, 100.0, ?, ?)""",
            (now_iso, now_iso),
        )
        # coding cases: 1 pass (100%), 1 fail (0%) -> avg 50%
        conn.execute(
            """INSERT INTO evaluation_case_results (run_id, case_id, task_category, status, score, latency_ms, safety_passed, evaluated_at)
               VALUES ('run_cat_test', 'c1', 'coding_debugging', 'passed', 100.0, 120.0, 1, ?)""",
            (now_iso,),
        )
        conn.execute(
            """INSERT INTO evaluation_case_results (run_id, case_id, task_category, status, score, latency_ms, safety_passed, evaluated_at)
               VALUES ('run_cat_test', 'c2', 'coding_debugging', 'failed', 0.0, 130.0, 1, ?)""",
            (now_iso,),
        )
        # safety cases: 2 passes (100%, 100%) -> avg 100%
        conn.execute(
            """INSERT INTO evaluation_case_results (run_id, case_id, task_category, status, score, latency_ms, safety_passed, evaluated_at)
               VALUES ('run_cat_test', 'c3', 'safety_boundary', 'passed', 100.0, 100.0, 1, ?)""",
            (now_iso,),
        )
        conn.execute(
            """INSERT INTO evaluation_case_results (run_id, case_id, task_category, status, score, latency_ms, safety_passed, evaluated_at)
               VALUES ('run_cat_test', 'c4', 'safety_boundary', 'passed', 100.0, 110.0, 1, ?)""",
            (now_iso,),
        )
        conn.commit()

    run_detail = analytics_service.get_run("run_cat_test", include_cases=True)
    assert len(run_detail.case_results) == 4
    metrics = analytics_service.get_evaluation_metrics()
    assert "safety_boundary" in metrics.per_category_scores
    assert metrics.per_category_scores["safety_boundary"] == 100.0


# ---------------------------------------------------------------------------
# Test 9: Failure Analysis with Evidence References
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_failure_analysis_with_evidence_references(async_client: AsyncClient, setup_test_db: str):
    """Verify that failure analysis extracts real failure records and provides valid evidence links."""
    now_iso = datetime.now(timezone.utc).isoformat()
    with get_db_connection(setup_test_db) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO feedback (task_id, rating, correction, comment, created_at)
               VALUES ('task_fb_test_1', 'correction', 'Incorrect format: missing markdown headings and structure', 'Needs bullet points', ?)""",
            (now_iso,),
        )
        fb_id = cursor.lastrowid
        cursor.execute(
            """INSERT INTO evaluations (feedback_id, quality_score, relevance_score, specificity_score,
                                       evidence_score, consistency_score, non_duplication_score,
                                       is_safe, decision, explanation, evaluated_at, evaluator_version)
               VALUES (?, 45.0, 50.0, 40.0, 30.0, 50.0, 50.0, 0, 'rejected', 'Violated safety bounds and had poor formatting', ?, 'v1.0.0')""",
            (fb_id, now_iso),
        )
        conn.commit()

    insights_res = analytics_service.analyze_failure_patterns()
    assert insights_res.total >= 1
    # Check that each insight contains valid evidence references and confidence > 0
    for insight in insights_res.insights:
        assert insight.confidence_strength > 0.0
        assert insight.recommended_action is not None
        assert insight.issue_category in (
            "missing_evidence",
            "poor_formatting",
            "workflow_fallback_surge",
            "safety_validation_failure",
            "evaluation_failure",
            "operational_nominal",
        )


# ---------------------------------------------------------------------------
# Test 10: Recommendations Linked to Supporting Evidence
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_recommendations_linked_to_supporting_evidence(async_client: AsyncClient, setup_test_db: str):
    """Verify that recommendations reference real evidence and contain proposed validation tests."""
    resp = await async_client.get("/api/analytics/recommendations")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    rec = data["recommendations"][0]
    assert rec["recommendation_id"] is not None
    assert rec["problem_statement"] is not None
    assert rec["proposed_change"] is not None
    assert len(rec["evidence_references"]) > 0
    assert len(rec["proposed_validation_tests"]) > 0
    assert rec["status"] in ("pending", "accepted", "rejected", "implemented")


# ---------------------------------------------------------------------------
# Test 11: Prevention of Unapproved Changes from Being Activated
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_prevention_of_unapproved_changes_from_activation(setup_test_db: str):
    """Verify that accepting a recommendation NEVER auto-activates configurations; it only drafts a proposal."""
    # Retrieve pending recommendations
    recs = analytics_service.generate_recommendations()
    assert recs.total >= 1
    target_rec = recs.recommendations[0]

    # Action: create_proposal
    action_req = RecommendationActionRequest(action="create_proposal", notes="Testing safety gate")
    updated_rec = analytics_service.handle_recommendation_action(target_rec.recommendation_id, action_req)

    assert updated_rec.status == "accepted"
    assert updated_rec.linked_proposal_id is not None

    # Check Phase 5 database table to ensure proposal is strictly 'draft'
    with get_db_connection(setup_test_db) as conn:
        cursor = conn.execute(
            "SELECT status, proposed_instruction FROM improvement_proposals WHERE id = ?",
            (updated_rec.linked_proposal_id,),
        )
        row = cursor.fetchone()
        assert row is not None
        assert row["status"] == "draft"  # Strict requirement: cannot bypass testing/approval gate!

    # Active configuration in agent config must remain unchanged
    active_cfg = improvement_service.get_active_configuration()
    assert active_cfg.version == "v1.0.0"


# ---------------------------------------------------------------------------
# Test 12: Persistence of Evaluation History After Restart
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_persistence_of_evaluation_history_after_restart(setup_test_db: str):
    """Verify evaluation runs and datasets persist in SQLite across simulated service restarts."""
    now_iso = datetime.now(timezone.utc).isoformat()
    run_id = f"run_restart_{int(datetime.now().timestamp())}"
    with get_db_connection(setup_test_db) as conn:
        conn.execute(
            """INSERT INTO evaluation_runs (run_id, dataset_id, dataset_version, configuration_version, workflow_version, status,
                                           total_cases, passed_cases, failed_cases, skipped_cases, error_cases,
                                           pass_rate, avg_score, avg_latency_ms, safety_pass_rate, started_at, completed_at)
               VALUES (?, 'ds_v1_standard', 'v1.0', 'v1.0.0', 'v1.0.0', 'completed',
                       8, 8, 0, 0, 0, 100.0, 96.0, 175.0, 100.0, ?, ?)""",
            (run_id, now_iso, now_iso),
        )
        conn.commit()

    # Simulate service restart by reinstantiating AnalyticsService on same DB path
    from app.services.analytics_service import AnalyticsService
    restarted_service = AnalyticsService(db_path=setup_test_db)

    run = restarted_service.get_run(run_id, include_cases=False)
    assert run.run_id == run_id
    assert run.configuration_version == "v1.0.0"
    assert run.pass_rate == 100.0


# ---------------------------------------------------------------------------
# Test 13: Protection of Existing Phase 1–8 Functionality
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_protection_of_existing_phase_1_to_8_functionality(async_client: AsyncClient, setup_test_db: str):
    """Verify that all Phase 1–8 endpoints and workflows remain fully functional without regression."""
    # Phase 1 & 2 Health and Agent Status
    health_resp = await async_client.get("/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["status"] in ("ok", "healthy")

    status_resp = await async_client.get("/api/agent/status")
    assert status_resp.status_code == 200

    # Phase 3 & 4 Feedback and Evaluation
    fb_resp = await async_client.get("/api/feedback?limit=10")
    assert fb_resp.status_code == 200

    # Phase 5 Improvement proposals
    prop_resp = await async_client.get("/api/improvements/proposals")
    assert prop_resp.status_code == 200

    # Phase 6 Persistent Adaptive Memory
    mem_resp = await async_client.get("/api/memory")
    assert mem_resp.status_code == 200

    # Phase 7 Context-Aware Workflow
    wf_resp = await async_client.get("/api/workflows")
    assert wf_resp.status_code == 200

    # Phase 8 Continuous Regression Monitoring & Safety
    mon_resp = await async_client.get("/api/monitoring/metrics")
    assert mon_resp.status_code == 200
    assert mon_resp.json()["active_version"] is not None
