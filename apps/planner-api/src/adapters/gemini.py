"""Google Gemini AI provider adapter with structured JSON schema output.

This module invokes Gemini's generateContent REST endpoint using strict
responseSchema definitions. The provider returns validated JSON matching
N-Eye's ActionProposal contract, leaving zero browser authority with the remote model.
"""

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
from ..prompts.system_prompt import build_planner_prompt, get_action_proposal_json_schema
from ..security.unicode import encode_json_utf8, sanitize_json_value
from .proposal_parse import coerce_action_proposal, extract_json_object, first_text_part


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

        prompt = build_planner_prompt(SafeContext.model_validate(sanitize_json_value(context.model_dump())))
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

        url = f"{self._base_url}/models/{self._model_name}:generateContent"

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(self._timeout_seconds)) as client:
                response = await client.post(
                    url,
                    content=encode_json_utf8(payload),
                    headers={
                        "Content-Type": "application/json; charset=utf-8",
                        "x-goog-api-key": self._api_key,
                    },
                )

            if response.status_code in (401, 403):
                raise ProviderAuthError(f"Gemini API key rejected (status {response.status_code}).")

            if response.status_code == 404:
                raise ProviderConfigError("Gemini model or endpoint was not found.")

            if response.status_code == 429:
                retry_after_raw = response.headers.get("Retry-After")
                retry_after = None
                if retry_after_raw:
                    try:
                        retry_after = float(retry_after_raw)
                    except ValueError:
                        retry_after = None
                raise ProviderRateLimitError(
                    "Gemini API rate limit or quota exceeded.",
                    retry_after_seconds=retry_after,
                )

            if response.status_code >= 500:
                raise ProviderError(
                    f"Gemini upstream server error ({response.status_code}).",
                    is_retryable=True,
                )

            if response.status_code != 200:
                raise ProviderError(
                    f"Gemini returned HTTP {response.status_code}.",
                    is_retryable=False,
                )

            response_data = response.json()

            # Extract generated content part. Gemini thinking/tool parts may precede JSON text.
            candidates = response_data.get("candidates", [])
            if not candidates:
                raise ProviderSchemaError("Gemini returned empty candidate list.")

            content_parts = candidates[0].get("content", {}).get("parts", [])
            raw_text = first_text_part(content_parts)

            # Extract token usage metadata if provided
            usage = response_data.get("usageMetadata", {})
            input_tokens = usage.get("promptTokenCount")
            output_tokens = usage.get("candidatesTokenCount")

            try:
                proposal = coerce_action_proposal(extract_json_object(raw_text))
                return proposal, input_tokens, output_tokens
            except ProviderSchemaError:
                raise
            except Exception as parse_err:
                raise ProviderSchemaError(
                    "Failed to parse Gemini output into ActionProposal."
                ) from parse_err

        except UnicodeEncodeError as exc:
            raise ProviderError(
                "Gemini request could not be UTF-8 encoded after Unicode sanitization.",
                is_retryable=False,
            ) from exc
        except httpx.TimeoutException as exc:
            raise ProviderTimeoutError("Gemini request timed out.") from exc
        except (ProviderError, ProviderAuthError, ProviderConfigError, ProviderRateLimitError, ProviderSchemaError):
            raise
        except Exception:
            raise ProviderError(
                "Unexpected error communicating with Gemini.",
                is_retryable=True,
            ) from None
