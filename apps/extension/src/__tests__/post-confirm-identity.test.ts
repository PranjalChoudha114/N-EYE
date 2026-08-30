/**
 * Post-confirm target identity: opaque eN is reminted each observe; approval is semantic.
 * Generic autocomplete/rerender — no site-specific selectors.
 */

import { describe, expect, it } from 'vitest';
import {
  CONTENT_SCRIPT_PROTOCOL,
  createActionId,
  createElementId,
  createFrameId,
  createPageEpoch,
  createTaskId,
  createTargetFingerprint,
  TOP_FRAME_ID,
  type ActionProposal,
  type ConfirmationBinding,
  type ConfirmationRequest,
  type ContentScriptHello,
  type ExtensionMessage,
  type InputType,
  type RawElement,
  type RawScene,
  type TabInfo,
  type TargetFingerprint,
  type ValidatedAction,
} from '@n-eye/protocol';
import {
  ConfirmationBroker,
  ConfirmationStaleError,
  buildConfirmationBinding,
  retargetProposalToApprovedBinding,
  semanticKeyOfFingerprint,
  verifyConfirmationBinding,
} from '../authority/confirmation.js';
import { validateActionProposal } from '../authority/validator.js';
import { PlannerManager } from '../planner/planner-manager.js';
import { MockOcrEngine } from '../perception/mock-engine.js';
import { TrustLoopController } from '../runtime/trust-loop.js';
import type { PagePorts } from '../runtime/page-ports.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';

const ORIGIN = 'https://lab.example';
const TASK = createTaskId('task-pci');

function fp(
  label: string,
  extras: { tagName?: string; inputType?: InputType | null; role?: string } = {}
): TargetFingerprint {
  return createTargetFingerprint(
    extras.role ?? 'button',
    extras.tagName ?? 'button',
    extras.inputType === undefined ? 'submit' : extras.inputType,
    label,
    { xPercent: 1, yPercent: 1, widthPercent: 10, heightPercent: 4 }
  );
}

function rawEl(
  id: string,
  label: string,
  extras: Partial<RawElement> & { fingerprint?: ReturnType<typeof fp> } = {}
): RawElement {
  const fingerprint = extras.fingerprint ?? fp(label);
  return {
    id: createElementId(id),
    tagName: extras.tagName ?? 'button',
    role: extras.role ?? 'button',
    ariaLabel: extras.ariaLabel ?? label,
    innerTextCandidate: extras.innerTextCandidate ?? label,
    inputType: extras.inputType === undefined ? 'submit' : extras.inputType,
    isEnabled: extras.isEnabled ?? true,
    bbox: extras.bbox ?? { x: 0, y: 0, width: 80, height: 24 },
    fingerprint,
    formSubmitting: extras.formSubmitting ?? true,
    frameProvenance: extras.frameProvenance ?? {
      frameId: TOP_FRAME_ID,
      frameKind: 'top',
      depth: 0,
      sameOriginAsTop: true,
    },
  };
}

function scene(elements: RawElement[], epoch = 2, url = `${ORIGIN}/form`): RawScene {
  return {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(epoch),
    url,
    origin: ORIGIN,
    title: 'Lab',
    viewport: { width: 800, height: 600 },
    timestamp: Date.now(),
    elements,
    privacyFindings: [],
  };
}

function clickProposal(targetId: string, actionId = 'act-search'): ActionProposal {
  return {
    actionId: createActionId(actionId),
    type: 'CLICK',
    targetId: createElementId(targetId),
    reasoning: 'submit search',
    expectedOutcome: 'results',
    riskLevel: 'HIGH',
  };
}

function validatedFrom(el: RawElement, proposal: ActionProposal = clickProposal(String(el.id))): ValidatedAction {
  return validateActionProposal(proposal, scene([el], 1), new PrivateTokenVault(), TASK, ORIGIN);
}

function issueFor(
  el: RawElement,
  extras: Partial<ValidatedAction> = {}
): { action: ValidatedAction; request: ConfirmationRequest; broker: ConfirmationBroker } {
  const action = { ...validatedFrom(el), ...extras };
  const broker = new ConfirmationBroker();
  const request = broker.issue(buildConfirmationBinding(action, { taskId: TASK, origin: ORIGIN }), {
    pageEpoch: createPageEpoch(1),
  });
  broker.resolve(request.confirmationId, true);
  const consumed = broker.consume(request.confirmationId);
  if (!('request' in consumed)) throw new Error('expected grant');
  return { action, request: consumed.request, broker };
}

describe('Post-confirm identity (opaque ids vs semantic key)', () => {
  it('1. unchanged target survives confirmation', () => {
    const search = rawEl('e2', 'Search');
    const { request } = issueFor(search);
    const liveProposal = retargetProposalToApprovedBinding(clickProposal('e2'), scene([search]), request);
    expect(liveProposal.targetId).toBe(search.id);
    const revalidated = validateActionProposal(liveProposal, scene([search]), new PrivateTokenVault(), TASK, ORIGIN);
    const check = verifyConfirmationBinding(request, buildConfirmationBinding(revalidated, { taskId: TASK, origin: ORIGIN }));
    expect(check.ok).toBe(true);
  });

  it('2. unique semantically-equivalent replacement after remint survives', () => {
    const approved = rawEl('e2', 'Search');
    const { request } = issueFor(approved);
    const suggestion = rawEl('e2', 'artificial intelligence', {
      tagName: 'div',
      role: 'option',
      inputType: null,
      formSubmitting: false,
      fingerprint: fp('artificial intelligence', { tagName: 'div', role: 'option', inputType: null }),
    });
    const replacement = rawEl('e4', 'Search');
    const fresh = scene([rawEl('e1', 'Search', { tagName: 'input', role: 'searchbox', inputType: 'search', formSubmitting: false, fingerprint: fp('Search', { tagName: 'input', role: 'searchbox', inputType: 'search' }) }), suggestion, replacement]);
    const liveProposal = retargetProposalToApprovedBinding(clickProposal('e2'), fresh, request);
    expect(liveProposal.targetId).toBe(replacement.id);
    const revalidated = validateActionProposal(liveProposal, fresh, new PrivateTokenVault(), TASK, ORIGIN);
    expect(verifyConfirmationBinding(request, buildConfirmationBinding(revalidated, { taskId: TASK, origin: ORIGIN })).ok).toBe(
      true
    );
  });

  it('3. volatile geometry / neighborhood does not false-reject', () => {
    const search = rawEl('e2', 'Search', {
      fingerprint: createTargetFingerprint('button', 'button', 'submit', 'Search', {
        xPercent: 10,
        yPercent: 10,
        widthPercent: 8,
        heightPercent: 3,
      }, 'nh_aaaa'),
    });
    const { request } = issueFor(search);
    const moved = rawEl('e2', 'Search', {
      bbox: { x: 400, y: 12, width: 40, height: 20 },
      fingerprint: createTargetFingerprint('button', 'button', 'submit', 'Search', {
        xPercent: 50,
        yPercent: 2,
        widthPercent: 5,
        heightPercent: 3,
      }, 'nh_bbbb'),
    });
    expect(semanticKeyOfFingerprint(search.fingerprint)).toBe(semanticKeyOfFingerprint(moved.fingerprint));
    const liveProposal = retargetProposalToApprovedBinding(clickProposal('e2'), scene([moved]), request);
    const revalidated = validateActionProposal(liveProposal, scene([moved]), new PrivateTokenVault(), TASK, ORIGIN);
    expect(verifyConfirmationBinding(request, buildConfirmationBinding(revalidated, { taskId: TASK, origin: ORIGIN })).ok).toBe(
      true
    );
  });

  it('4. actual target semantic change invalidates approval', () => {
    const search = rawEl('e2', 'Search');
    const { request } = issueFor(search);
    const swapped = rawEl('e2', 'Delete account');
    expect(() => retargetProposalToApprovedBinding(clickProposal('e2'), scene([swapped]), request)).toThrow(
      ConfirmationStaleError
    );
  });

  it('5. action type change invalidates approval', () => {
    const search = rawEl('e2', 'Search');
    const { request } = issueFor(search);
    const live: ConfirmationBinding = {
      ...request,
      actionType: 'TYPE_TEXT',
    };
    const check = verifyConfirmationBinding(request, live);
    expect(check.ok).toBe(false);
    expect(check.changedField).toBe('actionType');
  });

  it('6. risk increase invalidates approval', () => {
    const search = rawEl('e2', 'Search');
    const { request } = issueFor(search);
    const live: ConfirmationBinding = { ...request, riskLevel: 'BLOCKED' };
    const check = verifyConfirmationBinding(request, live);
    expect(check.ok).toBe(false);
    expect(check.reasonCode).toBe('RISK_ESCALATED');
    expect(check.changedField).toBe('riskLevel');
  });

  it('7. origin and frame mismatch invalidate approval', () => {
    const search = rawEl('e2', 'Search');
    const { request } = issueFor(search);
    expect(verifyConfirmationBinding(request, { ...request, origin: 'https://evil.example' }).ok).toBe(false);
    expect(verifyConfirmationBinding(request, { ...request, origin: 'https://evil.example' }).changedField).toBe('origin');
    expect(verifyConfirmationBinding(request, { ...request, frameId: createFrameId('f1') }).changedField).toBe('frameId');

    const iframeTwin = rawEl('e2', 'Search', {
      frameProvenance: { frameId: createFrameId('f1'), frameKind: 'same-origin', depth: 1, sameOriginAsTop: true },
    });
    expect(() => retargetProposalToApprovedBinding(clickProposal('e2'), scene([iframeTwin]), request)).toThrow(
      ConfirmationStaleError
    );
  });

  it('8. ambiguous replacement fails closed', () => {
    const search = rawEl('e2', 'Search');
    const { request } = issueFor(search);
    const twins = scene([rawEl('e3', 'Search'), rawEl('e4', 'Search')]);
    expect(() => retargetProposalToApprovedBinding(clickProposal('e2'), twins, request)).toThrow(/ambiguous/i);
  });

  it('9. stale pre-confirm id that now names a different control is not executed', () => {
    const search = rawEl('e2', 'Search');
    const { request } = issueFor(search);
    const hostileAtOldId = rawEl('e2', 'Delete account');
    const stillSearch = rawEl('e5', 'Search');
    const liveProposal = retargetProposalToApprovedBinding(
      clickProposal('e2'),
      scene([hostileAtOldId, stillSearch]),
      request
    );
    expect(liveProposal.targetId).toBe(stillSearch.id);
    expect(liveProposal.targetId).not.toBe(hostileAtOldId.id);
  });

  it('10. approval remains single-use and scoped', () => {
    const search = rawEl('e2', 'Search');
    const { request, broker } = issueFor(search);
    const replay = broker.consume(request.confirmationId);
    expect('ok' in replay && replay.ok === false).toBe(true);
    if ('ok' in replay) expect(replay.reasonCode).toBe('CONFIRMATION_REPLAY');
  });

  it('11. generic typeahead inserting extra interactives remints eN; unique search-submit still executes', () => {
    document.body.innerHTML = `
      <form action="/find">
        <input type="search" name="q" aria-label="Search query" />
        <button type="submit">Search</button>
      </form>
    `;
    const registry = new ElementRegistry();
    const first = observePage(registry, createPageEpoch(1));
    const searchBtn = first.elements.find((el) => el.tagName.toLowerCase() === 'button' && el.formSubmitting);
    if (!searchBtn) throw new Error('expected unique form-submit Search button');
    const approvedKey = semanticKeyOfFingerprint(searchBtn.fingerprint);
    expect(approvedKey).toMatch(/search$/);

    const form = document.querySelector('form');
    const button = document.querySelector('button');
    if (!form || !button) throw new Error('missing form controls');
    const list = document.createElement('div');
    list.setAttribute('role', 'listbox');
    list.innerHTML =
      '<div role="option">artificial intelligence</div><div role="option">artificial neural network</div>';
    form.insertBefore(list, button);

    const second = observePage(registry, createPageEpoch(2));
    expect(second.elements.length).toBeGreaterThan(first.elements.length);
    const staleSlot = second.elements.find((el) => el.id === searchBtn.id);
    expect(staleSlot).toBeTruthy();
    expect(semanticKeyOfFingerprint(staleSlot?.fingerprint)).not.toBe(approvedKey);

    const binding: ConfirmationBinding = {
      taskId: TASK,
      actionId: createActionId('act-search'),
      origin: ORIGIN,
      routeKey: `${ORIGIN}/find`,
      frameId: TOP_FRAME_ID,
      actionType: 'CLICK',
      targetElementId: searchBtn.id,
      targetSemanticKey: approvedKey,
      riskLevel: 'HIGH',
    };
    const liveProposal = retargetProposalToApprovedBinding(clickProposal(String(searchBtn.id)), second, binding);
    expect(liveProposal.targetId).not.toBe(searchBtn.id);
    const liveTarget = second.elements.find((el) => el.id === liveProposal.targetId);
    expect(liveTarget?.formSubmitting).toBe(true);
    expect(semanticKeyOfFingerprint(liveTarget?.fingerprint)).toBe(approvedKey);
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

function submitEl(id: string, label: string): RawElement {
  return rawEl(id, label);
}

function submitScene(elements: RawElement[]): RawScene {
  return scene(elements, 2);
}

describe('Trust loop post-confirm remint / hostile swap', () => {
  it('Allow once executes the unique equivalent Search control after typeahead remint', async () => {
    let usePostConfirm = false;
    let executedTarget: string | undefined;
    const pre = [submitEl('e1', 'Submit Application')];
    const post = [
      rawEl('e1', 'artificial intelligence', {
        tagName: 'div',
        role: 'option',
        inputType: null,
        formSubmitting: false,
        fingerprint: fp('artificial intelligence', { tagName: 'div', role: 'option', inputType: null }),
      }),
      submitEl('e2', 'Submit Application'),
    ];
    const ports: PagePorts = {
      async send<T>(tabId: number, message: ExtensionMessage) {
        if (tabId !== 7) return { ok: false, lastError: 'wrong tab' };
        if (message.type === 'PING') return { ok: true, data: hello() as T };
        if (message.type === 'OBSERVE_REQUEST') {
          return { ok: true, data: submitScene(usePostConfirm ? post : pre) as T };
        }
        if (message.type === 'EXECUTE_ACTION_REQUEST') {
          executedTarget = String(message.action.targetElementId || message.action.proposal.targetId);
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
    usePostConfirm = true;
    controller.confirm(true, id);
    await done;
    expect(executedTarget).toBe('e2');
    expect(controller.getState().phase).not.toBe('BLOCKED');
  });

  it('Allow once still refuses a semantic swap onto Delete', async () => {
    let usePostConfirm = false;
    let executed = 0;
    const ports: PagePorts = {
      async send<T>(tabId: number, message: ExtensionMessage) {
        if (tabId !== 7) return { ok: false, lastError: 'wrong tab' };
        if (message.type === 'PING') return { ok: true, data: hello() as T };
        if (message.type === 'OBSERVE_REQUEST') {
          const label = usePostConfirm ? 'Delete account' : 'Submit Application';
          return { ok: true, data: submitScene([submitEl('e1', label)]) as T };
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
    usePostConfirm = true;
    controller.confirm(true, controller.getState().confirmation?.confirmationId);
    await done;
    expect(executed).toBe(0);
    expect(controller.getState().phase).toBe('BLOCKED');
  });
});
