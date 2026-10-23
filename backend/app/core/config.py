"""Application settings using Pydantic Settings."""

import json
from pathlib import Path
from typing import List, Optional, Union
from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"


def inspect_raw_key_in_file(env_file_path: Path = ENV_FILE) -> dict:
    """Inspect the raw .env file for quote and whitespace characteristics safely.

    Never logs or stores the key contents, prefix, or secrets.
    """
    info = {
        "has_surrounding_quotes": False,
        "has_surrounding_whitespace": False,
        "raw_length": 0,
        "env_file_exists": env_file_path.exists(),
        "env_file_path": str(env_file_path),
    }
    if not env_file_path.exists():
        return info

    try:
        lines = env_file_path.read_text(encoding="utf-8", errors="replace").splitlines()
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            if "=" in stripped:
                k, v = stripped.split("=", 1)
                k_clean = k.strip().upper()
                if k_clean in ("GEMINI_API_KEY", "GOOGLE_API_KEY"):
                    info["raw_length"] = len(v)
                    info["has_surrounding_whitespace"] = v.startswith((" ", "\t")) or v.endswith((" ", "\t"))
                    v_trimmed = v.strip()
                    info["has_surrounding_quotes"] = (
                        (v_trimmed.startswith('"') and v_trimmed.endswith('"') and len(v_trimmed) >= 2)
                        or (v_trimmed.startswith("'") and v_trimmed.endswith("'") and len(v_trimmed) >= 2)
                    )
                    break
    except Exception:
        pass
    return info


class Settings(BaseSettings):
    """SafeLoop AI backend configuration loaded from environment variables."""

    app_name: str = "SafeLoop AI"
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = True
    host: str = Field(
        default="0.0.0.0",
        validation_alias=AliasChoices("HOST", "host"),
    )
    port: int = Field(
        default=8000,
        validation_alias=AliasChoices("PORT", "port"),
    )

    # CORS configuration
    allowed_origins: List[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    # Persistence configuration (Phase 3 Feedback Storage)
    database_path: str = Field(
        default=str(BASE_DIR / "data" / "safeloop.db"),
        validation_alias=AliasChoices(
            "DATABASE_PATH",
            "database_path",
            "DATABASE_URL",
            "database_url",
        ),
    )

    # AI Provider configuration (Phase 2 readiness)
    gemini_api_key: Optional[str] = Field(
        default=None,
        validation_alias=AliasChoices(
            "GEMINI_API_KEY",
            "gemini_api_key",
            "GOOGLE_API_KEY",
            "google_api_key",
        ),
    )
    gemini_model: str = Field(
        default="gemini-2.5-flash",
        validation_alias=AliasChoices(
            "GEMINI_MODEL",
            "gemini_model",
        ),
    )

    # Persistent Adaptive Memory configuration (Phase 6)
    memory_retrieval_enabled: bool = Field(
        default=True,
        validation_alias=AliasChoices(
            "MEMORY_RETRIEVAL_ENABLED",
            "memory_retrieval_enabled",
        ),
    )
    memory_max_retrieval_count: int = Field(
        default=3,
        validation_alias=AliasChoices(
            "MEMORY_MAX_RETRIEVAL_COUNT",
            "memory_max_retrieval_count",
        ),
    )
    memory_min_relevance_score: float = Field(
        default=0.25,
        validation_alias=AliasChoices(
            "MEMORY_MIN_RELEVANCE_SCORE",
            "memory_min_relevance_score",
        ),
    )

    @field_validator("gemini_model", mode="before")
    @classmethod
    def clean_gemini_model(cls, value: Optional[str]) -> str:
        """Ensure model name is trimmed and stripped of accidental enclosing quotes."""
        if not value:
            return "gemini-2.5-flash"
        v = str(value).strip()
        if len(v) >= 2 and ((v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'"))):
            v = v[1:-1].strip()
        return v or "gemini-2.5-flash"

    @field_validator("gemini_api_key", mode="before")
    @classmethod
    def clean_gemini_api_key(cls, value: Optional[str]) -> Optional[str]:
        """Ensure API key is trimmed and stripped of accidental enclosing quotes."""
        if value is None:
            return None
        if isinstance(value, str):
            v = value.strip()
            # Remove enclosing double or single quotes if present
            if len(v) >= 2 and ((v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'"))):
                v = v[1:-1].strip()
            return v if v else None
        return value

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
        env_file=[str(ENV_FILE), ".env"],
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )


# Singleton settings instance
settings = Settings()

