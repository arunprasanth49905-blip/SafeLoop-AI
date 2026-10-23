"""Automated End-to-End Integration Tests for SafeLoop AI Phase 10: Final Integration & Production Readiness.

Validates the complete closed-loop lifecycle across all 10 workflow verification steps:
1. Submit a user task to the agent.
2. Collect feedback on the response.
3. Evaluate the feedback and record the decision and explanation.
4. Generate an improvement proposal from eligible evidence.
5. Require approval before applying changes that need approval (prevent unauthorized activation).
6. Verify that approved learning memories persist and are retrieved appropriately.
7. Verify workflow selection and optimization.
8. Confirm safety monitoring detects configured violations or regressions.
9. Run evaluation analytics and inspect the saved results.
10. Confirm that the system does not claim improvement unless the evaluation evidence supports it.
"""

from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.core.database import init_db
from app.models.schemas import ChatResponse, EvaluationRunRequest
from app.services.agent_service import agent_service
from app.services.analytics_service import analytics_service
from app.services.evaluation_service import evaluation_service
from app.services.feedback_service import feedback_service
from app.services.improvement_service import improvement_service
from app.services.memory_service import memory_service
from app.services.monitoring_service import monitoring_service
from app.services.workflow_service import workflow_service


@pytest.fixture(autouse=True)
def setup_test_db(tmp_path: Path):
    """Isolate tests using a fresh temporary SQLite database."""
    test_db_path = str(tmp_path / "test_phase10_e2e.db")
    init_db(test_db_path)

    old_fb = feedback_service._db_path
    old_eval = evaluation_service._db_path
    old_imp = improvement_service._db_path
    old_mem = memory_service._db_path
    old_wf = workflow_service._db_path
    old_mon = monitoring_service._db_path
    old_ana = analytics_service._db_path

    feedback_service._db_path = test_db_path
    evaluation_service._db_path = test_db_path
    improvement_service._db_path = test_db_path
    memory_service._db_path = test_db_path
    workflow_service._db_path = test_db_path
    monitoring_service._db_path = test_db_path
    analytics_service._db_path = test_db_path

    yield test_db_path

    feedback_service._db_path = old_fb
    evaluation_service._db_path = old_eval
    improvement_service._db_path = old_imp
    memory_service._db_path = old_mem
    workflow_service._db_path = old_wf
    monitoring_service._db_path = old_mon
    analytics_service._db_path = old_ana


@pytest.mark.anyio
async def test_complete_end_to_end_closed_loop_lifecycle(async_client: AsyncClient):
    """Test the complete 10-step closed-loop lifecycle across all integrated phases."""

    # -------------------------------------------------------------------------
    # Step 1: Submit a user task to the agent
    # -------------------------------------------------------------------------
    with patch.object(
        agent_service,
        "generate_chat",
        new=AsyncMock(
            return_value=ChatResponse(
                text="To sort a list in Python, use list.sort() or the sorted() built-in function.",
                model="mock-gemini",
                task_id="task_e2e_001",
                status="success",
                latency_ms=120,
            )
        ),
    ):
        chat_resp = await async_client.post(
            "/api/agent/chat",
            json={"prompt": "How do I sort a list in Python?", "task_id": "task_e2e_001"},
        )
    assert chat_resp.status_code == 200
    chat_data = chat_resp.json()
    assert chat_data["status"] == "success"
    task_id = chat_data["task_id"]
    assert task_id == "task_e2e_001"

    # -------------------------------------------------------------------------
    # Step 2: Collect feedback on the response
    # -------------------------------------------------------------------------
    fb_resp = await async_client.post(
        "/api/feedback",
        json={
            "task_id": task_id,
            "rating": "correction",
            "correction": "Always specify that list.sort() sorts in place, while sorted() returns a new list.",
            "comment": "Good answer but needs distinction between in-place and returning new list.",
        },
    )
    assert fb_resp.status_code == 201
    fb_data = fb_resp.json()
    fb_id = fb_data["id"]
    assert fb_data["task_id"] == task_id
    assert fb_data["rating"] == "correction"
    assert fb_data["evaluation_status"] == "unevaluated"

    # -------------------------------------------------------------------------
    # Step 3: Evaluate feedback and record decision and explanation
    # -------------------------------------------------------------------------
    eval_resp = await async_client.post(f"/api/evaluations/evaluate/{fb_id}")
    assert eval_resp.status_code == 200
    eval_data = eval_resp.json()
    assert eval_data["decision"] in ("approved", "rejected", "flagged_for_review")
    assert eval_data["explanation"] is not None
    assert len(eval_data["explanation"]) > 0
    assert eval_data["quality_score"] is not None

    # Verify the feedback item now reflects the evaluation decision and explanation
    fb_get = await async_client.get(f"/api/feedback/{fb_id}")
    assert fb_get.status_code == 200
    updated_fb = fb_get.json()
    assert updated_fb["evaluation_status"] == "evaluated"
    assert updated_fb["decision"] == eval_data["decision"]
    assert updated_fb["explanation"] == eval_data["explanation"]

    # -------------------------------------------------------------------------
    # Step 4: Generate an improvement proposal from eligible evidence
    # -------------------------------------------------------------------------
    prop_resp = await async_client.post(
        "/api/improvements/proposals/generate",
        json={
            "feedback_ids": [fb_id],
            "custom_hint": "Clearly explain in-place mutation vs returning new instances.",
        },
    )
    assert prop_resp.status_code == 201
    prop_data = prop_resp.json()
    prop_id = prop_data["id"]
    assert prop_data["status"] == "draft"
    assert prop_data["proposed_instruction"] is not None

    # -------------------------------------------------------------------------
    # Step 5: Require approval before applying changes (prevent unapproved activation)
    # -------------------------------------------------------------------------
    # Attempting to activate a draft proposal MUST fail with HTTP 400
    unapproved_act = await async_client.post(f"/api/improvements/proposals/{prop_id}/activate")
    assert unapproved_act.status_code == 400

    # Run regression tests on candidate proposal
    test_res = await async_client.post(f"/api/improvements/proposals/{prop_id}/test")
    assert test_res.status_code == 200
    assert test_res.json()["status"] == "tested"

    # Explicit human review approval
    approve_res = await async_client.post(
        f"/api/improvements/proposals/{prop_id}/approve",
        json={"reason": "Verified safe and accurate documentation standard."},
    )
    assert approve_res.status_code == 200
    assert approve_res.json()["status"] == "approved"

    # Now activation succeeds and updates active configuration
    activate_res = await async_client.post(f"/api/improvements/proposals/{prop_id}/activate")
    assert activate_res.status_code == 200
    active_cfg = activate_res.json()
    assert active_cfg["is_active"] is True
    assert prop_id in active_cfg["proposal_id"]

    # -------------------------------------------------------------------------
    # Step 6: Verify learning memories persist and are retrieved appropriately
    # -------------------------------------------------------------------------
    mem_cand_resp = await async_client.post(
        "/api/memory/candidate",
        json={
            "title": "Python List Sorting In-Place vs New",
            "lesson": "Remind developers that list.sort() operates in-place while sorted() creates a new list.",
            "category": "code_precision",
            "task_domain": "python",
            "source_type": "feedback",
            "source_feedback_id": fb_id,
            "confidence_score": 0.95,
        },
    )
    assert mem_cand_resp.status_code == 201
    mem_cand_data = mem_cand_resp.json()
    mem_id = mem_cand_data["id"]
    assert mem_cand_data["status"] == "candidate"

    # Human review approval makes memory active in runtime
    approve_mem_resp = await async_client.post(
        f"/api/memory/{mem_id}/approve",
        json={"reason": "Verified technical accuracy for python list sorting."},
    )
    assert approve_mem_resp.status_code == 200
    assert approve_mem_resp.json()["status"] == "active"

    # Retrieve memory using relevant task query
    retrieval_resp = await async_client.post(
        "/api/memory/retrieve",
        json={"prompt": "How do I sort a list without changing the original?", "limit": 3},
    )
    assert retrieval_resp.status_code == 200
    retrieval_data = retrieval_resp.json()
    retrieved_items = retrieval_data["retrieved"]
    assert len(retrieved_items) >= 1
    assert any("list.sort()" in item["memory"]["lesson"] for item in retrieved_items)

    # -------------------------------------------------------------------------
    # Step 7: Verify workflow selection and optimization
    # -------------------------------------------------------------------------
    wf_select = await async_client.post(
        "/api/workflows/classify",
        json={"prompt": "Analyze code complexity and perform unit test verification."},
    )
    assert wf_select.status_code == 200
    wf_selection = wf_select.json()
    assert wf_selection["category"] in (
        "general_qa",
        "explanation_learning",
        "coding_debugging",
        "structured_writing",
        "data_analysis",
        "multi_step_reasoning",
        "ambiguous_unsupported",
    )
    assert wf_selection["confidence"] > 0.0
    assert wf_selection["suggested_workflow_id"] is not None

    wf_preview = await async_client.post(
        "/api/workflows/preview",
        json={"prompt": "Analyze code complexity and perform unit test verification."},
    )
    assert wf_preview.status_code == 200
    assert wf_preview.json()["selected_workflow_id"] is not None

    # -------------------------------------------------------------------------
    # Step 8: Confirm safety monitoring detects configured violations / alerts
    # -------------------------------------------------------------------------
    health_resp = await async_client.get("/api/monitoring/health")
    assert health_resp.status_code == 200
    assert health_resp.json()["overall_status"] in ("healthy", "warning", "critical", "degraded", "insufficient_data")

    baseline_resp = await async_client.get("/api/monitoring/baseline")
    assert baseline_resp.status_code == 200
    assert baseline_resp.json()["baseline_version"] == "v1.0.0"

    reg_test = await async_client.post(
        "/api/monitoring/regression-test",
        json={"candidate_version": active_cfg["version"]},
    )
    assert reg_test.status_code == 200
    reg_data = reg_test.json()
    assert "safety_violations" in reg_data
    assert "safety_pass_rate" in reg_data

    # -------------------------------------------------------------------------
    # Step 9: Run evaluation analytics and inspect saved results
    # -------------------------------------------------------------------------
    with patch.object(
        agent_service,
        "generate_chat",
        new=AsyncMock(
            return_value=ChatResponse(
                text="Precise mock output adhering to guidelines without credentials.",
                model="mock-gemini",
                task_id="eval_run_task",
                status="success",
                latency_ms=100,
            )
        ),
    ):
        run_resp = await async_client.post(
            "/api/analytics/runs",
            json=EvaluationRunRequest(
                dataset_id="ds_v1_standard",
                configuration_version=active_cfg["version"],
                run_label="Phase 10 E2E Verification Run",
            ).model_dump(),
        )
    assert run_resp.status_code in (200, 201)
    run_data = run_resp.json()
    run_id = run_data["run_id"]
    assert run_data["total_cases"] >= 1
    assert run_data["status"] == "completed"

    # Inspect saved run detail
    detail_resp = await async_client.get(f"/api/analytics/runs/{run_id}?include_cases=true")
    assert detail_resp.status_code == 200
    saved_detail = detail_resp.json()
    assert saved_detail["run_id"] == run_id
    assert len(saved_detail.get("case_results") or []) >= 1

    # -------------------------------------------------------------------------
    # Step 10: Confirm no claim of improvement unless supported by evidence
    # -------------------------------------------------------------------------
    compare_resp = await async_client.get(
        f"/api/analytics/compare?baseline_run_id={run_id}&candidate_run_id={run_id}"
    )
    assert compare_resp.status_code == 200
    comp_data = compare_resp.json()
    # Comparing identical runs MUST show 0.0 delta and not claim false improvement
    assert comp_data["pass_rate_delta"] == 0.0
    assert comp_data["score_delta"] == 0.0
    assert comp_data["comparison_summary"] is not None

    # Check evidence-based recommendations endpoint
    rec_resp = await async_client.get("/api/analytics/recommendations")
    assert rec_resp.status_code == 200
    assert "recommendations" in rec_resp.json()
