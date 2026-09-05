import { describe, expect, it } from 'vitest';
import { createElementId, createPageEpoch, createTaskId, type RawElement, type RawScene } from '@n-eye/protocol';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';

function el(partial: Partial<RawElement> & Pick<RawElement, 'id'>): RawElement {
  return {
    tagName: 'a',
    role: 'a',
    ariaLabel: null,
    innerTextCandidate: 'Other',
    inputType: null,
    isEnabled: true,
    bbox: { x: 0, y: 0, width: 40, height: 16 },
    ...partial,
  };
}

describe('Task-conditioned SafeContext ranking', () => {
  it('keeps the named resource ahead of unrelated password/email controls', () => {
    resetTokenCounters();
    const neye = createElementId('e70');
    const password = createElementId('e2');
    const elements: RawElement[] = [
      el({
        id: createElementId('e1'),
        tagName: 'input',
        role: 'textbox',
        innerTextCandidate: 'Email',
        inputType: 'email',
      }),
      el({
        id: password,
        tagName: 'input',
        role: 'textbox',
        innerTextCandidate: 'Password',
        inputType: 'password',
      }),
    ];
    for (let i = 3; i <= 69; i += 1) {
      elements.push(
        el({
          id: createElementId(`e${i}`),
          innerTextCandidate: `Nav ${i}`,
        })
      );
    }
    elements.push(
      el({
        id: neye,
        innerTextCandidate: 'N-EYE',
        ariaLabel: 'N-EYE',
        bbox: { x: 20, y: 80, width: 120, height: 20 },
      })
    );
    const scene: RawScene = {
      _isLocalOnly: true,
      pageEpoch: createPageEpoch(1),
      url: 'https://lab.example/nav',
      origin: 'https://lab.example',
      title: 'Lab',
      viewport: { width: 800, height: 600 },
      timestamp: Date.now(),
      elements,
      privacyFindings: [],
    };
    const safe = buildSafeContext(
      scene,
      'Open the N-EYE repository',
      evaluatePrivacyPolicy([]),
      new PrivateTokenVault(),
      createTaskId('task-rank')
    );
    expect(safe.safeElements.length).toBeLessThanOrEqual(64);
    expect(safe.safeElements[0]?.id).toBe(neye);
    expect(safe.safeElements.some((item) => item.id === neye)).toBe(true);
    const passwordIndex = safe.safeElements.findIndex((item) => item.id === password);
    const neyeIndex = safe.safeElements.findIndex((item) => item.id === neye);
    if (passwordIndex >= 0) {
      expect(neyeIndex).toBeLessThan(passwordIndex);
    }
  });
});
