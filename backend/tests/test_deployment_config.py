"""Deployment configuration tests verifying production environment behavior, CORS origin parsing, and health security."""

import pytest
from httpx import AsyncClient

from app.core.config import Settings


def test_cors_allowed_origins_parsing_comma_separated():
    """Verify ALLOWED_ORIGINS parses comma-separated production origins."""
    s = Settings(allowed_origins="https://safeloop.vercel.app,http://localhost:5173")
    assert "https://safeloop.vercel.app" in s.allowed_origins
    assert "http://localhost:5173" in s.allowed_origins


def test_cors_allowed_origins_parsing_json_array():
    """Verify ALLOWED_ORIGINS parses JSON array strings from environment."""
    s = Settings(allowed_origins='["https://safeloop-custom.vercel.app", "http://127.0.0.1:5173"]')
    assert "https://safeloop-custom.vercel.app" in s.allowed_origins
    assert "http://127.0.0.1:5173" in s.allowed_origins


def test_host_and_port_env_aliases():
    """Verify that HOST and PORT are configurable via environment variables."""
    s = Settings(HOST="0.0.0.0", PORT="10000")
    assert s.host == "0.0.0.0"
    assert s.port == 10000


def test_database_path_env_alias():
    """Verify DATABASE_PATH alias for cloud disk mount."""
    s = Settings(DATABASE_PATH="/data/custom_safeloop.db")
    assert s.database_path == "/data/custom_safeloop.db"


@pytest.mark.anyio
async def test_health_endpoint_security(async_client: AsyncClient):
    """Verify /health endpoint returns clean operational status without leaking credentials or secrets."""
    resp = await async_client.get("/health")
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "healthy"
    assert "service" in data
    assert "version" in data

    # Verify no secret fields are exposed in response
    resp_text = resp.text.lower()
    assert "key" not in resp_text
    assert "secret" not in resp_text
    assert "password" not in resp_text
