"""Server-side schema validation for model-generated ActionProposals.

ActionProposal is untrusted data returned by the remote reasoning provider.
This module verifies that the proposal strictly conforms to N-Eye's constrained
action vocabulary and contains zero arbitrary scripts or non-whitelisted actions.
"""

from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field

ActionType = Literal[
    "CLICK",
    "TYPE_TOKEN",
    "TYPE_TEXT",
    "SCROLL",
    "SELECT",
    "WAIT",
    "ASK_USER",
    "COMPLETE",
]

RiskLevel = Literal["LOW", "MEDIUM", "HIGH", "BLOCKED"]


class ScrollDelta(BaseModel):
    """Relative scroll offset for SCROLL action."""
    model_config = ConfigDict(extra="forbid")

    x: float = 0.0
    y: float = 0.0


class ActionProposal(BaseModel):
    """Untrusted action proposal returned by the remote planner model.

    The model proposes intent, but local N-Eye retains all execution authority.
    """
    model_config = ConfigDict(extra="forbid")

    actionId: str = Field(..., description="Unique action identifier")
    type: ActionType = Field(..., description="Constrained action type")
    targetId: Optional[str] = Field(default=None, description="Opaque local target identifier (e.g. e1, e2)")
    tokenId: Optional[str] = Field(default=None, description="Opaque token identifier if action is TYPE_TOKEN")
    tokenSymbol: Optional[str] = Field(default=None, description="Token symbol representation (e.g. [EMAIL_1])")
    textValue: Optional[str] = Field(default=None, description="Non-sensitive public text value if action is TYPE_TEXT")
    scrollDelta: Optional[ScrollDelta] = Field(default=None, description="Scroll delta vector if action is SCROLL")
    reasoning: str = Field(..., description="Explainable rationale behind the proposed step")
    expectedOutcome: str = Field(..., description="Expected DOM state transition or task progression")
    riskLevel: RiskLevel = Field(default="LOW", description="Estimated risk tier for local safety review")
