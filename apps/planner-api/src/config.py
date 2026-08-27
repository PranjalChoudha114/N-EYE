"""Server-side configuration for the N-Eye Planner Gateway.

This module manages remote provider API keys and gateway operational limits.
Provider credentials remain strictly server-side so that client extension
bundles never expose API secrets to hostile web pages or client-side inspection.
"""

from dataclasses import dataclass, field
import os
from typing import List
from dotenv import load_dotenv

# Load local environment variables from .env if present
load_dotenv()


@dataclass(frozen=True)
class PlannerConfig:
    """Immutable server configuration for planner routing and boundaries."""

    provider: str = os.getenv("PLANNER_PROVIDER", "mock").lower()
    model: str = os.getenv("PLANNER_MODEL", "gemini-2.5-flash")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_base_url: str = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    host: str = os.getenv("PLANNER_HOST", "0.0.0.0")
    port: int = int(os.getenv("PLANNER_PORT", "8000"))
    max_payload_bytes: int = int(os.getenv("PLANNER_MAX_PAYLOAD_BYTES", "262144"))  # 256 KB safety bound
    request_timeout_seconds: float = float(os.getenv("PLANNER_REQUEST_TIMEOUT_SECONDS", "15.0"))
    allowed_origins: List[str] = field(
        default_factory=lambda: [
            origin.strip()
            for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000").split(",")
            if origin.strip()
        ]
    )


def get_config() -> PlannerConfig:
    """Return the global server configuration snapshot."""
    return PlannerConfig()
