/**
 * Confirmation is a capability, not a boolean.
 * Covers binding, replay, expiry, tab/origin invalidation, and post-approval TOCTOU revalidation.
 */

import { describe, expect, it } from 'vitest';
import {
  CONTENT_SCRIPT_PROTOCOL,
  createActionId,
  createElementId,
  createPageEpoch,
  createTaskId,
  TOP_FRAME_ID,
  type ContentScriptHello,
  type ExtensionMessage,
  type RawScene,
  type TabInfo,
  type ValidatedAction,
} from '@n-eye/protocol';
import {
  ConfirmationBroker,
  buildConfirmationBinding,
  routeKeyOf,
  semanticKeyOfFingerprint,
  verifyConfirmationBinding,
} from '../authority/confirmation.js';
import { createTargetFingerprint } from '@n-eye/protocol';
import { PlannerManager } from '../planner/planner-manager.js';
import { MockOcrEngine } from '../perception/mock-engine.js';
import { TrustLoopController } from '../runtime/trust-loop.js';
import type { PagePorts } from '../runtime/page-ports.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { validateActionProposal } from '../authority/validator.js';

const ORIGIN = 'https://lab.example';
const TASK = createTaskId('task-cnf');

function fp(label: string, inputType: 'submit' | 'button' | 'file' | null = 'submit'): ReturnType<typeof createTargetFingerprint> {
  return createTargetFingerprint('button', 'button', inputType, label, {
    xPercent: 1,
    yPercent: 1,
    widthPercent: 10,
    heightPercent: 4,
  });
}

function action(label: string, extras: Partial<ValidatedAction> = {}): ValidatedAction {
  const fingerprint = extras.expectedFingerprint ?? fp(label);
  return {
    _isValidated: true,
    proposal: {
      actionId: createActionId('act-submit'),
      type: 'CLICK',
      targetId: createElementId('e1'),
      reasoning: 'submit',
      expectedOutcome: 'submitted',
      riskLevel: 'HIGH',
    },
    targetElementId: createElementId('e1'),
    expectedFingerprint: fingerprint,
    expectedFrameId: TOP_FRAME_ID,
    observedEpoch: createPageEpoch(1),
    observedUrl: `${ORIGIN}/form`,
    approvedRiskLevel: 'HIGH',
    timestamp: Date.now(),
    ...extras,
  };
}

describe('Confirmation capability binding', () => {
  it('issues a single-use grant bound to task, origin, route, frame, action, target, risk', () => {
    const broker = new ConfirmationBroker();
    const binding = buildConfirmationBinding(action('Submit Application'), { taskId: TASK, origin: ORIGIN });
    expect(binding.actionType).toBe('CLICK');
    expect(binding.origin).toBe(ORIGIN);
    expect(binding.routeKey).toBe(routeKeyOf(`${ORIGIN}/form`));
    expect(binding.frameId).toBe(TOP_FRAME_ID);
    expect(binding.targetSemanticKey).toBe(semanticKeyOfFingerprint(fp('Submit Application')));
    expect(binding.riskLevel).toBe('HIGH');

    const request = broker.issue(binding, { pageEpoch: createPageEpoch(1) });
    expect(request.confirmationId.startsWith('cnf_')).toBe(true);
    expect(broker.resolve('forged-id', true).ok).toBe(false);
    expect(broker.resolve('forged-id', true).reasonCode).toBe('CONFIRMATION_REPLAY');
    expect(broker.resolve(request.confirmationId, true).ok).toBe(true);
    expect(broker.resolve(request.confirmationId, true).ok).toBe(false);

    const consumed = broker.consume(request.confirmationId);
    expect('grant' in consumed && consumed.grant._isUserConfirmed).toBe(true);
    const replay = broker.consume(request.confirmationId);
    expect('ok' in replay && replay.ok === false).toBe(true);
    if ('ok' in replay) expect(replay.reasonCode).toBe('CONFIRMATION_REPLAY');
  });

  it('refuses a Submit approval reused for Delete, another frame, another origin, or another task', () => {
    const broker = new ConfirmationBroker();
    const submit = action('Submit Application');
    const request = broker.issue(buildConfirmationBinding(submit, { taskId: TASK, origin: ORIGIN }), {
      pageEpoch: createPageEpoch(1),
    });
    broker.resolve(request.confirmationId, true);
    const consumed = broker.consume(request.confirmationId);
    if (!('request' in consumed)) throw new Error('expected grant');

    const del = action('Delete account', {
      proposal: { ...submit.proposal, actionId: createActionId('act-delete') },
      expectedFingerprint: fp('Delete account'),
      targetElementId: createElementId('e2'),
    });
    const vsDelete = verifyConfirmationBinding(consumed.request, buildConfirmationBinding(del, { taskId: TASK, origin: ORIGIN }));
    expect(vsDelete.ok).toBe(false);
    expect(vsDelete.changedField).toBeTruthy();

    const otherOrigin = verifyConfirmationBinding(
      consumed.request,
      buildConfirmationBinding(submit, { taskId: TASK, origin: 'https://evil.example' })
    );
    expect(otherOrigin.ok).toBe(false);
    expect(otherOrigin.changedField).toBe('origin');

    const otherTask = verifyConfirmationBinding(
      consumed.request,
      buildConfirmationBinding(submit, { taskId: createTaskId('task-other'), origin: ORIGIN })
    );
    expect(otherTask.ok).toBe(false);
    expect(otherTask.changedField).toBe('taskId');

    const framed: ValidatedAction = { ...submit, expectedFrameId: 'f1' as ValidatedAction['expectedFrameId'] };
    const vsFrame = verifyConfirmationBinding(consumed.request, buildConfirmationBinding(framed, { taskId: TASK, origin: ORIGIN }));
    expect(vsFrame.ok).toBe(false);
    expect(vsFrame.changedField).toBe('frameId');
  });

  it('does not revoke approval when only the reminted opaque targetElementId changed', () => {
    const broker = new ConfirmationBroker();
    const submit = action('Submit Application');
    const request = broker.issue(buildConfirmationBinding(submit, { taskId: TASK, origin: ORIGIN }), {
      pageEpoch: createPageEpoch(1),
    });
    broker.resolve(request.confirmationId, true);
    const consumed = broker.consume(request.confirmationId);
    if (!('request' in consumed)) throw new Error('expected grant');

    const reminted = action('Submit Application', { targetElementId: createElementId('e9') });
    const check = verifyConfirmationBinding(
      consumed.request,
      buildConfirmationBinding(reminted, { taskId: TASK, origin: ORIGIN })
    );
    expect(check.ok).toBe(true);
  });

  it('expires a stale unanswered confirmation', () => {
    const broker = new ConfirmationBroker();
    const request = broker.issue(buildConfirmationBinding(action('Submit Application'), { taskId: TASK, origin: ORIGIN }), {
      pageEpoch: createPageEpoch(1),
      ttlMs: -1,
    });
    const answered = broker.resolve(request.confirmationId, true);
    expect(answered.ok).toBe(false);
    expect(answered.reasonCode).toBe('CONFIRMATION_STALE');
  });
});

function hello(): ContentScriptHello {
  return {
    pong: true,
    ready: true,
    contentProtocol: CONTENT_SCRIPT_PROTOCOL,
    url: `${ORIGIN}/form`,
    origin: ORIGIN,
    epoch: createPageEpoch(1),
    registeredElements: 1,
  };
}

function submitScene(label = 'Submit Application'): RawScene {
  return {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(2),
    url: `${ORIGIN}/form`,
    origin: ORIGIN,
    title: 'Lab',
    viewport: { width: 800, height: 600 },
    timestamp: Date.now(),
    elements: [
      {
        id: createElementId('e1'),
        tagName: 'button',
        role: 'button',
        ariaLabel: label,
        innerTextCandidate: label,
        inputType: 'submit',
        isEnabled: true,
        bbox: { x: 0, y: 0, width: 80, height: 24 },
        fingerprint: fp(label),
      },
    ],
    privacyFindings: [],
  };
}

const tab: TabInfo = {
  tabId: 7,
  url: `${ORIGIN}/form`,
  title: 'Lab',
  origin: ORIGIN,
  isSupported: true,
};

async function waitForPhase(controller: TrustLoopController, phase: string, tries = 80): Promise<void> {
  for (let i = 0; i < tries && controller.getState().phase !== phase; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('HIGH-risk confirmation in the trust loop', () => {
  it('HR-7: denied confirmation executes nothing', async () => {
    let executed = 0;
    const ports: PagePorts = {
      async send<T>(tabId: number, message: ExtensionMessage) {
        if (tabId !== 7) return { ok: false, lastError: 'wrong tab' };
        if (message.type === 'PING') return { ok: true, data: hello() as T };
        if (message.type === 'OBSERVE_REQUEST') return { ok: true, data: submitScene() as T };
        if (message.type === 'EXECUTE_ACTION_REQUEST') {
          executed += 1;
          return { ok: true, data: { success: true } as T };
        }
        return { ok: false, lastError: 'unexpected' };
      },
      async inject() {
        return true;
      },
      async captureRois() {
        return [];
      },
    };
    const controller = new TrustLoopController({
      ports,
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    const done = controller.start('Submit the application');
    await waitForPhase(controller, 'AWAITING_CONFIRMATION');
    expect(controller.getState().confirmation?.confirmationId).toMatch(/^cnf_/);
    expect(controller.getState().confirmation?.risk).toBe('HIGH');
    controller.confirm(false, controller.getState().confirmation?.confirmationId);
    await done;
    expect(executed).toBe(0);
    expect(controller.getState().phase).toBe('CANCELLED');
  });

  it('HR-9 + TOCTOU: approval of Submit does not authorize a mutated Delete target', async () => {
    let executed = 0;
    let observes = 0;
    const ports: PagePorts = {
      async send<T>(tabId: number, message: ExtensionMessage) {
        if (tabId !== 7) return { ok: false, lastError: 'wrong tab' };
        if (message.type === 'PING') return { ok: true, data: hello() as T };
        if (message.type === 'OBSERVE_REQUEST') {
          observes += 1;
          const label = observes === 1 ? 'Submit Application' : 'Delete account';
          return { ok: true, data: submitScene(label) as T };
        }
        if (message.type === 'EXECUTE_ACTION_REQUEST') {
          executed += 1;
          return { ok: true, data: { success: true } as T };
        }
        return { ok: false, lastError: 'unexpected' };
      },
      async inject() {
        return true;
      },
      async captureRois() {
        return [];
      },
    };
    const controller = new TrustLoopController({
      ports,
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    const done = controller.start('Submit the application');
    await waitForPhase(controller, 'AWAITING_CONFIRMATION');
    const id = controller.getState().confirmation?.confirmationId;
    expect(id).toBeTruthy();
    controller.confirm(true, 'cnf_forged_other_action');
    expect(controller.getState().phase).toBe('AWAITING_CONFIRMATION');
    controller.confirm(true, id);
    await done;
    expect(executed).toBe(0);
    expect(controller.getState().phase).toBe('BLOCKED');
    expect(controller.getState().evidence.securityReason).toMatch(/CONFIRMATION_STALE|RISK_ESCALATED|STALE/);
  });

  it('tab / origin switch invalidates a pending confirmation', async () => {
    const ports: PagePorts = {
      async send<T>(tabId: number, message: ExtensionMessage) {
        if (message.type === 'PING') return { ok: true, data: hello() as T };
        if (message.type === 'OBSERVE_REQUEST') return { ok: true, data: submitScene() as T };
        if (message.type === 'EXECUTE_ACTION_REQUEST') return { ok: false, lastError: 'should not execute' };
        return { ok: false, lastError: 'unexpected' };
      },
      async inject() {
        return true;
      },
      async captureRois() {
        return [];
      },
    };
    const controller = new TrustLoopController({
      ports,
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    const done = controller.start('Submit the application');
    await waitForPhase(controller, 'AWAITING_CONFIRMATION');
    const id = controller.getState().confirmation?.confirmationId;
    controller.bindTab({ ...tab, tabId: 9, origin: 'https://other.example', url: 'https://other.example/x' });
    controller.confirm(true, id);
    await done;
    expect(controller.getState().phase).toBe('CANCELLED');
  });
});

describe('Post-confirm revalidation uses a freshly validated action', () => {
  it('a Confirm grant does not freeze a stale ValidatedAction across a semantic swap', () => {
    const vault = new PrivateTokenVault();
    const submitEl = {
      id: createElementId('e1'),
      tagName: 'button',
      role: 'button',
      ariaLabel: 'Submit Application',
      innerTextCandidate: 'Submit Application',
      inputType: 'submit' as const,
      isEnabled: true,
      bbox: { x: 0, y: 0, width: 80, height: 24 },
      fingerprint: fp('Submit Application'),
    };
    const first = validateActionProposal(
      {
        actionId: createActionId('act-submit'),
        type: 'CLICK',
        targetId: submitEl.id,
        reasoning: 'submit',
        expectedOutcome: 'ok',
        riskLevel: 'LOW',
      },
      {
        _isLocalOnly: true,
        pageEpoch: createPageEpoch(1),
        url: `${ORIGIN}/form`,
        origin: ORIGIN,
        title: 'Lab',
        viewport: { width: 800, height: 600 },
        elements: [submitEl],
        privacyFindings: [],
        timestamp: Date.now(),
      },
      vault,
      TASK,
      ORIGIN
    );
    const broker = new ConfirmationBroker();
    const request = broker.issue(buildConfirmationBinding(first, { taskId: TASK, origin: ORIGIN }), {
      pageEpoch: createPageEpoch(1),
    });
    broker.resolve(request.confirmationId, true);
    const consumed = broker.consume(request.confirmationId);
    if (!('request' in consumed)) throw new Error('expected grant');

    const swapped = {
      ...submitEl,
      innerTextCandidate: 'Delete account',
      ariaLabel: 'Delete account',
      fingerprint: fp('Delete account'),
    };
    const second = validateActionProposal(
      {
        actionId: createActionId('act-submit'),
        type: 'CLICK',
        targetId: swapped.id,
        reasoning: 'submit',
        expectedOutcome: 'ok',
        riskLevel: 'LOW',
      },
      {
        _isLocalOnly: true,
        pageEpoch: createPageEpoch(2),
        url: `${ORIGIN}/form`,
        origin: ORIGIN,
        title: 'Lab',
        viewport: { width: 800, height: 600 },
        elements: [swapped],
        privacyFindings: [],
        timestamp: Date.now(),
      },
      vault,
      TASK,
      ORIGIN
    );
    const check = verifyConfirmationBinding(consumed.request, buildConfirmationBinding(second, { taskId: TASK, origin: ORIGIN }));
    expect(check.ok).toBe(false);
    expect(check.changedField).toBe('targetSemanticKey');
  });
});
