"""Tests for GET /api/agent/status endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app
from app.models.schemas import AgentStatusResponse
from app.services.agent_service import AgentService


@pytest.mark.anyio
async def test_agent_status_endpoint_returns_200():
    """Verify GET /api/agent/status returns HTTP 200 and matches AgentStatusResponse schema."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/agent/status")
        assert response.status_code == 200

        data = response.json()
        validated = AgentStatusResponse(**data)
        assert validated.provider == "google-gemini"
        assert isinstance(validated.configured, bool)
        assert "Phase 2" in validated.status_message


@pytest.mark.anyio
async def test_agent_status_never_exposes_api_key():
    """Verify that the API key is never exposed in response body or keys."""
    # Even if an API key is set in service
    secret_key = "AIzaSySecretTestKeyNotToBeLeaked123"
    custom_service = AgentService(gemini_api_key=secret_key, gemini_model="gemini-1.5-pro")
    status = custom_service.get_status()

    serialized = status.model_dump()
    assert secret_key not in str(serialized)
    assert "api_key" not in serialized
    assert "key" not in serialized
    assert status.configured is True
    assert status.model == "gemini-1.5-pro"


def test_agent_service_default_phase1_unconfigured():
    """Verify default Phase 1 status reports Gemini as not activated."""
    service = AgentService(gemini_api_key=None, gemini_model="gemini-1.5-flash")
    status = service.get_status()
    assert status.provider == "google-gemini"
    assert status.configured is False
    assert "not yet been activated" in status.status_message
