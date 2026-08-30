"""FastAPI entrypoint for the N-Eye Planner Gateway.

This server acts as the network boundary between local browser observations and
remote AI reasoning providers. It validates SafeContext schemas, isolates API
secrets, constructs structured prompts, and returns strictly constrained ActionProposals.
"""

import time
import uuid
from typing import Optional
from fastapi import FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_config, PlannerConfig
from .schemas.api_models import HealthResponse, PlanRequest, PlanResponse, PlanResponseMetadata
from .schemas.safe_context import SafeContext
from .adapters.base import (
    BaseProviderAdapter,
    ProviderAuthError,
    ProviderConfigError,
    ProviderError,
    ProviderRateLimitError,
    ProviderSchemaError,
    ProviderTimeoutError,
)
from .adapters.mock import MockProviderAdapter
from .adapters.gemini import GeminiProviderAdapter
from .adapters.openai_compatible import OpenAICompatibleAdapter
from .security.logging import safe_log_error, safe_log_info, safe_log_request
from .security.unicode import sanitize_json_value

app = FastAPI(
    title="N-Eye Planner Gateway",
    version="1.0.0",
    description="Privacy-Preserving Remote AI Planner Gateway for Browser Agents",
)

config: PlannerConfig = get_config()

# Configure constrained CORS for extension runtime and local test portals
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Permits chrome-extension:// origins and localhost during local dev
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def get_adapter(cfg: PlannerConfig) -> BaseProviderAdapter:
    """Instantiate the configured provider adapter."""
    provider = cfg.provider.lower()
    if provider == "gemini":
        return GeminiProviderAdapter(
            api_key=cfg.gemini_api_key,
            model_name=cfg.model,
            timeout_seconds=cfg.request_timeout_seconds,
        )
    elif provider == "openai":
        return OpenAICompatibleAdapter(
            api_key=cfg.openai_api_key,
            base_url=cfg.openai_base_url,
            model_name=cfg.model,
            timeout_seconds=cfg.request_timeout_seconds,
        )
    else:
        return MockProviderAdapter(model_name=cfg.model or "mock-deterministic-v1")


adapter = get_adapter(config)


@app.get("/v1/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Return health status and active provider configuration."""
    return HealthResponse(
        status="healthy",
        provider=adapter.get_provider_name(),
        model=adapter.get_model_name(),
        version="1.0.0",
    )


@app.post("/v1/plan", response_model=PlanResponse)
async def propose_plan(plan_req: PlanRequest, raw_request: Request) -> PlanResponse:
    """Receive egress-approved SafeContext and return a structured ActionProposal."""
    request_id = plan_req.requestId or f"req_{uuid.uuid4().hex[:12]}"
    start_time = time.perf_counter()

    # 1. Enforce payload size safety limit
    raw_body = await raw_request.body()
    payload_bytes = len(raw_body)
    if payload_bytes > config.max_payload_bytes:
        safe_log_error(request_id, "PAYLOAD_TOO_LARGE", f"Payload size {payload_bytes} exceeds limit")
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"SafeContext payload size ({payload_bytes} bytes) exceeds limit of {config.max_payload_bytes} bytes",
        )

    # 2. Unicode-sanitize SafeContext before prompt/provider JSON (U+FFFD for unpaired surrogates).
    try:
        sanitized = sanitize_json_value(plan_req.safeContext.model_dump())
        safe_context = SafeContext.model_validate(sanitized)
    except Exception as exc:
        safe_log_error(request_id, "UNICODE_SANITIZE_FAILED", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SafeContext contained malformed Unicode that could not be normalized.",
        ) from exc

    # 3. Delegate reasoning to active provider adapter
    try:
        proposal, in_tokens, out_tokens = await adapter.propose(safe_context, request_id)
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        safe_log_request(
            request_id=request_id,
            provider=adapter.get_provider_name(),
            model=adapter.get_model_name(),
            payload_bytes=payload_bytes,
            duration_ms=duration_ms,
            status="SUCCESS",
        )

        return PlanResponse(
            actionProposal=proposal,
            metadata=PlanResponseMetadata(
                requestId=request_id,
                provider=adapter.get_provider_name(),
                model=adapter.get_model_name(),
                planningLatencyMs=round(duration_ms, 2),
                inputTokenCount=in_tokens,
                outputTokenCount=out_tokens,
            ),
        )

    except ProviderTimeoutError as exc:
        duration_ms = (time.perf_counter() - start_time) * 1000.0
        safe_log_error(request_id, "PLANNER_TIMEOUT", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Remote AI provider reasoning request timed out.",
        ) from exc

    except ProviderAuthError as exc:
        safe_log_error(request_id, "PLANNER_AUTH_FAILED", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Provider authentication failed on server.",
        ) from exc

    except ProviderRateLimitError as exc:
        safe_log_error(request_id, "PLANNER_RATE_LIMITED", type(exc).__name__)
        headers = {}
        retry_after = getattr(exc, "retry_after_seconds", None)
        if isinstance(retry_after, (int, float)) and retry_after >= 0:
            headers["Retry-After"] = str(int(retry_after))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Provider rate limit exceeded. Please retry shortly.",
            headers=headers or None,
        ) from exc

    except ProviderConfigError as exc:
        safe_log_error(request_id, "PLANNER_MISCONFIGURED", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Provider endpoint or model is misconfigured.",
        ) from exc

    except ProviderSchemaError as exc:
        safe_log_error(request_id, "PLANNER_SCHEMA_REJECTED", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Provider generated an invalid ActionProposal schema.",
        ) from exc

    except ProviderError as exc:
        safe_log_error(request_id, "PLANNER_PROVIDER_ERROR", type(exc).__name__)
        status_code = (
            status.HTTP_503_SERVICE_UNAVAILABLE if exc.is_retryable else status.HTTP_502_BAD_GATEWAY
        )
        raise HTTPException(
            status_code=status_code,
            detail="Upstream AI provider error.",
        ) from exc

    except UnicodeEncodeError as exc:
        safe_log_error(request_id, "PLANNER_UNICODE_ENCODE", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Provider serialization rejected malformed Unicode. No raw fallback was used.",
        ) from exc

    except Exception as exc:
        safe_log_error(request_id, "PLANNER_INTERNAL_ERROR", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal planner gateway error.",
        ) from exc


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host=config.host, port=config.port, reload=True)
