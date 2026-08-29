/**
 * ActionProposal adversarial matrix.
 * Drives the local validator with hostile planner output. N-Eye must remain safe when the
 * planner is not obedient — this is not an LLM-obedience test.
 */

import { describe, it, expect } from 'vitest';
import {
  createActionId,
  createElementId,
  createFrameId,
  createPageEpoch,
  createTaskId,
  createTokenId,
  type ActionProposal,
  type RawElement,
  type RawScene,
} from '@n-eye/protocol';
import { PrivateTokenVault } from '../privacy/vault.js';
import { validateActionProposal, ActionValidationError } from '../authority/validator.js';
import { assertProposalShape, MalformedProposalError } from '../authority/proposal-schema.js';
import { executeValidatedAction } from '../execution/executor.js';
import { ElementRegistry } from '../content/registry.js';

const TASK = createTaskId('task-adv');
const ORIGIN = 'https://lab.example';

function element(partial: Partial<RawElement> & Pick<RawElement, 'id'>): RawElement {
  return {
    tagName: 'button',
    role: 'button',
    ariaLabel: null,
    innerTextCandidate: 'Continue',
    inputType: null,
    isEnabled: true,
    bbox: { x: 0, y: 0, width: 80, height: 24 },
    ...partial,
  };
}

function scene(elements: RawElement[], extra: Partial<RawScene> = {}): RawScene {
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
    ...extra,
  };
}

function proposal(partial: Partial<ActionProposal> = {}): ActionProposal {
  return {
    actionId: createActionId('act-adv'),
    type: 'CLICK',
    targetId: createElementId('e1'),
    reasoning: 'Because the model said so.',
    expectedOutcome: 'Done',
    riskLevel: 'LOW',
    ...partial,
  };
}

function rejectReason(raw: unknown): ActionValidationError | MalformedProposalError {
  try {
    if (raw && typeof raw === 'object' && 'actionId' in (raw as object) && 'type' in (raw as object)) {
      validateActionProposal(raw as ActionProposal, scene([element({ id: createElementId('e1') })]), new PrivateTokenVault(), TASK, ORIGIN);
    } else {
      assertProposalShape(raw);
    }
    throw new Error('expected rejection');
  } catch (err) {
    return err as ActionValidationError | MalformedProposalError;
  }
}

describe('ActionProposal adversarial matrix — local authority wins', () => {
  const target = element({ id: createElementId('e1') });
  const vault = new PrivateTokenVault();

  it('rejects unknown action types', () => {
    expect(rejectReason({ ...proposal(), type: 'EXECUTE_JS' }).message).toMatch(/not in the action vocabulary/);
  });

  it('rejects missing and nonexistent targets', () => {
    expect(() =>
      validateActionProposal(proposal({ type: 'CLICK', targetId: undefined }), scene([target]), vault, TASK, ORIGIN)
    ).toThrow(/requires a targetId/);
    expect(() =>
      validateActionProposal(proposal({ targetId: createElementId('e99') }), scene([target]), vault, TASK, ORIGIN)
    ).toThrow(/not found/);
  });

  it('rejects disabled, inaccessible-frame, and wrong-origin targets', () => {
    const disabled = element({ id: createElementId('e1'), isEnabled: false });
    expect(() => validateActionProposal(proposal(), scene([disabled]), vault, TASK, ORIGIN)).toThrow(/disabled/);

    const framed = element({
      id: createElementId('e1'),
      frameProvenance: { frameId: createFrameId('f9'), frameKind: 'inaccessible', depth: 1, sameOriginAsTop: false },
    });
    expect(() => validateActionProposal(proposal(), scene([framed]), vault, TASK, ORIGIN)).toThrow(/inaccessible frame/);
  });

  it('rejects arbitrary selector, javascript payload, and extra authority fields', () => {
    expect(() => assertProposalShape({ ...proposal(), targetId: '#danger-button' })).toThrow(MalformedProposalError);
    expect(() =>
      assertProposalShape({ ...proposal(), type: 'TYPE_TEXT', textValue: 'javascript:alert(1)' })
    ).toThrow(/executable or navigation payload/);
    const extra = rejectReason({ ...proposal(), confirmed: true });
    expect(extra).toBeInstanceOf(ActionValidationError);
    expect((extra as ActionValidationError).reasonCode).toBe('UNTRUSTED_AUTHORITY_CLAIM');
    expect(() => assertProposalShape({ ...proposal(), policyOverride: 'allow-all' })).toThrow(/authority/);
    expect(() => assertProposalShape({ ...proposal(), selector: 'button.delete' })).toThrow(/authority/);
    expect(() => assertProposalShape({ ...proposal(), verified: true })).toThrow(/authority/);
    expect(() => assertProposalShape({ ...proposal(), unexpected: 1 })).toThrow(/unsupported field/);
  });

  it('rejects invented, expired, cross-task, and cross-origin tokens', () => {
    const email = element({
      id: createElementId('e1'),
      tagName: 'input',
      role: 'textbox',
      inputType: 'email',
      innerTextCandidate: 'Email',
    });
    expect(() =>
      validateActionProposal(
        proposal({ type: 'TYPE_TOKEN', tokenId: createTokenId('tok_invented'), tokenSymbol: '[EMAIL_999]' }),
        scene([email]),
        vault,
        TASK,
        ORIGIN
      )
    ).toThrow(/Unknown or unregistered token/);

    const live = new PrivateTokenVault();
    live.registerToken('[EMAIL_1]', 'PII_EMAIL', 'a@example.com', TASK, 1, ORIGIN, ['email'], -1);
    expect(() =>
      validateActionProposal(
        proposal({ type: 'TYPE_TOKEN', tokenSymbol: '[EMAIL_1]' }),
        scene([email]),
        live,
        TASK,
        ORIGIN
      )
    ).toThrow(/expired/);

    const otherTask = new PrivateTokenVault();
    otherTask.registerToken('[EMAIL_1]', 'PII_EMAIL', 'a@example.com', createTaskId('other-task'), 1, ORIGIN, ['email']);
    expect(() =>
      validateActionProposal(
        proposal({ type: 'TYPE_TOKEN', tokenSymbol: '[EMAIL_1]' }),
        scene([email]),
        otherTask,
        TASK,
        ORIGIN
      )
    ).toThrow(/Cross-task/);

    const otherOrigin = new PrivateTokenVault();
    otherOrigin.registerToken('[EMAIL_1]', 'PII_EMAIL', 'a@example.com', TASK, 1, 'https://evil.example', ['email']);
    expect(() =>
      validateActionProposal(
        proposal({ type: 'TYPE_TOKEN', tokenSymbol: '[EMAIL_1]' }),
        scene([email]),
        otherOrigin,
        TASK,
        ORIGIN
      )
    ).toThrow(/Cross-origin/);
  });

  it('rejects password / OTP token requests and TYPE into password or file fields', () => {
    const password = element({
      id: createElementId('e1'),
      tagName: 'input',
      role: null,
      inputType: 'password',
      innerTextCandidate: 'Password',
    });
    expect(() =>
      validateActionProposal(proposal({ type: 'TYPE_TEXT', textValue: 'nope' }), scene([password]), vault, TASK, ORIGIN)
    ).toThrow(/password field/);

    const file = element({
      id: createElementId('e1'),
      tagName: 'input',
      role: null,
      inputType: 'file',
      innerTextCandidate: 'Upload document',
    });
    expect(() =>
      validateActionProposal(proposal({ type: 'TYPE_TEXT', textValue: '/tmp/x' }), scene([file]), vault, TASK, ORIGIN)
    ).toThrow(/file upload/);
  });

  it('planner-declared LOW cannot downgrade a locally HIGH delete/submit', () => {
    const del = element({ id: createElementId('e1'), innerTextCandidate: 'Delete account' });
    const validated = validateActionProposal(proposal({ riskLevel: 'LOW' }), scene([del]), vault, TASK, ORIGIN);
    expect(validated.approvedRiskLevel).toBe('HIGH');
  });

  it('planner claims of confirmation, policy override, or verification are extra fields, not authority', () => {
    expect(() => assertProposalShape({ ...proposal(), userConfirmed: true })).toThrow(/authority/);
    expect(() => assertProposalShape({ ...proposal(), verification: 'VERIFIED_SUCCESS' })).toThrow(/authority/);
  });

  it('unvalidated actions cannot execute even if _isValidated is forged by the caller', () => {
    const registry = new ElementRegistry();
    const forged = {
      _isValidated: false as unknown as true,
      proposal: proposal(),
      approvedRiskLevel: 'LOW' as const,
      timestamp: Date.now(),
    };
    const result = executeValidatedAction(forged, registry);
    expect(result.success).toBe(false);
  });
});
