"""Provider adapters for the N-Eye remote reasoning gateway."""

from .base import BaseProviderAdapter, ProviderError, ProviderTimeoutError, ProviderRateLimitError, ProviderAuthError
from .mock import MockProviderAdapter
from .gemini import GeminiProviderAdapter
from .openai_compatible import OpenAICompatibleAdapter

__all__ = [
    "BaseProviderAdapter",
    "ProviderError",
    "ProviderTimeoutError",
    "ProviderRateLimitError",
    "ProviderAuthError",
    "MockProviderAdapter",
    "GeminiProviderAdapter",
    "OpenAICompatibleAdapter",
]
