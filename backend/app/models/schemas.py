"""Pydantic schemas for request and response validation."""

from typing import Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    """Schema for GET /health endpoint response."""

    status: str = Field(default="healthy", description="Current health status of the backend service")
    service: str = Field(default="safeloop-backend", description="Identifier of the backend service")
    version: str = Field(default="0.1.0", description="Semantic version of the backend service")

    model_config = {
        "json_schema_extra": {
            "example": {
                "status": "healthy",
                "service": "safeloop-backend",
                "version": "0.1.0",
            }
        }
    }


class AgentStatusResponse(BaseModel):
    """Schema for GET /api/agent/status endpoint response."""

    provider: str = Field(default="google-gemini", description="AI Provider identifier")
    configured: bool = Field(description="Whether the provider credentials are fully configured")
    model: Optional[str] = Field(default=None, description="Configured model name (if any)")
    status_message: str = Field(description="Human-readable status summary")

    model_config = {
        "json_schema_extra": {
            "example": {
                "provider": "google-gemini",
                "configured": False,
                "model": "gemini-1.5-flash",
                "status_message": "Gemini integration has not yet been activated (Phase 2).",
            }
        }
    }


class ErrorResponse(BaseModel):
    """Consistent error payload schema."""

    detail: str = Field(description="Description of the error condition")
