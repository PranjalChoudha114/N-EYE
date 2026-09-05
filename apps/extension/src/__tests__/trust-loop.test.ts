import { describe, expect, it, vi } from 'vitest';
import {
  CONTENT_SCRIPT_PROTOCOL,
  createElementId,
  createPageEpoch,
  type ContentScriptHello,
  type ExtensionMessage,
  type RawScene,
  type TabInfo,
} from '@n-eye/protocol';
import { PlannerManager } from '../planner/planner-manager.js';
import { MockOcrEngine } from '../perception/mock-engine.js';
import { TrustLoopController } from '../runtime/trust-loop.js';
import type { PagePorts } from '../runtime/page-ports.js';

function hello(): ContentScriptHello {
  return {
    pong: true,
    ready: true,
    contentProtocol: CONTENT_SCRIPT_PROTOCOL,
    url: 'https://lab.example/form',
    origin: 'https://lab.example',
    epoch: createPageEpoch(1),
    registeredElements: 1,
  };
}

function scene(): RawScene {
  return {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(2),
    url: 'https://lab.example/form',
    origin: 'https://lab.example',
    title: 'Lab',
    viewport: { width: 800, height: 600 },
    timestamp: Date.now(),
    elements: [
      {
        id: createElementId('e1'),
        tagName: 'BUTTON',
        role: 'button',
        ariaLabel: 'Done',
        innerTextCandidate: 'Done',
        inputType: 'button',
        isEnabled: true,
        bbox: { x: 0, y: 0, width: 80, height: 24 },
      },
    ],
    privacyFindings: [],
  };
}

function mockPorts(sceneFn: () => RawScene = scene): PagePorts {
  return {
    async send<T>(tabId: number, message: ExtensionMessage) {
      if (tabId !== 7) return { ok: false, lastError: 'wrong tab' };
      if (message.type === 'PING') return { ok: true, data: hello() as T };
      if (message.type === 'OBSERVE_REQUEST') return { ok: true, data: sceneFn() as T };
      if (message.type === 'EXECUTE_ACTION_REQUEST') {
        return { ok: true, data: { success: true, fieldState: 'MATCHED', scrollMoved: true, selectMatched: true } as T };
      }
      if (message.type === 'PROBE_FIELD_REQUEST') {
        return { ok: true, data: { success: false, fieldState: 'EMPTY' } as T };
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
}

const tab: TabInfo = {
  tabId: 7,
  url: 'https://lab.example/form',
  title: 'Lab',
  origin: 'https://lab.example',
  isSupported: true,
};

describe('TrustLoopController', () => {
  it('idle observe becomes READY and a mock loop can complete without secrets in state', async () => {
    const controller = new TrustLoopController({
      ports: mockPorts(),
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    await controller.idleObserve();
    expect(controller.getState().phase).toBe('READY');
    expect(controller.getState().canRun).toBe(true);

    await controller.start('Continue');
    const state = controller.getState();
    expect(state.running).toBe(false);
    expect(state.phase).toBe('ASK_USER');
    expect(state.headline).not.toMatch(/^Completed$/);
    expect(state.message).not.toMatch(/completed successfully/i);
    expect(JSON.stringify(state)).not.toContain('CANARY_PASSWORD');
    expect(state.evidence.screenshotOutBytes).toBe(0);
    expect(controller.getVaultSize()).toBeGreaterThanOrEqual(0);
  });

  it('treats ASK_USER as clarification: no confirmation, Cancel dismisses, Continue is a fresh start', async () => {
    const controller = new TrustLoopController({
      ports: mockPorts(),
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    await controller.idleObserve();
    await controller.start('Open UPESSEM1 Repositories');
    const asked = controller.getState();
    expect(asked.phase).toBe('ASK_USER');
    expect(asked.confirmation).toBeUndefined();
    expect(asked.askUser?.continueLabel).toBe('Continue');
    expect(asked.askUser?.dismissLabel).toBe('Cancel');
    expect(asked.askUser?.reason).toBe('NO_SUPPORTED_ACTION');
    expect(asked.running).toBe(false);
    expect(asked.canRun).toBe(true);
    expect(asked.message).not.toMatch(/Mock planner grammar/i);
    expect(asked.headline).toBe('I need your help');

    controller.cancel();
    const dismissed = controller.getState();
    expect(dismissed.phase).toBe('READY');
    expect(dismissed.askUser).toBeNull();
    expect(dismissed.confirmation).toBeUndefined();
    expect(dismissed.canRun).toBe(true);

    await controller.start('Open UPESSEM1 Repositories');
    expect(controller.getState().phase).toBe('ASK_USER');
    expect(controller.getState().confirmation).toBeUndefined();
  });

  it('high-risk confirmation can be cancelled without executing', async () => {
    const submitScene = (): RawScene => ({
      ...scene(),
      elements: [
        {
          id: createElementId('e1'),
          tagName: 'BUTTON',
          role: 'button',
          ariaLabel: 'Submit Application',
          innerTextCandidate: 'Submit Application',
          inputType: 'submit',
          isEnabled: true,
          bbox: { x: 0, y: 0, width: 80, height: 24 },
        },
      ],
    });
    const ports: PagePorts = {
      async send<T>(tabId: number, message: ExtensionMessage) {
        if (tabId !== 7) return { ok: false, lastError: 'wrong tab' };
        if (message.type === 'PING') return { ok: true, data: hello() as T };
        if (message.type === 'OBSERVE_REQUEST') return { ok: true, data: submitScene() as T };
        if (message.type === 'EXECUTE_ACTION_REQUEST') {
          return { ok: false, lastError: 'should not execute' };
        }
        if (message.type === 'PROBE_FIELD_REQUEST') {
          return { ok: true, data: { success: false, fieldState: 'EMPTY' } as T };
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
    for (let i = 0; i < 80 && controller.getState().phase !== 'AWAITING_CONFIRMATION'; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(controller.getState().phase).toBe('AWAITING_CONFIRMATION');
    controller.confirm(false);
    await done;
    expect(controller.getState().phase).toBe('CANCELLED');
    expect(controller.getState().running).toBe(false);
  });

  it('tab switch to another tab clears live evidence even on the same host', async () => {
    const controller = new TrustLoopController({
      ports: mockPorts(),
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    await controller.start('Continue');
    controller.bindTab({
      ...tab,
      tabId: 8,
      url: 'https://lab.example/other',
      origin: 'https://lab.example',
    });
    expect(controller.getState().privacySummary).toBeNull();
    expect(controller.getState().receipt).toBeUndefined();
    expect(controller.getState().tabId).toBe(8);
  });

  it('hydrates a closed-window snapshot without inventing an in-flight task', async () => {
    const controller = new TrustLoopController({
      ports: mockPorts(),
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    await controller.start('Continue');
    const finished = controller.getState();
    const restored = new TrustLoopController({
      ports: mockPorts(),
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    restored.hydrate({ ...finished, url: 'https://lab.example/form?session=abc' });
    restored.bindTab(tab);
    await restored.idleObserve();
    expect(restored.getState().running).toBe(false);
    expect(restored.getState().phase).not.toBe('PLANNING');
    expect(restored.getState().phase).not.toBe('AWAITING_CONFIRMATION');
    if (finished.receipt) {
      expect(restored.getState().receipt?.receiptId).toBe(finished.receipt.receiptId);
    }
  });

  it('treats a running snapshot as interrupted on hydrate', () => {
    const controller = new TrustLoopController({
      ports: mockPorts(),
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    const idle = controller.getState();
    controller.hydrate({ ...idle, running: true, phase: 'PLANNING', canCancel: true });
    expect(controller.getState().running).toBe(false);
    expect(controller.getState().phase).toBe('CANCELLED');
  });

  it('does not declare Completed when Mock cannot type and VALIDATE/ACT/VERIFY never ran', async () => {
    const controller = new TrustLoopController({
      ports: mockPorts(),
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    await controller.start('Type OpenAI in the YouTube search box');
    const state = controller.getState();
    expect(state.phase).toBe('ASK_USER');
    expect(state.headline).not.toBe('Completed');
    expect(state.step?.summary).not.toMatch(/completed successfully/i);
    expect(state.pipeline.VALIDATE).not.toBe('done');
    expect(state.pipeline.ACT).not.toBe('done');
    expect(state.evidence.screenshotOutBytes).toBe(0);
  });

  it('completes a type-only goal only after MATCHED local evidence', async () => {
    const searchScene = (): RawScene => ({
      ...scene(),
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
      ],
    });
    const ports: PagePorts = {
      async send<T>(tabId: number, message: ExtensionMessage) {
        if (tabId !== 7) return { ok: false, lastError: 'wrong tab' };
        if (message.type === 'PING') return { ok: true, data: hello() as T };
        if (message.type === 'OBSERVE_REQUEST') return { ok: true, data: searchScene() as T };
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
    await controller.start('Type OpenAI in the search box');
    const state = controller.getState();
    expect(state.phase).toBe('COMPLETED');
    expect(state.pipeline.VALIDATE).toBe('done');
    expect(state.pipeline.ACT).toBe('done');
    expect(state.pipeline.VERIFY).toBe('done');
    expect(state.message).not.toMatch(/All available goal actions completed/i);
  });

  it('does not treat Search for as complete after typing alone', async () => {
    const searchScene = (): RawScene => ({
      ...scene(),
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
      ],
    });
    const ports: PagePorts = {
      async send<T>(tabId: number, message: ExtensionMessage) {
        if (tabId !== 7) return { ok: false, lastError: 'wrong tab' };
        if (message.type === 'PING') return { ok: true, data: hello() as T };
        if (message.type === 'OBSERVE_REQUEST') return { ok: true, data: searchScene() as T };
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
    const done = controller.start('Search for OpenAI');
    for (let i = 0; i < 80; i += 1) {
      const phase = controller.getState().phase;
      if (phase === 'ASK_USER' || phase === 'AWAITING_CONFIRMATION' || phase === 'COMPLETED') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const state = controller.getState();
    expect(state.phase).not.toBe('COMPLETED');
    expect(state.headline).not.toBe('Completed');
    expect(['ASK_USER', 'AWAITING_CONFIRMATION']).toContain(state.phase);
    if (state.phase === 'AWAITING_CONFIRMATION') {
      controller.confirm(false, state.confirmation?.confirmationId);
      await done.catch(() => undefined);
    } else {
      await done;
    }
    expect(controller.getState().headline).not.toBe('Completed');
  });

  it('does not accept remote planner COMPLETE as product success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          actionProposal: {
            actionId: 'act_c',
            type: 'COMPLETE',
            reasoning: 'All available goal actions completed on current page state.',
            expectedOutcome: 'done',
            riskLevel: 'LOW',
          },
          metadata: { requestId: 'req_c', provider: 'gemini', model: 'gemini-2.5-flash', planningLatencyMs: 1 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const controller = new TrustLoopController({
      ports: mockPorts(),
      planner: new PlannerManager('REMOTE', 'http://localhost:8000'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    await controller.start('Type OpenAI in the YouTube search box');
    const state = controller.getState();
    expect(state.phase).toBe('ASK_USER');
    expect(state.headline).not.toBe('Completed');
    expect(state.evidence.screenshotOutBytes).toBe(0);
    vi.restoreAllMocks();
  });
});
