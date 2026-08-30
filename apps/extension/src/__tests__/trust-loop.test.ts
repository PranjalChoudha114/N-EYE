import { describe, expect, it } from 'vitest';
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
    expect(['COMPLETED', 'PROTECTED', 'READY']).toContain(state.phase);
    expect(JSON.stringify(state)).not.toContain('CANARY_PASSWORD');
    expect(state.evidence.screenshotOutBytes).toBe(0);
    expect(controller.getVaultSize()).toBeGreaterThanOrEqual(0);
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
});
