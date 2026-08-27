import { describe, it, expect } from 'vitest';
import {
  createTargetFingerprint,
  computeFingerprintDigest,
} from '../fingerprint.js';

describe('TargetFingerprint & Digest Invariants', () => {
  it('computes deterministic digest for identical UI characteristics', () => {
    const relBbox = { xPercent: 10, yPercent: 20, widthPercent: 15, heightPercent: 5 };
    const fp1 = createTargetFingerprint('button', 'button', 'submit', 'Continue Application', relBbox);
    const fp2 = createTargetFingerprint('button', 'button', 'submit', 'Continue Application', relBbox);

    expect(fp1.digest).toBe(fp2.digest);
    expect(fp1.digest).toMatch(/^fp_[0-9a-f]+$/);
    expect(fp1.normalizedLabelCandidate).toBe('Continue Application');
  });

  it('produces different digest when semantic label or role changes', () => {
    const relBbox = { xPercent: 10, yPercent: 20, widthPercent: 15, heightPercent: 5 };
    const fpSubmit = createTargetFingerprint('button', 'button', 'submit', 'Submit', relBbox);
    const fpCancel = createTargetFingerprint('button', 'button', 'button', 'Cancel', relBbox);

    expect(fpSubmit.digest).not.toBe(fpCancel.digest);
  });

  it('normalizes label casing and whitespace in digest computation', () => {
    const relBbox = { xPercent: 10, yPercent: 20, widthPercent: 15, heightPercent: 5 };
    const d1 = computeFingerprintDigest('button', 'button', null, '  SUBMIT NOW  ', relBbox);
    const d2 = computeFingerprintDigest('button', 'button', null, 'submit now', relBbox);

    expect(d1).toBe(d2);
  });

  it('bounds long label length in digest without throwing', () => {
    const relBbox = { xPercent: 10, yPercent: 20, widthPercent: 15, heightPercent: 5 };
    const hugeLabel = 'A'.repeat(5000);
    const fp = createTargetFingerprint('button', 'button', null, hugeLabel, relBbox);

    expect(fp.digest).toBeDefined();
    expect(typeof fp.digest).toBe('string');
  });
});
