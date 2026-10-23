"""Agent service managing AI provider readiness and Google Gemini integration."""

import asyncio
import time
import uuid
from typing import Optional

from google import genai
from google.genai import errors, types

from app.core.config import inspect_raw_key_in_file, settings
from app.core.logging import logger
from app.models.schemas import (
    AgentStatusResponse,
    ChatResponse,
    KeyDiagnosticResponse,
    ModelTestResponse,
)


class AgentServiceError(Exception):
    """Base exception for agent service failures."""

    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class AgentNotConfiguredError(AgentServiceError):
    """Raised when an agent invocation is attempted without an API key."""

    def __init__(self, message: str = "Gemini API key is not configured. Please set GEMINI_API_KEY in backend/.env."):
        super().__init__(message, status_code=503)


class AgentAuthenticationError(AgentServiceError):
    """Raised when Gemini API authentication fails (invalid API key or unauthorized)."""

    def __init__(
        self,
        message: str = (
            "Gemini API authentication failed (401 UNAUTHENTICATED): "
            "The configured API key was rejected by Google AI Studio. "
            "Please verify the key and its restrictions in Google AI Studio."
        ),
    ):
        super().__init__(message, status_code=401)


class AgentModelNotFoundError(AgentServiceError):
    """Raised when the requested Gemini model is not found or unsupported."""

    def __init__(self, message: str = "Configured Gemini model was not found."):
        super().__init__(message, status_code=404)


class AgentModelError(AgentServiceError):
    """Raised when Gemini returns an invalid argument or configuration error for the model."""

    def __init__(self, message: str = "Invalid argument or configuration provided to Gemini model."):
        super().__init__(message, status_code=400)


class AgentRateLimitError(AgentServiceError):
    """Raised when Gemini API rate limit or quota is exceeded."""

    def __init__(self, message: str = "Gemini API rate limit exceeded. Please retry shortly."):
        super().__init__(message, status_code=429)


class AgentProviderError(AgentServiceError):
    """Raised when Gemini API returns an upstream provider error."""

    def __init__(self, message: str = "Gemini provider encountered an error generating content.", status_code: int = 502):
        super().__init__(message, status_code=status_code)


class AgentTimeoutError(AgentServiceError):
    """Raised when the Gemini API request times out."""

    def __init__(self, message: str = "Request to Gemini API timed out."):
        super().__init__(message, status_code=504)


class AgentService:
    """Service orchestrating AI agent status and Gemini inference."""

    def __init__(self, gemini_api_key: str | None = None, gemini_model: str = "gemini-2.5-flash"):
        self._api_key = gemini_api_key
        self._model = gemini_model

    @property
    def is_configured(self) -> bool:
        """Check whether the Gemini API key is configured and non-empty."""
        return bool(self._api_key and self._api_key.strip())

    @property
    def model_name(self) -> str:
        """Get the configured Gemini model name, dynamically referencing settings if unset."""
        return self._model or settings.gemini_model

    @model_name.setter
    def model_name(self, value: str) -> None:
        self._model = value

    def _sanitize_message(self, text: str) -> str:
        """Sanitize error messages to ensure no credentials or sensitive tokens appear."""
        if not text:
            return ""
        sanitized = text
        if self._api_key and self._api_key in sanitized:
            sanitized = sanitized.replace(self._api_key, "[REDACTED_API_KEY]")
        return sanitized

    def get_diagnostic(self) -> KeyDiagnosticResponse:
        """Return safe diagnostic metadata without revealing the API key or its contents."""
        raw_info = inspect_raw_key_in_file()
        key_exists = self.is_configured
        char_count = len(self._api_key) if self._api_key else 0
        return KeyDiagnosticResponse(
            key_exists=key_exists,
            character_count=char_count,
            has_surrounding_quotes=raw_info.get("has_surrounding_quotes", False),
            has_surrounding_whitespace=raw_info.get("has_surrounding_whitespace", False),
            env_file_loaded=raw_info.get("env_file_exists", False),
            model=self.model_name,
        )

    def get_status(self, include_diagnostic: bool = True) -> AgentStatusResponse:
        """Return the current agent provider status.

        In Phase 2, reports active readiness when configured.
        Never returns or logs the actual API key.
        """
        configured = self.is_configured
        effective_model = self.model_name

        if configured:
            message = f"Gemini integration active with model '{effective_model}'."
        else:
            message = "Gemini integration requires GEMINI_API_KEY in backend/.env."

        diagnostic = self.get_diagnostic() if include_diagnostic else None

        return AgentStatusResponse(
            provider="google-gemini",
            configured=configured,
            model=effective_model,
            status_message=message,
            diagnostic=diagnostic,
        )

    def _get_client(self) -> genai.Client:
        """Instantiate and return the official Google GenAI client."""
        if not self.is_configured:
            raise AgentNotConfiguredError()
        return genai.Client(api_key=self._api_key)

    async def test_generation(self, model: Optional[str] = None) -> ModelTestResponse:
        """Execute a minimal generation request to test integration and model readiness.

        Never logs or exposes the API key or secret contents.
        """
        target_model = model.strip() if (model and model.strip()) else self.model_name

        if not self.is_configured:
            return ModelTestResponse(
                model=target_model,
                success=False,
                status_code=503,
                error="Gemini API key is not configured.",
            )

        start_time = time.perf_counter()
        client = self._get_client()

        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=target_model,
                    contents="ping",
                ),
                timeout=15.0,
            )
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            sample_text = (response.text or "").strip()[:50]
            return ModelTestResponse(
                model=target_model,
                success=True,
                status_code=200,
                latency_ms=latency_ms,
                text_sample=sample_text,
            )
        except errors.APIError as exc:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            code = getattr(exc, "code", 502) or 502
            sanitized_err = self._sanitize_message(exc.message if hasattr(exc, "message") else str(exc))
            return ModelTestResponse(
                model=target_model,
                success=False,
                status_code=code,
                latency_ms=latency_ms,
                error=f"Gemini API error ({code}): {sanitized_err}",
            )
        except Exception as exc:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            return ModelTestResponse(
                model=target_model,
                success=False,
                status_code=500,
                latency_ms=latency_ms,
                error=f"Unexpected error: {self._sanitize_message(str(exc))}",
            )

    async def generate_chat(
        self,
        prompt: str,
        task_id: Optional[str] = None,
        system_instruction: Optional[str] = None,
        timeout_seconds: float = 30.0,
    ) -> ChatResponse:
        """Send a prompt to the configured Gemini model and return structured telemetry.

        Args:
            prompt: User task prompt (pre-validated).
            task_id: Optional task identifier (auto-generated if omitted).
            system_instruction: Optional system instruction for context guidance.
            timeout_seconds: Max seconds to wait for generation.

        Returns:
            ChatResponse containing generated text, model, task_id, and latency.
        """
        if not self.is_configured:
            logger.warning("Agent chat rejected: GEMINI_API_KEY is not configured")
            raise AgentNotConfiguredError()

        target_model = self.model_name
        effective_task_id = task_id.strip() if (task_id and task_id.strip()) else f"task_{uuid.uuid4().hex[:8]}"
        start_time = time.perf_counter()

        logger.info(
            "Dispatching task %s to Gemini model %s (prompt length: %d chars)",
            effective_task_id,
            target_model,
            len(prompt),
        )

        client = self._get_client()

        # Phase 6: Retrieve relevant validated adaptive memories
        retrieved_memory_ids: List[str] = []
        effective_prompt = prompt
        try:
            from app.services.memory_service import memory_service
            retrieved_items = memory_service.retrieve_relevant_memories(prompt=prompt)
            if retrieved_items:
                retrieved_memory_ids = [item.memory.id for item in retrieved_items]
                memory_lines = []
                for idx, item in enumerate(retrieved_items, 1):
                    memory_lines.append(
                        f"[{idx}] ({item.memory.category} / {item.memory.task_domain}): {item.memory.lesson}"
                    )
                lessons_block = "\n".join(memory_lines)
                effective_prompt = (
                    "=== RELEVANT VALIDATED LESSONS (Supporting Context) ===\n"
                    f"{lessons_block}\n"
                    "NOTE: These lessons are supporting context. User instructions and system safety policies take precedence.\n"
                    "=== END SUPPORTING CONTEXT ===\n\n"
                    f"User Request:\n{prompt}"
                )
                logger.info(
                    "Retrieved %d active adaptive memories for task %s: %s",
                    len(retrieved_memory_ids),
                    effective_task_id,
                    retrieved_memory_ids,
                )
        except Exception as mem_exc:
            logger.warning("Non-fatal: memory retrieval encountered an error: %s", mem_exc)
            retrieved_memory_ids = []
            effective_prompt = prompt

        config = None
        if system_instruction and system_instruction.strip():
            config = types.GenerateContentConfig(
                system_instruction=system_instruction.strip()
            )
        else:
            # Phase 5: Incorporate active versioned behavioral instructions when no custom override is passed
            effective_instructions: List[str] = []
            try:
                from app.services.improvement_service import improvement_service
                active_cfg = improvement_service.get_active_configuration()
                effective_instructions.extend(active_cfg.instructions)
            except Exception as cfg_exc:
                logger.debug("Non-fatal: could not load active configuration instructions: %s", cfg_exc)

            if effective_instructions:
                guidelines_block = "\n".join(f"- {inst}" for inst in effective_instructions)
                config = types.GenerateContentConfig(
                    system_instruction=f"Approved Continuous Improvement Guidelines:\n{guidelines_block}"
                )

        try:
            # Async execution using official client.aio
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=target_model,
                    contents=effective_prompt,
                    config=config,
                ),
                timeout=timeout_seconds,
            )
        except asyncio.TimeoutError:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error("Gemini generation timed out after %sms for task %s", latency_ms, effective_task_id)
            raise AgentTimeoutError()
        except errors.APIError as exc:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            error_code = getattr(exc, "code", None)
            error_str = str(exc)
            sanitized_str = self._sanitize_message(error_str)
            raw_msg = exc.message if hasattr(exc, "message") else error_str
            sanitized_msg = self._sanitize_message(raw_msg)

            logger.error(
                "Gemini API error for task %s (code: %s, latency: %sms): %s",
                effective_task_id,
                error_code or "UNKNOWN",
                latency_ms,
                sanitized_str,
            )

            # 1. Authentication failure (HTTP 401 / UNAUTHENTICATED / invalid key)
            if (
                error_code == 401
                or "UNAUTHENTICATED" in error_str
                or "API key not valid" in error_str
                or "ACCESS_TOKEN_TYPE_UNSUPPORTED" in error_str
                or "API_KEY_INVALID" in error_str
            ):
                raise AgentAuthenticationError(
                    "Gemini API authentication failed (401 UNAUTHENTICATED): "
                    "The provided API key was rejected by Google AI Studio. "
                    "Please verify that the key in backend/.env is an active Gemini API key from Google AI Studio "
                    "and that its project restrictions permit Generative Language API calls."
                )

            # 2. Rate limits or resource exhausted (HTTP 429 / RESOURCE_EXHAUSTED)
            if error_code == 429 or "RESOURCE_EXHAUSTED" in error_str:
                raise AgentRateLimitError("Gemini quota or rate limit exceeded. Please try again in a few moments.")

            # 3. Model not found (HTTP 404 / NOT_FOUND)
            if error_code == 404 or "NOT_FOUND" in error_str:
                raise AgentModelNotFoundError(
                    f"Gemini model error (404 NOT_FOUND): Model '{target_model}' was not found or is unavailable."
                )

            # 4. Invalid arguments (HTTP 400 / INVALID_ARGUMENT)
            if error_code == 400 or "INVALID_ARGUMENT" in error_str:
                raise AgentModelError(f"Gemini model error (400 INVALID_ARGUMENT): {sanitized_msg}")

            # 5. Generic upstream provider failure
            raise AgentProviderError(f"Gemini API error: {sanitized_msg}", status_code=502)
        except Exception as exc:
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(
                "Unexpected provider error during Gemini generation for task %s: %s",
                effective_task_id,
                self._sanitize_message(str(exc)),
            )
            raise AgentProviderError(f"Unexpected provider error: {self._sanitize_message(str(exc))}")

        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        generated_text = response.text or ""

        logger.info(
            "Task %s completed successfully in %sms (generated %d chars)",
            effective_task_id,
            latency_ms,
            len(generated_text),
        )

        # Record task interaction context for Phase 4 evaluation relevance check
        try:
            from app.services.evaluation_service import evaluation_service
            evaluation_service.record_interaction(
                task_id=effective_task_id,
                prompt=prompt,
                response_text=generated_text,
                model=target_model,
            )
        except Exception as rec_exc:
            logger.debug("Non-fatal: could not record task interaction: %s", rec_exc)

        # Phase 6: Record memory usage telemetry without logging sensitive contents
        if retrieved_memory_ids:
            try:
                from app.services.memory_service import memory_service
                memory_service.record_usage(retrieved_memory_ids)
            except Exception as mem_u_exc:
                logger.debug("Non-fatal: could not record memory usage: %s", mem_u_exc)

        return ChatResponse(
            text=generated_text,
            model=target_model,
            task_id=effective_task_id,
            status="success",
            latency_ms=latency_ms,
            retrieved_memory_ids=retrieved_memory_ids,
            memory_retrieval_applied=bool(retrieved_memory_ids),
        )


# Default singleton bound to application settings
agent_service = AgentService(
    gemini_api_key=settings.gemini_api_key,
    gemini_model=settings.gemini_model,
)


