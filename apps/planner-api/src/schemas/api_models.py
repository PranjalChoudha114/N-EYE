"""API request and response envelopes for the N-Eye Planner Gateway."""

from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field
from .safe_context import SafeContext
from .action_proposal import ActionProposal


class PlanRequest(BaseModel):
    """Enveloped planner request containing validated SafeContext."""
    model_config = ConfigDict(extra="forbid")

    requestId: Optional[str] = Field(default=None, description="Optional client-generated request correlation ID")
    safeContext: SafeContext = Field(..., description="Egress-approved SafeContext")
    clientCapabilities: Optional[Dict[str, Any]] = Field(default=None, description="Client capabilities metadata")


class PlanResponseMetadata(BaseModel):
    """Safe operational performance metadata returned with planner proposals."""
    model_config = ConfigDict(extra="forbid")

    requestId: str
    provider: str
    model: str
    planningLatencyMs: float
    inputTokenCount: Optional[int] = None
    outputTokenCount: Optional[int] = None


class PlanResponse(BaseModel):
    """Enveloped planner response containing structured proposal and timing metadata."""
    model_config = ConfigDict(extra="forbid")

    actionProposal: ActionProposal
    metadata: PlanResponseMetadata


class HealthResponse(BaseModel):
    """Gateway health check and provider readiness status."""
    model_config = ConfigDict(extra="forbid")

    status: str
    provider: str
    model: str
    version: str
