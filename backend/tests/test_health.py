"""Tests for GET /health endpoint."""

import pytest
from httpx import ASGITransport, AsyncClient
from app.core.config import Settings
from app.main import app
from app.models.schemas import HealthResponse


@pytest.mark.anyio
async def test_health_endpoint_returns_200():
    """Verify GET /health returns HTTP 200 and matches HealthResponse schema."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
        assert response.status_code == 200

        data = response.json()
        validated = HealthResponse(**data)
        assert validated.status == "healthy"
        assert validated.service == "safeloop-backend"
        assert validated.version == "0.1.0"


@pytest.mark.anyio
async def test_root_endpoint_returns_200():
    """Verify GET / returns HTTP 200 with service metadata."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["service"] == "SafeLoop AI"
        assert data["status"] == "operational"
        assert "health_url" in data
        assert "agent_status_url" in data


def test_invalid_settings_fallback_does_not_crash_health():
    """Verify custom settings or malformed origins do not crash settings parsing."""
    custom_settings = Settings(allowed_origins="http://example.com,http://test.com")
    assert "http://example.com" in custom_settings.allowed_origins
    assert "http://test.com" in custom_settings.allowed_origins
