"""Tests for mock, Gemini, and OpenAI-compatible provider adapters."""

import pytest
from src.adapters.mock import MockProviderAdapter
from src.adapters.gemini import GeminiProviderAdapter
from src.adapters.openai_compatible import OpenAICompatibleAdapter
from src.adapters.base import ProviderAuthError, ProviderError, ProviderSchemaError, ProviderTimeoutError
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


@pytest.mark.asyncio
async def test_gemini_does_not_place_api_key_in_url(monkeypatch, sample_safe_context: SafeContext):
    """Provider credentials must not appear in the request URL (error traces would leak them)."""
    captured: dict = {}

    class _FakeResponse:
        status_code = 503
        headers = {}

        def json(self):
            return {}

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        async def post(self, url, content=None, headers=None):
            captured["url"] = url
            captured["headers"] = headers or {}
            return _FakeResponse()

    monkeypatch.setattr("src.adapters.gemini.httpx.AsyncClient", _FakeClient)
    adapter = GeminiProviderAdapter(api_key="SECRET_KEY_MUST_NOT_APPEAR_IN_URL")
    with pytest.raises(ProviderError):
        await adapter.propose(sample_safe_context, "req_key")
    assert "SECRET_KEY_MUST_NOT_APPEAR_IN_URL" not in captured["url"]
    assert captured["headers"].get("x-goog-api-key") == "SECRET_KEY_MUST_NOT_APPEAR_IN_URL"


@pytest.mark.asyncio
async def test_mock_adapter_types_into_unique_search_field(sample_safe_context: SafeContext):
    context = sample_safe_context.model_copy(
        update={
            "sanitizedGoal": "Type OpenAI in the search box",
            "availableTokens": [],
            "safeElements": [
                sample_safe_context.safeElements[0].model_copy(
                    update={
                        "id": "e_search",
                        "role": "searchbox",
                        "safeLabel": "Search",
                        "inputType": "search",
                    }
                )
            ],
        }
    )
    adapter = MockProviderAdapter()
    proposal, _, _ = await adapter.propose(context, "req_type")
    assert proposal.type == "TYPE_TEXT"
    assert proposal.textValue == "OpenAI"
    assert proposal.targetId == "e_search"


@pytest.mark.asyncio
async def test_mock_adapter_asks_user_instead_of_false_complete(sample_safe_context: SafeContext):
    context = sample_safe_context.model_copy(
        update={
            "sanitizedGoal": "Type OpenAI in the YouTube search box",
            "availableTokens": [],
            "safeElements": [sample_safe_context.safeElements[1]],
        }
    )
    adapter = MockProviderAdapter()
    proposal, _, _ = await adapter.propose(context, "req_ask")
    assert proposal.type == "ASK_USER"
    assert "completed" not in proposal.reasoning.lower()
