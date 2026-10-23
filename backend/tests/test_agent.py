"""Tests for agent status and chat endpoints using mocked Gemini SDK calls."""

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from google.genai import errors
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.schemas import AgentStatusResponse, ChatResponse
from app.services.agent_service import AgentService, agent_service


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
        assert validated.model is not None


@pytest.mark.anyio
async def test_agent_status_never_exposes_api_key():
    """Verify that the API key is never exposed in response body or keys."""
    secret_key = "AIzaSySecretTestKeyNotToBeLeaked123"
    custom_service = AgentService(gemini_api_key=secret_key, gemini_model="gemini-1.5-pro")
    status = custom_service.get_status()

    serialized = status.model_dump()
    assert secret_key not in str(serialized)
    assert "api_key" not in serialized
    assert "key" not in serialized
    assert status.configured is True
    assert status.model == "gemini-1.5-pro"
    assert "Gemini integration active" in status.status_message


def test_agent_service_unconfigured_message():
    """Verify unconfigured status reports requirement of GEMINI_API_KEY."""
    service = AgentService(gemini_api_key=None, gemini_model="gemini-1.5-flash")
    status = service.get_status()
    assert status.provider == "google-gemini"
    assert status.configured is False
    assert "GEMINI_API_KEY in backend/.env" in status.status_message


@pytest.mark.anyio
async def test_chat_endpoint_fails_when_unconfigured():
    """Verify POST /api/agent/chat returns HTTP 503 when API key is not configured."""
    with patch.object(agent_service, "_api_key", None):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/agent/chat",
                json={"prompt": "Analyze safe feedback loops."},
            )
            assert response.status_code == 503
            data = response.json()
            assert "detail" in data
            assert "GEMINI_API_KEY" in data["detail"]


@pytest.mark.anyio
async def test_chat_endpoint_validates_empty_prompt():
    """Verify POST /api/agent/chat rejects empty or whitespace-only prompts with HTTP 422."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Empty string
        res1 = await client.post("/api/agent/chat", json={"prompt": ""})
        assert res1.status_code == 422

        # Whitespace only
        res2 = await client.post("/api/agent/chat", json={"prompt": "   \n\t   "})
        assert res2.status_code == 422


@pytest.mark.anyio
async def test_chat_endpoint_success_mocked():
    """Verify POST /api/agent/chat returns HTTP 200 with structured response on mocked Gemini generation."""
    mock_genai_response = MagicMock()
    mock_genai_response.text = "Feedback loops allow autonomous agents to self-improve safely."

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_genai_response)

    with patch.object(agent_service, "_api_key", "test_key_mock_123"), \
         patch.object(agent_service, "_get_client", return_value=mock_client):

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/agent/chat",
                json={
                    "prompt": "What are feedback loops?",
                    "task_id": "test_task_001",
                    "system_instruction": "Act as an AI safety researcher.",
                },
            )
            assert response.status_code == 200
            data = response.json()
            validated = ChatResponse(**data)
            assert validated.text == "Feedback loops allow autonomous agents to self-improve safely."
            assert validated.task_id == "test_task_001"
            assert validated.status == "success"
            assert validated.latency_ms >= 0
            assert "test_key_mock_123" not in str(data)

            # Check that generate_content was called with prompt
            mock_client.aio.models.generate_content.assert_called_once()
            call_kwargs = mock_client.aio.models.generate_content.call_args.kwargs
            assert call_kwargs["contents"] == "What are feedback loops?"
            assert call_kwargs["config"].system_instruction == "Act as an AI safety researcher."


@pytest.mark.anyio
async def test_chat_endpoint_rate_limit_error():
    """Verify POST /api/agent/chat handles Gemini rate limits with HTTP 429."""
    # Simulate APIError with code 429
    rate_limit_err = errors.APIError(429, {"error": {"message": "Resource exhausted: quota exceeded"}})

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=rate_limit_err)

    with patch.object(agent_service, "_api_key", "test_key_mock_123"), \
         patch.object(agent_service, "_get_client", return_value=mock_client):

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/agent/chat",
                json={"prompt": "Trigger rate limit test."},
            )
            assert response.status_code == 429
            data = response.json()
            assert "rate limit" in data["detail"].lower() or "quota" in data["detail"].lower()


@pytest.mark.anyio
async def test_chat_endpoint_provider_error():
    """Verify POST /api/agent/chat handles upstream provider errors with HTTP 502."""
    provider_err = errors.APIError(500, {"error": {"message": "Internal model processing failure"}})

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=provider_err)

    with patch.object(agent_service, "_api_key", "test_key_mock_123"), \
         patch.object(agent_service, "_get_client", return_value=mock_client):

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/agent/chat",
                json={"prompt": "Trigger provider error test."},
            )
            assert response.status_code == 502
            data = response.json()
            assert "Gemini API error" in data["detail"]


@pytest.mark.anyio
async def test_chat_endpoint_timeout_error():
    """Verify POST /api/agent/chat handles timeouts with HTTP 504."""
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=asyncio.TimeoutError())

    with patch.object(agent_service, "_api_key", "test_key_mock_123"), \
         patch.object(agent_service, "_get_client", return_value=mock_client):

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/agent/chat",
                json={"prompt": "Trigger timeout test."},
            )
            assert response.status_code == 504
            data = response.json()
            assert "timed out" in data["detail"].lower()


@pytest.mark.anyio
async def test_agent_diagnostic_endpoint_safe():
    """Verify GET /api/agent/diagnostic returns safe metadata without leaking key or prefix."""
    secret_key = "AIzaSySuperSecretDiagnosticKey456"
    with patch.object(agent_service, "_api_key", secret_key):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/agent/diagnostic")
            assert response.status_code == 200
            data = response.json()
            assert data["key_exists"] is True
            assert data["character_count"] == len(secret_key)
            assert "has_surrounding_quotes" in data
            assert "has_surrounding_whitespace" in data
            assert secret_key not in str(data)
            assert "AIzaSy" not in str(data)


@pytest.mark.anyio
async def test_chat_endpoint_authentication_error_distinguished():
    """Verify POST /api/agent/chat handles HTTP 401 UNAUTHENTICATED distinctly from 502 gateway errors."""
    auth_err = errors.APIError(
        401,
        {
            "error": {
                "code": 401,
                "message": "API key not valid. Please pass a valid API key.",
                "status": "UNAUTHENTICATED",
                "details": [{"reason": "ACCESS_TOKEN_TYPE_UNSUPPORTED"}],
            }
        },
    )

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=auth_err)

    with patch.object(agent_service, "_api_key", "test_key_mock_123"), \
         patch.object(agent_service, "_get_client", return_value=mock_client):

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/agent/chat",
                json={"prompt": "Test auth error."},
            )
            assert response.status_code == 401
            data = response.json()
            assert "authentication failed" in data["detail"].lower()
            assert "401" in data["detail"]
            assert "test_key_mock_123" not in str(data)


@pytest.mark.anyio
async def test_chat_endpoint_model_not_found_error():
    """Verify POST /api/agent/chat handles HTTP 404 NOT_FOUND distinctly as a model error."""
    not_found_err = errors.APIError(
        404,
        {
            "error": {
                "code": 404,
                "message": "models/gemini-invalid is not found for API version v1beta",
                "status": "NOT_FOUND",
            }
        },
    )

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=not_found_err)

    with patch.object(agent_service, "_api_key", "test_key_mock_123"), \
         patch.object(agent_service, "_get_client", return_value=mock_client):

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/agent/chat",
                json={"prompt": "Test model error."},
            )
            assert response.status_code == 404
            data = response.json()
            assert "model error" in data["detail"].lower()


def test_config_cleans_quotes_and_whitespace():
    """Verify clean_gemini_api_key trims surrounding whitespace and quotes."""
    from app.core.config import Settings

    assert Settings.clean_gemini_api_key('  "AIzaSyTestKey123"  ') == "AIzaSyTestKey123"
    assert Settings.clean_gemini_api_key("  'AIzaSyTestKey123'  ") == "AIzaSyTestKey123"
    assert Settings.clean_gemini_api_key("   ") is None
    assert Settings.clean_gemini_api_key(None) is None


def test_agent_error_sanitizes_key_leakage():
    """Verify that even if an upstream error message contains the API key, it is redacted."""
    service = AgentService(gemini_api_key="SECRET_LEAKY_KEY_XYZ")
    sanitized = service._sanitize_message("Error with key SECRET_LEAKY_KEY_XYZ at endpoint")
    assert "SECRET_LEAKY_KEY_XYZ" not in sanitized
    assert "[REDACTED_API_KEY]" in sanitized


@pytest.mark.anyio
async def test_diagnostic_test_endpoint_success():
    """Verify GET /api/agent/diagnostic/test returns successful generation telemetry."""
    mock_response = MagicMock()
    mock_response.text = "pong"

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch.object(agent_service, "_api_key", "test_key_mock_123"), \
         patch.object(agent_service, "_get_client", return_value=mock_client):

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/agent/diagnostic/test?model=gemini-2.5-flash-lite")
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is True
            assert data["status_code"] == 200
            assert data["model"] == "gemini-2.5-flash-lite"
            assert data["text_sample"] == "pong"
            assert data["error"] is None
            assert "test_key_mock_123" not in str(data)


@pytest.mark.anyio
async def test_diagnostic_test_endpoint_model_not_found():
    """Verify GET /api/agent/diagnostic/test reports 404 cleanly when model is not found."""
    not_found_err = errors.APIError(
        404,
        {
            "error": {
                "code": 404,
                "message": "models/gemini-2.5-flash is not found for API version v1beta",
                "status": "NOT_FOUND",
            }
        },
    )

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(side_effect=not_found_err)

    with patch.object(agent_service, "_api_key", "test_key_mock_123"), \
         patch.object(agent_service, "_get_client", return_value=mock_client):

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/agent/diagnostic/test?model=gemini-2.5-flash")
            assert response.status_code == 200
            data = response.json()
            assert data["success"] is False
            assert data["status_code"] == 404
            assert data["model"] == "gemini-2.5-flash"
            assert "404" in data["error"]


def test_config_cleans_gemini_model_quotes_and_whitespace():
    """Verify clean_gemini_model trims whitespace and surrounding quotes."""
    from app.core.config import Settings

    assert Settings.clean_gemini_model('  "gemini-2.5-flash-lite"  ') == "gemini-2.5-flash-lite"
    assert Settings.clean_gemini_model("  'gemini-2.5-pro'  ") == "gemini-2.5-pro"
    assert Settings.clean_gemini_model("   ") == "gemini-2.5-flash"
    assert Settings.clean_gemini_model(None) == "gemini-2.5-flash"


def test_settings_lowercase_attributes():
    """Verify settings object exposes lowercase gemini_api_key and gemini_model."""
    from app.core.config import settings

    assert hasattr(settings, "gemini_api_key")
    assert hasattr(settings, "gemini_model")
    assert isinstance(settings.gemini_model, str)


