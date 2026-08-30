"""Unicode scalar sanitization for planner-gateway transport.

OWNS: Replacing unpaired UTF-16 surrogates with U+FFFD before UTF-8 encode.
WHY: JSON may legally carry lone surrogates from page-derived JS strings. Python's
     UTF-8 encoder rejects them (`surrogates not allowed`), which previously
     crashed Gemini request serialization.
MUST: Preserve valid Unicode (emoji, Devanagari, CJK, combining marks).
MUST NOT: Strip emoji, force ASCII, log the offending string, or broaden egress.
"""

from __future__ import annotations

import json
from typing import Any

UNICODE_REPLACEMENT = "\ufffd"


def sanitize_unicode(text: str) -> str:
    """Replace code points in U+D800..U+DFFF with U+FFFD. Valid scalars unchanged."""
    if not text:
        return text
    return "".join(
        ch if _is_unicode_scalar(ord(ch)) else UNICODE_REPLACEMENT for ch in text
    )


def _is_unicode_scalar(code: int) -> bool:
    return 0 <= code <= 0xD7FF or 0xE000 <= code <= 0x10FFFF


def sanitize_json_value(value: Any) -> Any:
    """Recursively sanitize strings in JSON-like structures."""
    if isinstance(value, str):
        return sanitize_unicode(value)
    if isinstance(value, list):
        return [sanitize_json_value(item) for item in value]
    if isinstance(value, dict):
        return {
            sanitize_unicode(str(key)): sanitize_json_value(child)
            for key, child in value.items()
        }
    return value


def encode_json_utf8(value: Any) -> bytes:
    """Serialize to UTF-8 bytes. Callers must sanitize first; this still uses strict UTF-8."""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
