"""Privacy-preserving operational logger for the N-Eye Planner Gateway.

This module logs strictly non-sensitive metadata (request IDs, latencies,
byte counts, and error categories). It is strictly prohibited from logging
raw prompts, context bodies, or credentials to server stdout or files.
"""

import logging
import sys
from .unicode import sanitize_unicode

logger = logging.getLogger("n_eye_planner")
logger.setLevel(logging.INFO)

# Console handler with standardized metadata format
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter("[%(asctime)s] [N-Eye-Planner] [%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)


def safe_log_request(
    request_id: str,
    provider: str,
    model: str,
    payload_bytes: int,
    duration_ms: float,
    status: str = "SUCCESS",
) -> None:
    """Log safe operational telemetry without dumping payload or prompt text."""
    logger.info(
        "request_id=%s provider=%s model=%s payload_bytes=%d duration_ms=%.1f status=%s",
        request_id,
        provider,
        model,
        payload_bytes,
        duration_ms,
        status,
    )


def safe_log_error(request_id: str, error_category: str, detail: str) -> None:
    """Log safe error classification without leaking confidential request context."""
    # Sanitize detail to strip any potential long multi-line strings or credentials
    sanitized_detail = sanitize_unicode(detail.split("\n")[0][:120]) if detail else "No detail"
    logger.error(
        "request_id=%s error_category=%s detail=\"%s\"",
        request_id,
        error_category,
        sanitized_detail,
    )


def safe_log_info(message: str) -> None:
    """Log generic operational information."""
    logger.info("%s", message)
