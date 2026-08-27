"""Abstract interface and normalized error definitions for remote reasoning providers.

This interface enforces provider-independence: whether reasoning is handled by
Gemini, OpenAI, or a deterministic test harness, the rest of N-Eye interacts
with a single uniform proposal contract.
"""

from abc import ABC, abstractmethod
from typing import Optional, Tuple
from ..schemas.safe_context import SafeContext
from ..schemas.action_proposal import ActionProposal


class ProviderError(Exception):
    """Base exception for all upstream AI reasoning provider failures."""

    def __init__(self, message: str, is_retryable: bool = False):
        super().__init__(message)
        self.is_retryable = is_retryable


class ProviderTimeoutError(ProviderError):
    """Raised when an AI provider call times out."""

    def __init__(self, message: str = "Provider reasoning request timed out"):
        super().__init__(message, is_retryable=True)


class ProviderRateLimitError(ProviderError):
    """Raised when the provider quota or rate limit is exhausted."""

    def __init__(self, message: str = "Provider rate limit exceeded"):
        super().__init__(message, is_retryable=False)


class ProviderAuthError(ProviderError):
    """Raised when provider credentials are missing or unauthorized."""

    def __init__(self, message: str = "Provider authentication failed"):
        super().__init__(message, is_retryable=False)


class ProviderSchemaError(ProviderError):
    """Raised when the provider returns unparseable or schema-violating data."""

    def __init__(self, message: str = "Provider returned invalid ActionProposal schema"):
        super().__init__(message, is_retryable=False)


class BaseProviderAdapter(ABC):
    """Abstract adapter decoupling N-Eye from vendor-specific AI SDKs."""

    @abstractmethod
    async def propose(
        self, context: SafeContext, request_id: str
    ) -> Tuple[ActionProposal, Optional[int], Optional[int]]:
        """Generate a constrained ActionProposal from egress-approved SafeContext.

        Returns:
            Tuple of (ActionProposal, inputTokenCount, outputTokenCount)
        """
        pass

    @abstractmethod
    def get_provider_name(self) -> str:
        """Return the normalized provider identifier."""
        pass

    @abstractmethod
    def get_model_name(self) -> str:
        """Return the model identifier."""
        pass
