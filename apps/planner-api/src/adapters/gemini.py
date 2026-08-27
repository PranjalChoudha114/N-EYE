"""Google Gemini AI provider adapter with structured JSON schema output.

This module invokes Gemini's generateContent REST endpoint using strict
responseSchema definitions. The provider returns validated JSON matching
N-Eye's ActionProposal contract, leaving zero browser authority with the remote model.
"""

import json
from typing import Optional, Tuple
import httpx
from .base import (
    BaseProviderAdapter,
    ProviderAuthError,
    ProviderError,
    ProviderRateLimitError,
    ProviderSchemaError,
    ProviderTimeoutError,
)
from ..schemas.safe_context import SafeContext
from ..schemas.action_proposal import ActionProposal
from ..prompts.system_prompt import build_planner_prompt, get_action_proposal_json_schema


class GeminiProviderAdapter(BaseProviderAdapter):
    """Real AI reasoning adapter for Google Gemini models."""

    def __init__(
        self,
        api_key: str,
        model_name: str = "gemini-2.5-flash",
        timeout_seconds: float = 15.0,
        base_url: str = "https://generativelanguage.googleapis.com/v1beta",
    ):
        self._api_key = api_key
        self._model_name = model_name
        self._timeout_seconds = timeout_seconds
        self._base_url = base_url.rstrip("/")

    def get_provider_name(self) -> str:
        return "gemini"

    def get_model_name(self) -> str:
        return self._model_name

    async def propose(
        self, context: SafeContext, request_id: str
    ) -> Tuple[ActionProposal, Optional[int], Optional[int]]:
        """Invoke Gemini with structured responseSchema and return a validated ActionProposal."""
        if not self._api_key:
            raise ProviderAuthError("GEMINI_API_KEY is not configured on the planner gateway.")

        prompt = build_planner_prompt(context)
        schema = get_action_proposal_json_schema()

        payload = {
            "contents": [
                {
                    "parts": [
                        {"text": prompt}
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0.1,
                "responseMimeType": "application/json",
                "responseSchema": schema,
            },
        }

        url = f"{self._base_url}/models/{self._model_name}:generateContent?key={self._api_key}"

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(self._timeout_seconds)) as client:
                response = await client.post(
                    url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                )

            if response.status_code in (401, 403):
                raise ProviderAuthError(f"Gemini API key rejected (status {response.status_code}).")

            if response.status_code == 429:
                raise ProviderRateLimitError("Gemini API rate limit or quota exceeded.")

            if response.status_code >= 500:
                raise ProviderError(
                    f"Gemini upstream server error ({response.status_code}).",
                    is_retryable=True,
                )

            if response.status_code != 200:
                raise ProviderError(f"Gemini returned HTTP {response.status_code}: {response.text[:200]}")

            response_data = response.json()

            # Extract generated content part
            candidates = response_data.get("candidates", [])
            if not candidates:
                raise ProviderSchemaError("Gemini returned empty candidate list.")

            content_parts = candidates[0].get("content", {}).get("parts", [])
            if not content_parts or "text" not in content_parts[0]:
                raise ProviderSchemaError("Gemini returned candidate without valid text content.")

            raw_text = content_parts[0]["text"].strip()

            # Extract token usage metadata if provided
            usage = response_data.get("usageMetadata", {})
            input_tokens = usage.get("promptTokenCount")
            output_tokens = usage.get("candidatesTokenCount")

            # Parse and validate against Pydantic ActionProposal
            try:
                parsed_json = json.loads(raw_text)
                proposal = ActionProposal.model_validate(parsed_json)
                return proposal, input_tokens, output_tokens
            except Exception as parse_err:
                raise ProviderSchemaError(
                    f"Failed to parse Gemini output into ActionProposal: {parse_err}"
                ) from parse_err

        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError("Gemini request timed out.") from exc
        except (ProviderError, ProviderAuthError, ProviderRateLimitError, ProviderSchemaError):
            raise
        except Exception as exc:
            raise ProviderError(f"Unexpected error communicating with Gemini: {exc}") from exc
