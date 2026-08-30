/**
 * Unicode scalar sanitization (transport safety).
 *
 * OWNS: Deterministic replacement of unpaired UTF-16 surrogates with U+FFFD.
 * WHY: JSON can legally carry `\ud83d`. Python/UTF-8 cannot encode that code unit,
 *      which previously crashed Gemini serialization on real pages (YouTube).
 * MUST: Preserve every valid Unicode scalar (ASCII, Latin, emoji, Devanagari, CJK,
 *       combining marks, supplementary-plane characters).
 * MUST NOT: Strip emoji, force ASCII, or drop the surrounding SafeContext.
 */

export const UNICODE_REPLACEMENT = '\uFFFD';

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Replace unpaired UTF-16 surrogates with U+FFFD. Valid scalar sequences are unchanged.
 * Deterministic: the same input always yields the same output.
 */
export function sanitizeUnicodeScalars(input: string): string {
  if (!input) return input;
  let out = '';
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (isHighSurrogate(code)) {
      const next = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (isLowSurrogate(next)) {
        out += input[i];
        out += input[i + 1];
        i += 1;
        continue;
      }
      out += UNICODE_REPLACEMENT;
      continue;
    }
    if (isLowSurrogate(code)) {
      out += UNICODE_REPLACEMENT;
      continue;
    }
    out += input[i];
  }
  return out;
}

/**
 * Recursively sanitize strings in JSON-like values. Keys are sanitized too.
 * Non-string primitives and null are preserved.
 */
export function sanitizeUnicodeDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return sanitizeUnicodeScalars(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnicodeDeep(item)) as T;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(record)) {
      out[sanitizeUnicodeScalars(key)] = sanitizeUnicodeDeep(child);
    }
    return out as T;
  }
  return value;
}
