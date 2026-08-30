import { describe, expect, it } from 'vitest';
import { sanitizeUnicodeDeep, sanitizeUnicodeScalars, UNICODE_REPLACEMENT } from '../unicode.js';

describe('Unicode scalar sanitization', () => {
  it('preserves ASCII', () => {
    expect(sanitizeUnicodeScalars('Hello N-Eye')).toBe('Hello N-Eye');
  });

  it('preserves Latin Unicode', () => {
    expect(sanitizeUnicodeScalars('café naïve')).toBe('café naïve');
  });

  it('preserves valid emoji and supplementary-plane characters', () => {
    expect(sanitizeUnicodeScalars('😀')).toBe('😀');
    expect(sanitizeUnicodeScalars('🧠')).toBe('🧠');
    expect(sanitizeUnicodeScalars('👨‍👩‍👧‍👦')).toBe('👨‍👩‍👧‍👦');
  });

  it('preserves Devanagari, CJK, and combining marks', () => {
    expect(sanitizeUnicodeScalars('हिन्दी')).toBe('हिन्दी');
    expect(sanitizeUnicodeScalars('中文测试')).toBe('中文测试');
    expect(sanitizeUnicodeScalars('e\u0301')).toBe('e\u0301');
  });

  it('preserves mixed multilingual strings and allowed whitespace', () => {
    const mixed = 'Hello हिन्दी 中文 😀\nnext\tline';
    expect(sanitizeUnicodeScalars(mixed)).toBe(mixed);
  });

  it('replaces a lone high surrogate deterministically', () => {
    expect(sanitizeUnicodeScalars('\uD83D')).toBe(UNICODE_REPLACEMENT);
    expect(sanitizeUnicodeScalars('\uD83D')).toBe(sanitizeUnicodeScalars('\uD83D'));
  });

  it('replaces a lone low surrogate deterministically', () => {
    expect(sanitizeUnicodeScalars('\uDE00')).toBe(UNICODE_REPLACEMENT);
  });

  it('replaces a malformed surrogate pair (low then high)', () => {
    expect(sanitizeUnicodeScalars('\uDE00\uD83D')).toBe(`${UNICODE_REPLACEMENT}${UNICODE_REPLACEMENT}`);
  });

  it('does not globally strip valid emoji when a surrogate is nearby', () => {
    expect(sanitizeUnicodeScalars(`ok😀\uD83Dend`)).toBe(`ok😀${UNICODE_REPLACEMENT}end`);
  });

  it('sanitizes nested malformed strings', () => {
    const nested = sanitizeUnicodeDeep({
      title: 'YouTube \uD83D',
      items: [{ label: '\uDE00' }, { label: 'हिन्दी 😀' }],
    });
    expect(nested.title).toBe(`YouTube ${UNICODE_REPLACEMENT}`);
    expect(nested.items[0]?.label).toBe(UNICODE_REPLACEMENT);
    expect(nested.items[1]?.label).toBe('हिन्दी 😀');
  });

  it('JSON serialization succeeds after sanitization', () => {
    const raw = { sanitizedTitle: 'Watch \uD83D' };
    expect(() => JSON.stringify(raw)).not.toThrow();
    const sanitized = sanitizeUnicodeDeep(raw);
    const encoded = JSON.stringify(sanitized);
    expect(encoded).not.toMatch(/\\ud83d/i);
    expect(encoded).toContain(JSON.stringify(UNICODE_REPLACEMENT).slice(1, -1));
    expect(() => JSON.parse(encoded)).not.toThrow();
  });
});
