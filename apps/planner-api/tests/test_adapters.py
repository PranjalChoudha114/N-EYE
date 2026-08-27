"""Tests for mock, Gemini, and OpenAI-compatible provider adapters."""

import pytest
from src.adapters.mock import MockProviderAdapter
from src.adapters.gemini import GeminiProviderAdapter
from src.adapters.openai_compatible import OpenAICompatibleAdapter
from src.adapters.base import ProviderAuthError, ProviderSchemaError, ProviderTimeoutError
from src.schemas.safe_context import SafeContext


@pytest.mark.asyncio
async def test_mock_adapter_proposes_type_token(sample_safe_context: SafeContext):
    """Test that mock adapter proposes TYPE_TOKEN for email inputs."""
    adapter = MockProviderAdapter()
    proposal, in_tok, out_tok = await adapter.propose(sample_safe_context, "req_1")

    assert proposal.type == "TYPE_TOKEN"
    assert proposal.targetId == "e1"
    assert proposal.tokenSymbol == "[EMAIL_1]"
    assert proposal.riskLevel == "MEDIUM"


@pytest.mark.asyncio
async def test_mock_adapter_proposes_click_on_submit(sample_safe_context: SafeContext):
    """Test that mock adapter proposes CLICK on submit button when no token is needed."""
    # Modify context so no token is available
    context = sample_safe_context.model_copy(update={"availableTokens": []})
    adapter = MockProviderAdapter()
    proposal, _, _ = await adapter.propose(context, "req_2")

    assert proposal.type == "CLICK"
    assert proposal.targetId == "e2"
    assert proposal.riskLevel == "HIGH"


def test_gemini_adapter_rejects_missing_api_key(sample_safe_context: SafeContext):
    """Ensure Gemini adapter raises ProviderAuthError when API key is missing."""
    adapter = GeminiProviderAdapter(api_key="")
    with pytest.raises(ProviderAuthError):
        import asyncio
        asyncio.run(adapter.propose(sample_safe_context, "req_3"))


def test_openai_adapter_rejects_missing_api_key(sample_safe_context: SafeContext):
    """Ensure OpenAI adapter raises ProviderAuthError when API key is missing."""
    adapter = OpenAICompatibleAdapter(api_key="")
    with pytest.raises(ProviderAuthError):
        import asyncio
        asyncio.run(adapter.propose(sample_safe_context, "req_4"))
