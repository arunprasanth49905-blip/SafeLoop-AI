"""Comprehensive automated tests for Phase 7: Context-Aware Workflow and Tool Optimization."""

import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.core.database import get_db_connection, init_db
from app.models.schemas import ChatResponse
from app.services.agent_service import agent_service
from app.services.memory_service import memory_service
from app.services.workflow_service import workflow_service


@pytest.fixture(autouse=True)
def setup_test_db(tmp_path: Path):
    """Isolate tests using a fresh temporary SQLite database."""
    test_db_path = str(tmp_path / "test_workflows.db")
    init_db(test_db_path)

    old_wf_path = workflow_service._db_path
    old_mem_path = memory_service._db_path

    workflow_service._db_path = test_db_path
    memory_service._db_path = test_db_path

    yield test_db_path

    workflow_service._db_path = old_wf_path
    memory_service._db_path = old_mem_path


# ---------------------------------------------------------------------------
# Test 1: Task Classification
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_task_classification_representative_tasks(async_client: AsyncClient):
    """Verify correct classification across distinct representative task categories."""
    # 1. Coding & Debugging
    code_res = await async_client.post(
        "/api/workflows/classify",
        json={"prompt": "Write a Python function to implement binary search with type hints and test cases."},
    )
    assert code_res.status_code == 200
    code_data = code_res.json()
    assert code_data["category"] == "coding_debugging"
    assert code_data["confidence"] >= 0.70
    assert code_data["suggested_workflow_id"] == "code_synthesis_workflow"
    assert code_data["fallback_needed"] is False

    # 2. Explanation & Learning
    expl_res = await async_client.post(
        "/api/workflows/classify",
        json={"prompt": "Explain the concept of quantum entanglement and superposition in physics."},
    )
    assert expl_res.status_code == 200
    expl_data = expl_res.json()
    assert expl_data["category"] == "explanation_learning"
    assert expl_data["confidence"] >= 0.70
    assert expl_data["suggested_workflow_id"] == "structured_explanation_workflow"
    assert expl_data["fallback_needed"] is False

    # 3. Multi-Step Reasoning
    reason_res = await async_client.post(
        "/api/workflows/classify",
        json={"prompt": "Solve this logic puzzle step by step: evaluate the scenario and calculate probability."},
    )
    assert reason_res.status_code == 200
    reason_data = reason_res.json()
    assert reason_data["category"] == "multi_step_reasoning"
    assert reason_data["confidence"] >= 0.70
    assert reason_data["suggested_workflow_id"] == "step_by_step_reasoning_workflow"

    # 4. Structured Writing
    write_res = await async_client.post(
        "/api/workflows/classify",
        json={"prompt": "Write a formal report executive summary documenting our quarterly metrics."},
    )
    assert write_res.status_code == 200
    write_data = write_res.json()
    assert write_data["category"] == "structured_writing"
    assert write_data["suggested_workflow_id"] == "structured_document_workflow"


# ---------------------------------------------------------------------------
# Test 2: Ambiguous-Task Fallback
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_ambiguous_task_fallback(async_client: AsyncClient):
    """Verify ambiguous or extremely brief tasks trigger low confidence and fallback_needed."""
    # Extremely brief input "ml"
    res1 = await async_client.post(
        "/api/workflows/classify",
        json={"prompt": "ml"},
    )
    assert res1.status_code == 200
    d1 = res1.json()
    assert d1["category"] == "ambiguous_unsupported"
    assert d1["confidence"] <= 0.50
    assert d1["fallback_needed"] is True
    assert d1["suggested_workflow_id"] == "default_chat_workflow"

    # Generic greeting "hey"
    res2 = await async_client.post(
        "/api/workflows/classify",
        json={"prompt": "hey there"},
    )
    assert res2.status_code == 200
    d2 = res2.json()
    assert d2["category"] == "ambiguous_unsupported"
    assert d2["fallback_needed"] is True


# ---------------------------------------------------------------------------
# Test 3: Selection of Suitable Registered Workflow
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_workflow_preview_selection(async_client: AsyncClient):
    """Verify context-aware workflow selection preview returns matching workflow definition."""
    res = await async_client.post(
        "/api/workflows/preview",
        json={"prompt": "def merge_sort(arr): implement merge sort in Python with time complexity O(N log N)"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["selected_workflow_id"] == "code_synthesis_workflow"
    assert data["workflow_version"] == "v1.0.0"
    assert data["task_category"] == "coding_debugging"
    assert data["fallback_used"] is False
    assert "code_synthesis_workflow" in data["selected_workflow_id"]
    assert "input_sanitizer" in data["permitted_tools"]


# ---------------------------------------------------------------------------
# Test 4: Rejection / Fallback for Unavailable or Disabled Workflow
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_unavailable_workflow_fallback(async_client: AsyncClient):
    """Verify requesting an invalid or unavailable workflow override falls back safely."""
    res = await async_client.post(
        "/api/workflows/preview",
        json={
            "prompt": "Explain photosynthesis.",
            "requested_workflow_id": "nonexistent_specialized_workflow_999",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["selected_workflow_id"] == "default_chat_workflow"
    assert data["fallback_used"] is True
    assert "unavailable or disabled" in data["selection_reason"].lower()


# ---------------------------------------------------------------------------
# Test 5: Safe Fallback to Existing Gemini Chat
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_ambiguous_workflow_preview_falls_back_to_default(async_client: AsyncClient):
    """Verify ambiguous prompt safely defaults to standard conversational chat workflow."""
    res = await async_client.post(
        "/api/workflows/preview",
        json={"prompt": "ml"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["selected_workflow_id"] == "default_chat_workflow"
    assert data["fallback_used"] is True
    assert "ambiguous or unsupported" in data["selection_reason"].lower()


# ---------------------------------------------------------------------------
# Test 6: Retrieval of ONLY Validated Memories
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_retrieval_of_only_validated_memories(async_client: AsyncClient, setup_test_db: str):
    """Verify workflow selection retrieves only approved/active Phase 6 memories, ignoring candidates."""
    # Insert an approved memory and a candidate memory
    with get_db_connection(setup_test_db) as conn:
        cursor = conn.cursor()
        now = "2026-10-23T12:00:00Z"
        # Approved memory
        cursor.execute(
            """
            INSERT INTO adaptive_memories (
                id, title, lesson, category, task_domain, confidence_score,
                validation_status, status, version, usage_count, keywords,
                privacy_safety_passed, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, 1, ?, ?);
            """,
            (
                "mem_approved_001",
                "Quicksort Pivot Rule",
                "Always choose randomized or median-of-three pivot to avoid worst-case O(N^2) complexity.",
                "code_precision",
                "coding",
                0.95,
                "approved",
                "active",
                json.dumps(["quicksort", "pivot", "algorithm"]),
                now,
                now,
            ),
        )
        # Candidate memory (unvalidated)
        cursor.execute(
            """
            INSERT INTO adaptive_memories (
                id, title, lesson, category, task_domain, confidence_score,
                validation_status, status, version, usage_count, keywords,
                privacy_safety_passed, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, 1, ?, ?);
            """,
            (
                "mem_candidate_002",
                "Unverified Rule",
                "Draft instruction not yet vetted by safety review.",
                "workflow_correction",
                "coding",
                0.40,
                "candidate",
                "candidate",
                json.dumps(["quicksort", "draft"]),
                now,
                now,
            ),
        )
        conn.commit()

    res = await async_client.post(
        "/api/workflows/preview",
        json={"prompt": "Write a quicksort algorithm in Python."},
    )
    assert res.status_code == 200
    data = res.json()
    assert "mem_approved_001" in data["relevant_memory_ids"]
    assert "mem_candidate_002" not in data["relevant_memory_ids"]


# ---------------------------------------------------------------------------
# Test 7: Rejection of Unauthorized or Dangerous Tools
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_rejection_of_unauthorized_tools(async_client: AsyncClient):
    """Verify unauthorized or unavailable tools (code execution, direct SQL) are rejected with 403."""
    # Attempt to execute code_execution_sandbox
    res1 = await async_client.post(
        "/api/workflows/tools/execute",
        json={
            "tool_id": "code_execution_sandbox",
            "parameters": {"code": "import os; os.system('ls')"},
        },
    )
    assert res1.status_code == 403
    assert "unavailable and unauthorized" in res1.json()["detail"].lower()

    # Attempt to execute live_web_search
    res2 = await async_client.post(
        "/api/workflows/tools/execute",
        json={
            "tool_id": "live_web_search",
            "parameters": {"query": "latest news"},
        },
    )
    assert res2.status_code == 403
    assert "unavailable and unauthorized" in res2.json()["detail"].lower()

    # Unknown unregistered tool
    res3 = await async_client.post(
        "/api/workflows/tools/execute",
        json={"tool_id": "arbitrary_shell_executor", "parameters": {}},
    )
    assert res3.status_code == 400
    assert "not registered" in res3.json()["detail"].lower()


# ---------------------------------------------------------------------------
# Test 8: Tool Argument Validation & Safe Internal Tools
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_safe_internal_tools_execution(async_client: AsyncClient):
    """Verify permitted internal tools execute safely and validate inputs properly."""
    # 1. Input Sanitizer
    san_res = await async_client.post(
        "/api/workflows/tools/execute",
        json={"tool_id": "input_sanitizer", "parameters": {"text": "Hello\x00\x08World\nSafeLoop"}},
    )
    assert san_res.status_code == 200
    san_data = san_res.json()
    assert san_data["success"] is True
    assert san_data["output"]["sanitized_text"] == "HelloWorld\nSafeLoop"

    # 2. Token Estimator
    tok_res = await async_client.post(
        "/api/workflows/tools/execute",
        json={"tool_id": "token_estimator", "parameters": {"text": "This is a prompt test for token estimation."}},
    )
    assert tok_res.status_code == 200
    tok_data = tok_res.json()
    assert tok_data["success"] is True
    assert tok_data["output"]["estimated_tokens"] >= 5

    # 3. JSON Formatter with invalid payload
    bad_json_res = await async_client.post(
        "/api/workflows/tools/execute",
        json={"tool_id": "json_formatter", "parameters": {"json_text": "{invalid json"}},
    )
    assert bad_json_res.status_code == 200
    bad_data = bad_json_res.json()
    assert bad_data["success"] is False
    assert "validation failed" in bad_data["output"].lower()


# ---------------------------------------------------------------------------
# Test 9: Timeout and Bounded Retries Configuration
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_workflow_registry_parameters(async_client: AsyncClient):
    """Verify all registered workflows have bounded retries and explicit timeouts."""
    res = await async_client.get("/api/workflows")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] >= 5
    for wf in data["workflows"]:
        assert 10.0 <= wf["timeout_seconds"] <= 60.0
        assert 0 <= wf["max_retries"] <= 3
        assert len(wf["safety_constraints"]) > 0


# ---------------------------------------------------------------------------
# Test 10: Workflow Execution History Persistence
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_workflow_execution_persistence(async_client: AsyncClient, setup_test_db: str):
    """Verify executing a workflow persists telemetry in the SQLite workflow_executions table."""
    mock_chat_response = ChatResponse(
        text="def quicksort(arr: list) -> list:\n    return sorted(arr)",
        model="gemini-2.5-flash",
        task_id="task_exec_persist_001",
        latency_ms=145.2,
    )

    with patch.object(agent_service, "generate_chat", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = mock_chat_response

        exec_res = await async_client.post(
            "/api/workflows/execute",
            json={
                "prompt": "Write a quicksort function in Python with type hints.",
                "task_id": "task_exec_persist_001",
            },
        )
        assert exec_res.status_code == 200
        exec_data = exec_res.json()
        assert exec_data["task_id"] == "task_exec_persist_001"
        assert exec_data["workflow_id"] == "code_synthesis_workflow"
        assert exec_data["status"] == "success"

    # Verify database persistence
    list_res = await async_client.get("/api/workflows/executions")
    assert list_res.status_code == 200
    list_data = list_res.json()
    assert list_data["total"] >= 1
    found = next((item for item in list_data["items"] if item["task_id"] == "task_exec_persist_001"), None)
    assert found is not None
    assert found["workflow_id"] == "code_synthesis_workflow"
    assert found["task_category"] == "coding_debugging"


# ---------------------------------------------------------------------------
# Test 11: Workflow Metrics Aggregation
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_workflow_metrics_aggregation(async_client: AsyncClient, setup_test_db: str):
    """Verify /api/workflows/metrics accurately computes totals, success rate, and category breakdowns."""
    with get_db_connection(setup_test_db) as conn:
        cursor = conn.cursor()
        now = "2026-10-23T13:00:00Z"
        # Insert 2 successes, 1 fallback
        cursor.execute(
            """
            INSERT INTO workflow_executions (
                task_id, workflow_id, workflow_version, task_category, confidence,
                selection_reason, fallback_used, memory_ids_used, execution_status,
                latency_ms, created_at
            ) VALUES
            ('t1', 'code_synthesis_workflow', 'v1.0.0', 'coding_debugging', 0.90, 'Reason 1', 0, '[]', 'success', 120.0, ?),
            ('t2', 'structured_explanation_workflow', 'v1.0.0', 'explanation_learning', 0.85, 'Reason 2', 0, '[]', 'success', 140.0, ?),
            ('t3', 'default_chat_workflow', 'v1.0.0', 'ambiguous_unsupported', 0.30, 'Reason 3', 1, '[]', 'fallback', 80.0, ?);
            """,
            (now, now, now),
        )
        conn.commit()

    res = await async_client.get("/api/workflows/metrics")
    assert res.status_code == 200
    metrics = res.json()
    assert metrics["total_executions"] == 3
    assert metrics["success_rate"] == 66.7
    assert metrics["fallback_rate"] == 33.3
    assert metrics["average_latency_ms"] == 113.33
    assert metrics["executions_by_category"]["coding_debugging"] == 1
    assert metrics["executions_by_category"]["ambiguous_unsupported"] == 1


# ---------------------------------------------------------------------------
# Test 12: Prevention of Uncontrolled Execution Loops
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_prevention_of_uncontrolled_execution_loops(async_client: AsyncClient):
    """Verify tool execution does not allow nested recursive invocations and workflows enforce bounded attempts."""
    wf = workflow_service.get_workflow("code_synthesis_workflow")
    assert wf is not None
    assert wf.max_retries <= 2
    # Verify tools do not accept sub-tool invocations
    tools = workflow_service.list_tools()
    for t in tools:
        assert t.tool_id not in ["invoke_tool", "execute_workflow", "subagent_loop"]


# ---------------------------------------------------------------------------
# Test 13: Preservation of Existing Phase 1–6 Functionality
# ---------------------------------------------------------------------------

@pytest.mark.anyio
async def test_preservation_of_existing_phases(async_client: AsyncClient):
    """Verify health, feedback, evaluation, improvement, and memory endpoints remain unregressed."""
    # Health (Phase 1)
    health = await async_client.get("/health")
    assert health.status_code == 200

    # Agent Status (Phase 2)
    status_res = await async_client.get("/api/agent/status")
    assert status_res.status_code == 200

    # Feedback Stats (Phase 3)
    fb_stats = await async_client.get("/api/feedback/stats")
    assert fb_stats.status_code == 200

    # Evaluation Stats (Phase 4)
    eval_stats = await async_client.get("/api/evaluations/stats")
    assert eval_stats.status_code == 200

    # Continuous Improvement Stats (Phase 5)
    imp_stats = await async_client.get("/api/improvements/stats")
    assert imp_stats.status_code == 200

    # Memory Stats (Phase 6)
    mem_stats = await async_client.get("/api/memory/stats")
    assert mem_stats.status_code == 200
