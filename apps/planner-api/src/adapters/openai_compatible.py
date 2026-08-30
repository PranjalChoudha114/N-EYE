"""OpenAI-compatible AI provider adapter with structured JSON object mode.

This adapter allows plugging in OpenAI, Azure OpenAI, Groq, Ollama, or any
v1/chat/completions compatible gateway while preserving strict SafeContext contracts.
"""

import json
from typing import Optional, Tuple
import httpx
from .base import (
    BaseProviderAdapter,
    ProviderAuthError,
    ProviderConfigError,
    ProviderError,
    ProviderRateLimitError,
    ProviderSchemaError,
    ProviderTimeoutError,
)
from ..schemas.safe_context import SafeContext
from ..schemas.action_proposal import ActionProposal
from ..prompts.system_prompt import build_planner_prompt
from ..security.unicode import encode_json_utf8, sanitize_json_value


class OpenAICompatibleAdapter(BaseProviderAdapter):
    """Reasoning adapter for OpenAI and OpenAI-compatible API providers."""

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.openai.com/v1",
        model_name: str = "gpt-4o-mini",
        timeout_seconds: float = 15.0,
    ):
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model_name = model_name
        self._timeout_seconds = timeout_seconds

    def get_provider_name(self) -> str:
        return "openai"

    def get_model_name(self) -> str:
        return self._model_name

    async def propose(
        self, context: SafeContext, request_id: str
    ) -> Tuple[ActionProposal, Optional[int], Optional[int]]:
        """Invoke chat completions endpoint and return a validated ActionProposal."""
        if not self._api_key and "localhost" not in self._base_url:
            raise ProviderAuthError("OPENAI_API_KEY is not configured on the planner gateway.")

        prompt = build_planner_prompt(SafeContext.model_validate(sanitize_json_value(context.model_dump())))

        payload = {
            "model": self._model_name,
            "messages": [
                {
                    "role": "system",
                    "content": "You are N-Eye remote reasoning planner. Output MUST be valid JSON conforming to ActionProposal schema.",
                },
                {
                    "role": "user",
                    "content": prompt,
                },
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.1,
        }

        url = f"{self._base_url}/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self._api_key}",
        }

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(self._timeout_seconds)) as client:
                response = await client.post(url, content=encode_json_utf8(payload), headers=headers)

            if response.status_code in (401, 403):
                raise ProviderAuthError(f"OpenAI API key rejected (status {response.status_code}).")

            if response.status_code == 404:
                raise ProviderConfigError("OpenAI-compatible endpoint or model was not found.")

            if response.status_code == 429:
                raise ProviderRateLimitError("OpenAI API rate limit exceeded.")

            if response.status_code >= 500:
                raise ProviderError(
                    f"OpenAI upstream server error ({response.status_code}).",
                    is_retryable=True,
                )

            if response.status_code != 200:
                raise ProviderError(
                    f"OpenAI returned HTTP {response.status_code}.",
                    is_retryable=False,
                )

            response_data = response.json()
            choices = response_data.get("choices", [])
            if not choices:
                raise ProviderSchemaError("OpenAI returned empty choices list.")

            content = choices[0].get("message", {}).get("content", "").strip()

            usage = response_data.get("usage", {})
            input_tokens = usage.get("prompt_tokens")
            output_tokens = usage.get("completion_tokens")

            try:
                parsed_json = json.loads(content)
                proposal = ActionProposal.model_validate(parsed_json)
                return proposal, input_tokens, output_tokens
            except Exception as parse_err:
                raise ProviderSchemaError(
                    "Failed to parse OpenAI output into ActionProposal."
                ) from parse_err

        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError("OpenAI request timed out.") from exc
        except (ProviderError, ProviderAuthError, ProviderConfigError, ProviderRateLimitError, ProviderSchemaError):
            raise
        except Exception:
            raise ProviderError(
                "Unexpected error communicating with OpenAI.",
                is_retryable=True,
            ) from None
