"""Unicode sanitization at the planner-gateway serialization boundary."""

import pytest
from src.security.unicode import UNICODE_REPLACEMENT, encode_json_utf8, sanitize_json_value, sanitize_unicode
from src.prompts.system_prompt import build_planner_prompt
from src.schemas.safe_context import SafeContext

# Runtime-constructed unpaired surrogates. Do not write these as \\u escapes in
# this file: pytest's assertion rewriter UTF-8-encodes the AST and would crash.
LONE_HIGH = chr(0xD83D)
LONE_LOW = chr(0xDE00)


def test_lone_surrogate_cannot_utf8_encode_without_sanitize():
    """Reproduce the YouTube lone-high-surrogate crash against strict UTF-8."""
    with pytest.raises(UnicodeEncodeError):
        LONE_HIGH.encode("utf-8")


def test_sanitize_preserves_valid_unicode():
    assert sanitize_unicode("Hello") == "Hello"
    assert sanitize_unicode("café") == "café"
    assert sanitize_unicode("😀") == "😀"
    assert sanitize_unicode("हिन्दी") == "हिन्दी"
    assert sanitize_unicode("中文") == "中文"
    assert sanitize_unicode("e\u0301") == "e\u0301"


def test_sanitize_replaces_unpaired_surrogates():
    assert sanitize_unicode(LONE_HIGH) == UNICODE_REPLACEMENT
    assert sanitize_unicode(LONE_LOW) == UNICODE_REPLACEMENT
    assert sanitize_unicode(f"ok{LONE_HIGH}end") == f"ok{UNICODE_REPLACEMENT}end"


def test_sanitized_surrogate_payload_utf8_encodes(sample_safe_context: SafeContext):
    dumped = sample_safe_context.model_dump()
    dumped["pageMetadata"]["sanitizedTitle"] = f"YouTube {LONE_HIGH}"
    dumped["safeElements"][0]["safeLabel"] = f"Play {LONE_HIGH}"
    sanitized = sanitize_json_value(dumped)
    ctx = SafeContext.model_validate(sanitized)
    prompt = build_planner_prompt(ctx)
    raw = encode_json_utf8({"contents": [{"parts": [{"text": prompt}]}]})
    decoded = raw.decode("utf-8")
    assert LONE_HIGH not in decoded
    assert UNICODE_REPLACEMENT in ctx.pageMetadata.sanitizedTitle


def test_valid_emoji_survives_provider_json(sample_safe_context: SafeContext):
    dumped = sample_safe_context.model_dump()
    dumped["pageMetadata"]["sanitizedTitle"] = "Watch 😀 हिन्दी 中文"
    sanitized = sanitize_json_value(dumped)
    ctx = SafeContext.model_validate(sanitized)
    raw = encode_json_utf8({"title": ctx.pageMetadata.sanitizedTitle})
    assert "😀".encode("utf-8") in raw
    assert "हिन्दी".encode("utf-8") in raw
    assert "中文".encode("utf-8") in raw


def test_canaries_not_introduced_by_unicode_repair(sample_safe_context: SafeContext):
    dumped = sample_safe_context.model_dump()
    dumped["pageMetadata"]["sanitizedTitle"] = "Public 😀"
    raw = encode_json_utf8(sanitize_json_value(dumped))
    text = raw.decode("utf-8")
    assert "CANARY_PASSWORD_T017" not in text
    assert "CANARY_OTP_T017" not in text
    assert "CANARY_API_T017" not in text
