import { describe, expect, it } from 'vitest';
import {
  CONTENT_SCRIPT_PROTOCOL,
  createActionId,
  createElementId,
  createPageEpoch,
  createTaskId,
  type ContentScriptHello,
  type ExtensionMessage,
  type RawScene,
  type SafeContext,
  type SafeElement,
  type TabInfo,
  type TargetFingerprint,
} from '@n-eye/protocol';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';
import {
  parseMockGoal,
  pickUniqueSearchSubmitTarget,
  pickUniqueTypeTextTarget,
} from '../planner/mock-grammar.js';
import { PlannerManager } from '../planner/planner-manager.js';
import { MockOcrEngine } from '../perception/mock-engine.js';
import { TrustLoopController } from '../runtime/trust-loop.js';
import type { PagePorts } from '../runtime/page-ports.js';
import { arbitratePlannerComplete } from '../runtime/completion-arbiter.js';
import { verificationShowsNavigation } from '../verification/verifier.js';

function context(goal: string, elements: SafeContext['safeElements']): SafeContext {
  return {
    protocolVersion: '1.0.0',
    taskId: createTaskId('task-search'),
    pageEpoch: createPageEpoch(1),
    sanitizedGoal: goal,
    pageMetadata: { origin: 'https://lab.example', sanitizedTitle: 'Lab', viewport: { width: 800, height: 600 } },
    safeElements: elements,
    availableTokens: [],
  };
}

const searchbox: SafeElement = {
  id: createElementId('e1'),
  role: 'searchbox',
  safeLabel: 'Search',
  inputType: 'search',
  isEnabled: true,
  bbox: { x: 0, y: 0, width: 200, height: 32 },
};

const searchBtn: SafeElement = {
  id: createElementId('e2'),
  role: 'button',
  safeLabel: 'Search',
  inputType: 'button',
  isEnabled: true,
  bbox: { x: 210, y: 0, width: 40, height: 32 },
};

function hello(): ContentScriptHello {
  return {
    pong: true,
    ready: true,
    contentProtocol: CONTENT_SCRIPT_PROTOCOL,
    url: 'https://lab.example/form',
    origin: 'https://lab.example',
    epoch: createPageEpoch(1),
    registeredElements: 2,
  };
}

function searchScene(url = 'https://lab.example/form', extra: RawScene['elements'] = []): RawScene {
  return {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(2),
    url,
    origin: 'https://lab.example',
    title: 'Lab',
    viewport: { width: 800, height: 600 },
    timestamp: Date.now(),
    elements: [
      {
        id: createElementId('e1'),
        tagName: 'input',
        role: 'searchbox',
        ariaLabel: 'Search',
        innerTextCandidate: 'Search',
        inputType: 'search',
        isEnabled: true,
        bbox: { x: 0, y: 0, width: 240, height: 32 },
      },
      {
        id: createElementId('e2'),
        tagName: 'button',
        role: 'button',
        ariaLabel: 'Search',
        innerTextCandidate: 'Search',
        inputType: 'button',
        isEnabled: true,
        bbox: { x: 250, y: 0, width: 48, height: 32 },
      },
      ...extra,
    ],
    privacyFindings: [],
  };
}

function suggestionElement(): RawScene['elements'][number] {
  return {
    id: createElementId('e9'),
    tagName: 'button',
    role: 'button',
    ariaLabel: 'Suggestion',
    innerTextCandidate: 'Suggestion',
    inputType: 'button',
    isEnabled: true,
    bbox: { x: 0, y: 40, width: 80, height: 20 },
  };
}

function typeOnlySearchScene(): RawScene {
  const scene = searchScene();
  const field = scene.elements.find((el) => el.role === 'searchbox');
  return { ...scene, elements: field ? [field] : [] };
}

const tab: TabInfo = {
  tabId: 7,
  url: 'https://lab.example/form',
  title: 'Lab',
  origin: 'https://lab.example',
  isSupported: true,
};

describe('Composite SEARCH / type-then-act', () => {
  it('parses search-for, location suffix, find, look-up, and scoped search', () => {
    expect(parseMockGoal('Search for OpenAI')).toMatchObject({
      kind: 'type_text',
      text: 'OpenAI',
      requiresSearchSubmit: true,
    });
    expect(parseMockGoal('Search for OpenAI in YouTube search bar')).toMatchObject({
      kind: 'type_text',
      text: 'OpenAI',
      requiresSearchSubmit: true,
    });
    expect(parseMockGoal('Find laptops')).toMatchObject({
      kind: 'type_text',
      text: 'laptops',
      requiresSearchSubmit: true,
    });
    expect(parseMockGoal('Look up privacy browsers')).toMatchObject({
      kind: 'type_text',
      text: 'privacy browsers',
      requiresSearchSubmit: true,
    });
    expect(parseMockGoal('Search documentation for SafeContext')).toMatchObject({
      kind: 'type_text',
      text: 'SafeContext',
      requiresSearchSubmit: true,
    });
    expect(parseMockGoal('Type OpenAI in the search field')).toMatchObject({
      kind: 'type_text',
      text: 'OpenAI',
      requiresSearchSubmit: false,
    });
  });

  it('CASE A: type-only MATCHED may complete', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Type OpenAI in the search field',
      verifiedCount: 1,
      lastVerifiedType: 'TYPE_TEXT',
      lastFieldState: 'MATCHED',
      verifiedClick: false,
    });
    expect(decision.phase).toBe('COMPLETED');
  });

  it('CASE B: search + TYPE_TEXT only is not complete', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Search for OpenAI',
      verifiedCount: 1,
      lastVerifiedType: 'TYPE_TEXT',
      lastFieldState: 'MATCHED',
      verifiedClick: false,
    });
    expect(decision.phase).toBe('ASK_USER');
    expect(decision.kind).toBe('PARTIAL');
    expect(decision.message).not.toMatch(/Typed text and search action were verified locally/);
  });

  it('CASE C: type + unique submit + navigation may complete', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Search for OpenAI',
      verifiedCount: 2,
      lastVerifiedType: 'CLICK',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
      verifiedSearchOutcome: true,
    });
    expect(decision.phase).toBe('COMPLETED');
    expect(decision.message).toBe('Typed text and search action were verified locally.');
  });

  it('CASE D: missing submit control is ASK_USER, not complete', async () => {
    const planner = new DeterministicPlanner();
    await planner.proposeAction(context('Search for OpenAI', [searchbox]));
    const afterType = await planner.proposeAction({
      ...context('Search for OpenAI', [searchbox]),
      priorOutcome: { actionId: createActionId('act_1'), status: 'VERIFIED', summary: 'matched' },
    });
    expect(afterType.proposal.type).toBe('ASK_USER');
    expect(afterType.proposal.reasoning).toMatch(/no unique search button/i);
    const arbiter = arbitratePlannerComplete({
      goal: 'Search for OpenAI',
      verifiedCount: 1,
      lastVerifiedType: 'TYPE_TEXT',
      lastFieldState: 'MATCHED',
      verifiedClick: false,
    });
    expect(arbiter.phase).not.toBe('COMPLETED');
  });

  it('CASE E: click without navigation is not complete', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Search for OpenAI',
      verifiedCount: 2,
      lastVerifiedType: 'CLICK',
      lastFieldState: 'MATCHED',
      verifiedClick: true,
      verifiedSearchOutcome: false,
    });
    expect(decision.phase).toBe('ASK_USER');
    expect(decision.kind).toBe('PARTIAL');
    expect(decision.message).toMatch(/could not verify that search actually occurred/i);
  });

  it('CASE F: planner COMPLETE after TYPE_TEXT only is rejected', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Search for OpenAI in the search bar',
      verifiedCount: 1,
      lastVerifiedType: 'TYPE_TEXT',
      lastFieldState: 'MATCHED',
      verifiedClick: false,
    });
    expect(decision.phase).toBe('ASK_USER');
    expect(decision.phase).not.toBe('COMPLETED');
  });

  it('CASE G: ambiguous submit after typing is ASK_USER', async () => {
    const planner = new DeterministicPlanner();
    const twoSearch = [
      searchbox,
      searchBtn,
      {
        id: createElementId('e3'),
        role: 'button',
        safeLabel: 'Search',
        inputType: 'button' as const,
        isEnabled: true,
        bbox: { x: 260, y: 0, width: 40, height: 32 },
      },
    ];
    await planner.proposeAction(context('Search for OpenAI', twoSearch));
    const afterType = await planner.proposeAction({
      ...context('Search for OpenAI', twoSearch),
      priorOutcome: { actionId: createActionId('act_1'), status: 'VERIFIED', summary: 'matched' },
    });
    expect(afterType.proposal.type).toBe('ASK_USER');
    expect(afterType.proposal.reasoning).toMatch(/multiple search\/submit/i);
  });

  it('CASE H: unique submit replacement is re-grounded; duplicates abstain', async () => {
    const planner = new DeterministicPlanner();
    await planner.proposeAction(context('Search for OpenAI', [searchbox, searchBtn]));
    const replaced: SafeElement = {
      id: createElementId('e9'),
      role: 'button',
      safeLabel: 'Search',
      inputType: 'button',
      isEnabled: true,
      bbox: { x: 210, y: 0, width: 40, height: 32 },
    };
    const afterReplace = await planner.proposeAction({
      ...context('Search for OpenAI', [searchbox, replaced]),
      priorOutcome: { actionId: createActionId('act_1'), status: 'VERIFIED', summary: 'matched' },
    });
    expect(afterReplace.proposal.type).toBe('CLICK');
    expect(afterReplace.proposal.targetId).toBe(replaced.id);

    const planner2 = new DeterministicPlanner();
    await planner2.proposeAction(context('Search for OpenAI', [searchbox, searchBtn]));
    const ambiguousReplace = await planner2.proposeAction({
      ...context('Search for OpenAI', [
        searchbox,
        replaced,
        {
          id: createElementId('e8'),
          role: 'button',
          safeLabel: 'Search',
          inputType: 'button',
          isEnabled: true,
          bbox: { x: 300, y: 0, width: 40, height: 32 },
        },
      ]),
      priorOutcome: { actionId: createActionId('act_1'), status: 'VERIFIED', summary: 'matched' },
    });
    expect(ambiguousReplace.proposal.type).toBe('ASK_USER');
  });

  it('CASE I: overwritten field is not complete', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Search for OpenAI',
      verifiedCount: 1,
      lastVerifiedType: 'TYPE_TEXT',
      lastFieldState: 'MATCHED',
      liveFieldState: 'DIVERGED',
      verifiedClick: false,
      verifiedSearchOutcome: true,
    });
    expect(decision.phase).toBe('ASK_USER');
    expect(decision.message).toMatch(/no longer holds the requested text/i);
  });

  it('CASE J: already-typed field is not already-satisfied search', () => {
    const decision = arbitratePlannerComplete({
      goal: 'Search for OpenAI',
      verifiedCount: 0,
      verifiedClick: false,
      liveFieldState: 'MATCHED',
    });
    expect(decision.phase).toBe('ASK_USER');
    expect(decision.kind).toBe('PARTIAL');
    expect(decision.alreadySatisfied).toBe(false);
  });

  it('picks the unique Search button, not a longer Search-with-camera control', () => {
    const picked = pickUniqueSearchSubmitTarget([
      { id: 'cam', role: 'button', safeLabel: 'Search with your camera', isEnabled: true },
      { id: 'go', role: 'button', safeLabel: 'Search', isEnabled: true },
    ]);
    expect(picked.ok).toBe(true);
    if (picked.ok) expect(picked.target.id).toBe('go');
  });

  it('does not skip search submit when planner stepCount is already 3', async () => {
    const planner = new DeterministicPlanner();
    const page = context('Search for OpenAI', [searchbox, searchBtn]);
    const first = await planner.proposeAction(page);
    const second = await planner.proposeAction(page);
    expect(first.proposal.type).toBe('TYPE_TEXT');
    expect(second.proposal.type).toBe('TYPE_TEXT');
    const third = await planner.proposeAction({
      ...page,
      priorOutcome: { actionId: createActionId('act_1'), status: 'VERIFIED', summary: 'matched' },
    });
    expect(third.proposal.type).toBe('CLICK');
    expect(third.proposal.targetId).toBe(searchBtn.id);
  });

  it('first planner turn for a search goal is TYPE_TEXT of the query only', async () => {
    const planner = new DeterministicPlanner();
    const result = await planner.proposeAction(
      context('Search for OpenAI in YouTube search bar', [searchbox, searchBtn])
    );
    expect(result.proposal.type).toBe('TYPE_TEXT');
    expect(result.proposal.textValue).toBe('OpenAI');
    const picked = pickUniqueTypeTextTarget([searchbox], ['search']);
    expect(picked.ok).toBe(true);
  });

  it('treats control-set change without URL change as not search navigation', () => {
    const pre: RawScene = searchScene();
    const post: RawScene = searchScene('https://lab.example/form', [suggestionElement()]);
    expect(verificationShowsNavigation(pre, post)).toBe(false);
    expect(verificationShowsNavigation(pre, searchScene('https://lab.example/results?q=OpenAI'))).toBe(true);
  });
});

describe('Composite SEARCH trust loop', () => {
  it('CASE A loop: type-only goal completes after MATCHED', async () => {
    const ports: PagePorts = {
      async send<T>(tabId: number, message: ExtensionMessage) {
        if (tabId !== 7) return { ok: false, lastError: 'wrong tab' };
        if (message.type === 'PING') return { ok: true, data: hello() as T };
        if (message.type === 'OBSERVE_REQUEST') {
          return { ok: true, data: typeOnlySearchScene() as T };
        }
        if (message.type === 'EXECUTE_ACTION_REQUEST') {
          return { ok: true, data: { success: true, fieldState: 'MATCHED' } as T };
        }
        if (message.type === 'PROBE_FIELD_REQUEST') {
          return { ok: true, data: { success: true, fieldState: 'MATCHED' } as T };
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
    await controller.start('Type OpenAI in the search field');
    expect(controller.getState().phase).toBe('COMPLETED');
  });

  it('CASE C loop: search completes only after observed navigation', async () => {
    let submitted = false;
    const ports: PagePorts = {
      async send<T>(tabId: number, message: ExtensionMessage) {
        if (tabId !== 7) return { ok: false, lastError: 'wrong tab' };
        if (message.type === 'PING') return { ok: true, data: hello() as T };
        if (message.type === 'OBSERVE_REQUEST') {
          const url = submitted ? 'https://lab.example/results?q=OpenAI' : 'https://lab.example/form';
          return { ok: true, data: searchScene(url) as T };
        }
        if (message.type === 'EXECUTE_ACTION_REQUEST') {
          if (message.action.proposal.type === 'CLICK') submitted = true;
          return { ok: true, data: { success: true, fieldState: 'MATCHED' } as T };
        }
        if (message.type === 'PROBE_FIELD_REQUEST') {
          return { ok: true, data: { success: true, fieldState: 'MATCHED' } as T };
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
    await controller.start('Search for OpenAI in YouTube search bar');
    const state = controller.getState();
    expect(submitted).toBe(true);
    expect(state.phase).toBe('COMPLETED');
    expect(state.message).toMatch(/Typed text and search action were verified locally/);
  });

  it('CASE E loop: search click that only grows the control set is not complete', async () => {
    let clicked = false;
    const ports: PagePorts = {
      async send<T>(tabId: number, message: ExtensionMessage) {
        if (tabId !== 7) return { ok: false, lastError: 'wrong tab' };
        if (message.type === 'PING') return { ok: true, data: hello() as T };
        if (message.type === 'OBSERVE_REQUEST') {
          const extra = clicked ? [suggestionElement()] : [];
          return { ok: true, data: searchScene('https://lab.example/form', extra) as T };
        }
        if (message.type === 'EXECUTE_ACTION_REQUEST') {
          if (message.action.proposal.type === 'CLICK') clicked = true;
          return { ok: true, data: { success: true, fieldState: 'MATCHED' } as T };
        }
        if (message.type === 'PROBE_FIELD_REQUEST') {
          return { ok: true, data: { success: true, fieldState: 'MATCHED' } as T };
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
    await controller.start('Search for OpenAI');
    const state = controller.getState();
    expect(state.phase).toBe('ASK_USER');
    expect(state.headline).not.toBe('Completed');
    expect(state.message).not.toMatch(/Typed text and search action were verified locally/);
  });
});

describe('ASK_USER Continue after composite search', () => {
  const fieldFp: TargetFingerprint = {
    role: 'searchbox',
    tagName: 'input',
    inputType: 'search',
    normalizedLabelCandidate: 'search',
    relativeBbox: { xPercent: 10, yPercent: 4, widthPercent: 40, heightPercent: 6 },
    digest: 'fp-search-continue',
  };

  function liveSearchScene(opts: {
    url?: string;
    submit?: 'unique' | 'none' | 'ambiguous' | 'replaced';
  }): RawScene {
    const base = searchScene(opts.url);
    const field = base.elements.find((el) => el.role === 'searchbox');
    const elements: RawScene['elements'] = field
      ? [{ ...field, fingerprint: fieldFp }]
      : [];
    if (opts.submit === 'unique') {
      const btn = base.elements.find((el) => el.role === 'button');
      if (btn) elements.push(btn);
    }
    if (opts.submit === 'replaced') {
      elements.push({
        id: createElementId('e9'),
        tagName: 'button',
        role: 'button',
        ariaLabel: 'Search',
        innerTextCandidate: 'Search',
        inputType: 'button',
        isEnabled: true,
        bbox: { x: 250, y: 0, width: 48, height: 32 },
      });
    }
    if (opts.submit === 'ambiguous') {
      elements.push(
        {
          id: createElementId('e2'),
          tagName: 'button',
          role: 'button',
          ariaLabel: 'Search',
          innerTextCandidate: 'Search',
          inputType: 'button',
          isEnabled: true,
          bbox: { x: 250, y: 0, width: 48, height: 32 },
        },
        {
          id: createElementId('e3'),
          tagName: 'button',
          role: 'button',
          ariaLabel: 'Search',
          innerTextCandidate: 'Search',
          inputType: 'button',
          isEnabled: true,
          bbox: { x: 310, y: 0, width: 48, height: 32 },
        }
      );
    }
    return { ...base, elements };
  }

  function continuePorts(opts: { navigateOnClick?: boolean }): {
    ports: PagePorts;
    counts: { typeText: number; click: number };
    gate: { submit: 'unique' | 'none' | 'ambiguous' | 'replaced' };
  } {
    const counts = { typeText: 0, click: 0 };
    const gate: { submit: 'unique' | 'none' | 'ambiguous' | 'replaced' } = { submit: 'none' };
    let typed = false;
    let submitted = false;
    const ports: PagePorts = {
      async send<T>(tabId: number, message: ExtensionMessage) {
        if (tabId !== 7) return { ok: false, lastError: 'wrong tab' };
        if (message.type === 'PING') return { ok: true, data: hello() as T };
        if (message.type === 'OBSERVE_REQUEST') {
          const url =
            opts.navigateOnClick && submitted
              ? 'https://lab.example/results?q=OpenAI'
              : 'https://lab.example/form';
          return { ok: true, data: liveSearchScene({ url, submit: gate.submit }) as T };
        }
        if (message.type === 'PROBE_FIELD_REQUEST') {
          return { ok: true, data: { success: true, fieldState: typed ? 'MATCHED' : 'EMPTY' } as T };
        }
        if (message.type === 'EXECUTE_ACTION_REQUEST') {
          if (message.action.proposal.type === 'TYPE_TEXT') {
            counts.typeText += 1;
            typed = true;
            return { ok: true, data: { success: true, fieldState: 'MATCHED' } as T };
          }
          if (message.action.proposal.type === 'CLICK') {
            counts.click += 1;
            submitted = true;
            return { ok: true, data: { success: true } as T };
          }
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
    return { ports, counts, gate };
  }

  it('A: Continue after ASK_USER starts a fresh loop, not confirmation', async () => {
    const { ports, counts } = continuePorts({});
    const controller = new TrustLoopController({
      ports,
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    await controller.start('Search for OpenAI in YouTube search bar');
    expect(controller.getState().phase).toBe('ASK_USER');
    expect(controller.getState().running).toBe(false);
    expect(controller.getState().confirmation).toBeUndefined();
    expect(controller.getState().askUser?.continueLabel).toBe('Continue');
    expect(controller.getState().askUser?.continueLabel).not.toMatch(/allow once/i);

    await controller.start('Search for OpenAI in YouTube search bar');
    expect(controller.getState().running).toBe(false);
    expect(controller.getState().confirmation).toBeUndefined();
    expect(counts.typeText).toBe(1);
    expect(controller.getState().phase).toBe('ASK_USER');
  });

  it('B/C: Continue does not retype MATCHED text and still attempts remaining search-submit', async () => {
    const { ports, counts, gate } = continuePorts({ navigateOnClick: false });
    const controller = new TrustLoopController({
      ports,
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    await controller.start('Search for OpenAI');
    expect(counts.typeText).toBe(1);
    expect(counts.click).toBe(0);
    expect(controller.getState().phase).toBe('ASK_USER');

    gate.submit = 'unique';
    await controller.start('Search for OpenAI');
    expect(counts.typeText).toBe(1);
    expect(counts.click).toBe(1);
    expect(controller.getState().phase).toBe('ASK_USER');
    expect(controller.getState().headline).not.toBe('Completed');
  });

  it('D: Continue re-grounds a replaced submit control instead of a stale pre-ASK_USER target', async () => {
    const { ports, counts, gate } = continuePorts({ navigateOnClick: true });
    const controller = new TrustLoopController({
      ports,
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    await controller.start('Search for OpenAI');
    expect(counts.click).toBe(0);

    gate.submit = 'replaced';
    await controller.start('Search for OpenAI');
    expect(counts.typeText).toBe(1);
    expect(counts.click).toBe(1);
    expect(controller.getState().phase).toBe('COMPLETED');
  });

  it('E: Continue with ambiguous submit stays ASK_USER', async () => {
    const { ports, counts, gate } = continuePorts({});
    const controller = new TrustLoopController({
      ports,
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    await controller.start('Search for OpenAI');
    gate.submit = 'ambiguous';
    await controller.start('Search for OpenAI');
    expect(counts.typeText).toBe(1);
    expect(counts.click).toBe(0);
    expect(controller.getState().phase).toBe('ASK_USER');
    expect(controller.getState().headline).not.toBe('Completed');
  });

  it('F: Continue may complete after unique submit + verified navigation', async () => {
    const { ports, counts, gate } = continuePorts({ navigateOnClick: true });
    const controller = new TrustLoopController({
      ports,
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    await controller.start('Search for OpenAI in YouTube search bar');
    expect(controller.getState().phase).toBe('ASK_USER');
    gate.submit = 'unique';
    await controller.start('Search for OpenAI in YouTube search bar');
    expect(counts.typeText).toBe(1);
    expect(counts.click).toBe(1);
    expect(controller.getState().phase).toBe('COMPLETED');
    expect(controller.getState().message).toMatch(/Typed text and search action were verified locally/);
  });
});
