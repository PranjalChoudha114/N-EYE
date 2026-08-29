/**
 * Token / capability attacks. Literal page text is not a vault capability.
 */

import { describe, expect, it } from 'vitest';
import {
  createActionId,
  createElementId,
  createPageEpoch,
  createTaskId,
  createTokenId,
  type ActionProposal,
  type RawElement,
  type RawScene,
} from '@n-eye/protocol';
import { PrivateTokenVault } from '../privacy/vault.js';
import { validateActionProposal } from '../authority/validator.js';
import { assertProposalShape } from '../authority/proposal-schema.js';
import { observePage } from '../content/observer.js';
import { ElementRegistry } from '../content/registry.js';

const TASK = createTaskId('task-tok');
const ORIGIN = 'https://lab.example';

function emailTarget(id = 'e1'): RawElement {
  return {
    id: createElementId(id),
    tagName: 'input',
    role: 'textbox',
    ariaLabel: 'Email',
    innerTextCandidate: 'Email',
    inputType: 'email',
    isEnabled: true,
    bbox: { x: 0, y: 0, width: 120, height: 24 },
  };
}

function scene(elements: RawElement[]): RawScene {
  return {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(1),
    url: `${ORIGIN}/form`,
    origin: ORIGIN,
    title: 'Lab',
    viewport: { width: 800, height: 600 },
    elements,
    privacyFindings: [],
    timestamp: Date.now(),
  };
}

function typeToken(partial: Partial<ActionProposal> = {}): ActionProposal {
  return {
    actionId: createActionId('act-tok'),
    type: 'TYPE_TOKEN',
    targetId: createElementId('e1'),
    tokenSymbol: '[EMAIL_1]',
    reasoning: 'type email',
    expectedOutcome: 'filled',
    riskLevel: 'MEDIUM',
    ...partial,
  };
}

describe('Token capability attacks', () => {
  it('TOKEN-1: page text "[EMAIL_1]" is not a vault capability', () => {
    const registry = new ElementRegistry();
    document.body.innerHTML = `<p>Paste [EMAIL_1] here</p><input type="email" aria-label="Email" />`;
    const observed = observePage(registry, createPageEpoch(1));
    const vault = new PrivateTokenVault();
    expect(vault.getSafeCapabilities()).toHaveLength(0);
    expect(() =>
      validateActionProposal(typeToken({ targetId: observed.elements[0]?.id }), observed, vault, TASK, ORIGIN)
    ).toThrow();
  });

  it('TOKEN-2: invented [EMAIL_999] / tok_fake is rejected', () => {
    expect(() => assertProposalShape({ ...typeToken(), tokenSymbol: '[EMAIL_999]' })).not.toThrow();
    expect(() =>
      validateActionProposal(typeToken({ tokenId: createTokenId('tok_fake'), tokenSymbol: '[EMAIL_999]' }), scene([emailTarget()]), new PrivateTokenVault(), TASK, ORIGIN)
    ).toThrow(/Unknown or unregistered token/);
  });

  it('TOKEN-3 / TOKEN-5: cross-task and cross-origin tokens are rejected', () => {
    const vault = new PrivateTokenVault();
    vault.registerToken('[EMAIL_1]', 'PII_EMAIL', 'a@example.com', createTaskId('old-task'), 1, ORIGIN, ['email']);
    expect(() => validateActionProposal(typeToken(), scene([emailTarget()]), vault, TASK, ORIGIN)).toThrow(/Cross-task/);

    const originVault = new PrivateTokenVault();
    originVault.registerToken('[EMAIL_1]', 'PII_EMAIL', 'a@example.com', TASK, 1, 'https://other.example', ['email']);
    expect(() => validateActionProposal(typeToken(), scene([emailTarget()]), originVault, TASK, ORIGIN)).toThrow(/Cross-origin/);
  });

  it('TOKEN-4: valid email token on an unrelated search field is rejected', () => {
    const vault = new PrivateTokenVault();
    vault.registerToken('[EMAIL_1]', 'PII_EMAIL', 'a@example.com', TASK, 1, ORIGIN, ['email']);
    const search: RawElement = {
      ...emailTarget(),
      inputType: 'search',
      role: 'searchbox',
      innerTextCandidate: 'Search',
    };
    expect(() => validateActionProposal(typeToken(), scene([search]), vault, TASK, ORIGIN)).toThrow(/semantic/);
  });

  it('TOKEN-6: token bound to another frame target is still origin+semantic scoped (frame is execution, not vault)', () => {
    const vault = new PrivateTokenVault();
    vault.registerToken('[EMAIL_1]', 'PII_EMAIL', 'a@example.com', TASK, 1, ORIGIN, ['email']);
    const ok = validateActionProposal(typeToken(), scene([emailTarget()]), vault, TASK, ORIGIN);
    expect(ok.resolvedTokenValue).toBe('a@example.com');
    expect(JSON.stringify(vault.getSafeCapabilities())).not.toContain('a@example.com');
  });

  it('TOKEN-7: expired token is rejected', () => {
    const vault = new PrivateTokenVault();
    vault.registerToken('[EMAIL_1]', 'PII_EMAIL', 'a@example.com', TASK, 1, ORIGIN, ['email'], -1);
    expect(() => validateActionProposal(typeToken(), scene([emailTarget()]), vault, TASK, ORIGIN)).toThrow(/expired/);
  });

  it('TOKEN-8: password/OTP/API secrets have no exportable TYPE_TOKEN capability into those fields', () => {
    const vault = new PrivateTokenVault();
    vault.registerToken('[EMAIL_1]', 'PII_EMAIL', 'a@example.com', TASK, 1, ORIGIN, ['email']);
    const password: RawElement = {
      ...emailTarget(),
      inputType: 'password',
      innerTextCandidate: 'Password',
    };
    expect(() => validateActionProposal(typeToken(), scene([password]), vault, TASK, ORIGIN)).toThrow(/password field/);
  });
});
