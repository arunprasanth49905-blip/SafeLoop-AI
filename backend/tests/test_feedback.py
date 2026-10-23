"""Automated tests for Phase 3 Feedback Collection system."""

import os
from pathlib import Path
import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import settings
from app.core.database import init_db
from app.main import app
from app.models.schemas import FeedbackCreateRequest
from app.services.feedback_service import FeedbackService, feedback_service


@pytest.fixture(autouse=True)
def setup_test_db(tmp_path: Path):
    """Isolate tests using a fresh temporary SQLite database."""
    test_db_path = str(tmp_path / "test_feedback.db")
    init_db(test_db_path)

    # Point feedback_service to the test DB
    old_path = feedback_service._db_path
    feedback_service._db_path = test_db_path

    yield test_db_path

    # Restore
    feedback_service._db_path = old_path


@pytest.mark.anyio
async def test_submit_helpful_feedback(async_client: AsyncClient):
    """Test 1: Submitting helpful feedback succeeds and returns stored record."""
    payload = {
        "task_id": "task_1001",
        "rating": "helpful",
        "comment": "The response was precise, well structured, and insightful.",
    }
    response = await async_client.post("/api/feedback", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] is not None
    assert data["task_id"] == "task_1001"
    assert data["rating"] == "helpful"
    assert data["comment"] == "The response was precise, well structured, and insightful."
    assert data["correction"] is None
    assert "created_at" in data


@pytest.mark.anyio
async def test_submit_not_helpful_feedback(async_client: AsyncClient):
    """Test 2: Submitting not-helpful feedback succeeds."""
    payload = {
        "task_id": "task_1002",
        "rating": "not_helpful",
        "comment": "Response failed to address the edge cases specified.",
    }
    response = await async_client.post("/api/feedback", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] is not None
    assert data["task_id"] == "task_1002"
    assert data["rating"] == "not_helpful"
    assert data["comment"] == "Response failed to address the edge cases specified."


@pytest.mark.anyio
async def test_submit_correction_feedback(async_client: AsyncClient):
    """Test 3: Submitting a correction with valid correction text succeeds."""
    payload = {
        "task_id": "task_1003",
        "rating": "correction",
        "correction": "The optimal algorithmic complexity is O(N log N) using a merge sort rather than O(N^2).",
        "comment": "Corrected the theoretical complexity statement.",
    }
    response = await async_client.post("/api/feedback", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["id"] is not None
    assert data["task_id"] == "task_1003"
    assert data["rating"] == "correction"
    assert "O(N log N)" in data["correction"]


@pytest.mark.anyio
async def test_reject_invalid_rating(async_client: AsyncClient):
    """Test 4: Rejecting an invalid rating value returns 422 Unprocessable Entity."""
    payload = {
        "task_id": "task_1004",
        "rating": "neutral",  # Invalid rating
        "comment": "Neither good nor bad",
    }
    response = await async_client.post("/api/feedback", json=payload)
    assert response.status_code == 422


@pytest.mark.anyio
async def test_reject_correction_without_text(async_client: AsyncClient):
    """Test 5: Rejecting a correction without correction text returns 422."""
    payload_empty = {
        "task_id": "task_1005",
        "rating": "correction",
        "correction": "   ",  # Whitespace only
        "comment": "Missing actual correction",
    }
    response = await async_client.post("/api/feedback", json=payload_empty)
    assert response.status_code == 422

    payload_none = {
        "task_id": "task_1005",
        "rating": "correction",
        "comment": "Missing actual correction",
    }
    response2 = await async_client.post("/api/feedback", json=payload_none)
    assert response2.status_code == 422


@pytest.mark.anyio
async def test_retrieve_feedback_records_and_pagination(async_client: AsyncClient):
    """Test 6: Retrieving feedback records with pagination."""
    # Seed 5 records
    for i in range(5):
        await async_client.post(
            "/api/feedback",
            json={
                "task_id": f"task_batch_{i}",
                "rating": "helpful" if i % 2 == 0 else "not_helpful",
                "comment": f"Comment {i}",
            },
        )

    # List all
    res = await async_client.get("/api/feedback?limit=10&offset=0")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 5
    assert len(data["items"]) == 5

    # Paginate with limit=2, offset=0
    res_page1 = await async_client.get("/api/feedback?limit=2&offset=0")
    assert res_page1.status_code == 200
    page1_data = res_page1.json()
    assert len(page1_data["items"]) == 2
    assert page1_data["total"] == 5

    # Paginate with limit=2, offset=2
    res_page2 = await async_client.get("/api/feedback?limit=2&offset=2")
    assert res_page2.status_code == 200
    page2_data = res_page2.json()
    assert len(page2_data["items"]) == 2
    # Ensure distinct items
    assert page1_data["items"][0]["id"] != page2_data["items"][0]["id"]


@pytest.mark.anyio
async def test_feedback_statistics(async_client: AsyncClient):
    """Test 7: Retrieving feedback statistics calculates accurate counts and ratios."""
    # Empty stats initially
    empty_stats = await async_client.get("/api/feedback/stats")
    assert empty_stats.status_code == 200
    assert empty_stats.json() == {
        "total_count": 0,
        "helpful_count": 0,
        "not_helpful_count": 0,
        "correction_count": 0,
        "helpful_ratio": 0.0,
    }

    # Add 3 helpful, 1 not_helpful, 1 correction
    for _ in range(3):
        await async_client.post("/api/feedback", json={"rating": "helpful"})
    await async_client.post("/api/feedback", json={"rating": "not_helpful"})
    await async_client.post(
        "/api/feedback",
        json={"rating": "correction", "correction": "Use vector search."},
    )

    stats_res = await async_client.get("/api/feedback/stats")
    assert stats_res.status_code == 200
    stats = stats_res.json()
    assert stats["total_count"] == 5
    assert stats["helpful_count"] == 3
    assert stats["not_helpful_count"] == 1
    assert stats["correction_count"] == 1
    assert stats["helpful_ratio"] == 0.6  # 3 / 5 = 0.6


@pytest.mark.anyio
async def test_linking_feedback_to_valid_task_id(async_client: AsyncClient):
    """Test 8: Linking feedback to a specific task ID and retrieving by task_id."""
    target_task = "task_link_xyz_777"
    await async_client.post(
        "/api/feedback",
        json={
            "task_id": target_task,
            "rating": "helpful",
            "comment": "Specific to target task.",
        },
    )
    await async_client.post(
        "/api/feedback",
        json={
            "task_id": "other_task_999",
            "rating": "not_helpful",
        },
    )

    res = await async_client.get(f"/api/feedback?task_id={target_task}")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["task_id"] == target_task


@pytest.mark.anyio
def test_persistence_across_service_restarts(tmp_path: Path):
    """Test 9: Verifies that feedback data survives backend service re-initialization."""
    db_file = str(tmp_path / "persistent_restart_test.db")
    init_db(db_file)

    # First session: write feedback record
    service_session_1 = FeedbackService(db_path=db_file)
    created = service_session_1.create_feedback(
        FeedbackCreateRequest(
            task_id="task_restart_101",
            rating="helpful",
            comment="Should survive restart",
        )
    )
    rec_id = created.id

    # Simulate application restart: instantiate completely new service connected to same file
    service_session_2 = FeedbackService(db_path=db_file)
    recovered = service_session_2.get_feedback_by_id(rec_id)

    assert recovered is not None
    assert recovered.id == rec_id
    assert recovered.task_id == "task_restart_101"
    assert recovered.rating == "helpful"
    assert recovered.comment == "Should survive restart"

    stats = service_session_2.get_stats()
    assert stats.total_count == 1
    assert stats.helpful_count == 1


@pytest.mark.anyio
async def test_feedback_not_found_error(async_client: AsyncClient):
    """Test 10: Retrieving a nonexistent feedback ID returns 404."""
    response = await async_client.get("/api/feedback/999999")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.anyio
async def test_existing_chat_unaffected(async_client: AsyncClient, monkeypatch):
    """Test 11: Validates that existing Phase 2 Gemini chat and health endpoints remain unaffected."""
    # Health endpoint works
    health_res = await async_client.get("/health")
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "healthy"

    # Agent status endpoint works
    status_res = await async_client.get("/api/agent/status")
    assert status_res.status_code == 200
    assert "provider" in status_res.json()

    # Chat endpoint validation still enforces non-empty prompts
    chat_empty = await async_client.post("/api/agent/chat", json={"prompt": "   "})
    assert chat_empty.status_code == 422
