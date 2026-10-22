"""Agent service managing AI provider readiness and configuration status."""

from app.core.config import settings
from app.models.schemas import AgentStatusResponse


class AgentService:
    """Service to inspect and report AI agent status without exposing secrets."""

    def __init__(self, gemini_api_key: str | None = None, gemini_model: str = "gemini-1.5-flash"):
        self._api_key = gemini_api_key
        self._model = gemini_model

    def get_status(self) -> AgentStatusResponse:
        """Return the current agent provider status.

        In Phase 1, Gemini integration is prepared in configuration but not yet activated.
        Never returns or logs the actual API key.
        """
        has_key = bool(self._api_key and self._api_key.strip())

        if has_key:
            message = (
                "Gemini API key is configured in environment, but agent integration will be "
                "activated in Phase 2."
            )
        else:
            message = "Gemini integration has not yet been activated (Phase 2)."

        return AgentStatusResponse(
            provider="google-gemini",
            configured=has_key,
            model=self._model if (has_key or self._model) else None,
            status_message=message,
        )


# Default singleton bound to application settings
agent_service = AgentService(
    gemini_api_key=settings.gemini_api_key,
    gemini_model=settings.gemini_model,
)
