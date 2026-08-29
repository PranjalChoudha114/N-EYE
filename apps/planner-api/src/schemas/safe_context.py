"""Server-side schema validation for outbound SafeContext payloads.

SafeContext is the sole allowed representation crossing the network boundary.
This module strictly rejects oversized fields, unexpected keys, raw DOM leaks,
or invalid protocol versions before any prompt construction or model call.
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class BoundingBox(BaseModel):
    """Normalized or absolute element viewport coordinates."""
    model_config = ConfigDict(extra="forbid")

    x: float
    y: float
    width: float
    height: float


class SafeElement(BaseModel):
    """Sanitized interactive element visible on the user's active page."""
    model_config = ConfigDict(extra="forbid")

    id: str = Field(..., description="Opaque local element identifier (e.g. e1, e2)")
    role: Optional[str] = Field(default=None, description="ARIA role or computed tag role")
    safeLabel: str = Field(..., description="Sanitized, PII-stripped accessibility label or button text")
    inputType: Optional[str] = Field(default=None, description="Input subtype if applicable (e.g. email, submit)")
    isEnabled: bool = Field(default=True, description="True if element is enabled and interactable")
    isSelected: Optional[bool] = Field(default=None, description="Selection state for switches, checkboxes, or options")
    perceptionSource: Optional[Literal["DOM", "OCR", "FUSED"]] = Field(
        default=None,
        description="Local perception provenance. Never includes pixels.",
    )
    frameId: Optional[str] = Field(
        default=None,
        description="Opaque local frame token (e.g. f1). Never a URL or query string. Omitted for top document.",
        max_length=16,
        pattern=r"^f[0-9]+$",
    )
    bbox: BoundingBox


class TokenCapability(BaseModel):
    """Scoped local token reference providing semantic hints without raw values."""
    model_config = ConfigDict(extra="forbid")

    tokenId: str = Field(..., description="Opaque token identifier")
    tokenSymbol: str = Field(..., description="Opaque symbol representation (e.g. [EMAIL_1])")
    privacyClass: str = Field(..., description="Underlying privacy taxonomy category (e.g. PII_EMAIL)")
    descriptionRole: str = Field(..., description="Semantic purpose of the token (e.g. Primary user email)")


class SafeVisualHint(BaseModel):
    """Non-textual visual anchor or landmark detected on the active viewport."""
    model_config = ConfigDict(extra="forbid")

    hintId: str
    bbox: BoundingBox
    description: str


class Viewport(BaseModel):
    """Viewport dimensions for layout orientation."""
    model_config = ConfigDict(extra="forbid")

    width: float
    height: float


class PageMetadata(BaseModel):
    """Sanitized page metadata stripped of raw private URL query parameters."""
    model_config = ConfigDict(extra="forbid")

    origin: str
    sanitizedTitle: str
    viewport: Viewport


class PriorOutcome(BaseModel):
    """Outcome of the previously executed action for multi-step task continuation."""
    model_config = ConfigDict(extra="forbid")

    actionId: str
    status: Literal["SUCCESS", "FAILURE", "VERIFIED"]
    summary: Optional[str] = None


class SafeContext(BaseModel):
    """The sole allowed schema for outbound network requests to the remote planner.

    Enforces strict allowlists and structural isolation from local-only DOM objects.
    """
    model_config = ConfigDict(extra="forbid")

    protocolVersion: Literal["1.0.0"] = Field(..., description="Must match approved protocol version")
    taskId: str = Field(..., description="Session-bound task identifier")
    pageEpoch: int = Field(..., ge=0, description="Freshness epoch tracking DOM mutations")
    sanitizedGoal: str = Field(..., description="Sanitized user goal with secret credentials removed")
    pageMetadata: PageMetadata
    safeElements: List[SafeElement] = Field(default_factory=list, description="Sanitized page elements")
    availableTokens: List[TokenCapability] = Field(default_factory=list, description="Locally available token capabilities")
    visualHints: Optional[List[SafeVisualHint]] = None
    priorOutcome: Optional[PriorOutcome] = None

    @model_validator(mode="before")
    @classmethod
    def reject_raw_scene_properties(cls, data: dict) -> dict:
        """Reject any attempt to leak raw DOM scenes, unredacted findings, or local flags."""
        if not isinstance(data, dict):
            return data
        forbidden_keys = {
            "_isLocalOnly",
            "elements",
            "privacyFindings",
            "rawHtml",
            "xpath",
            "vault",
            "ocrBlocks",
            "inaccessibleFrames",
            "frameProvenance",
        }
        leaked = forbidden_keys.intersection(data.keys())
        if leaked:
            raise ValueError(f"RawScene leakage detected in SafeContext. Forbidden local keys present: {leaked}")
        return data
