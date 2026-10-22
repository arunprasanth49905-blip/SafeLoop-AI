"""Application settings using Pydantic Settings."""

import json
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """SafeLoop AI backend configuration loaded from environment variables."""

    app_name: str = "SafeLoop AI"
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = True
    host: str = "127.0.0.1"
    port: int = 8000

    # CORS configuration
    allowed_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # AI Provider configuration (Phase 2 readiness - optional in Phase 1)
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-1.5-flash"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def parse_allowed_origins(cls, value: Union[str, List[str]]) -> List[str]:
        """Support comma-separated strings or JSON arrays in env variables."""
        if isinstance(value, str):
            value = value.strip()
            if value.startswith("[") and value.endswith("]"):
                try:
                    parsed = json.loads(value)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if item]
                except json.JSONDecodeError:
                    pass
            # Comma-separated fallback
            return [part.strip() for part in value.split(",") if part.strip()]
        if isinstance(value, list):
            return [str(item).strip() for item in value if item]
        return ["http://localhost:5173", "http://127.0.0.1:5173"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


# Singleton settings instance
settings = Settings()
