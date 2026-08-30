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
import { ConfirmationBroker } from '../authority/confirmation.js';

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

const tab: TabInfo = {
  tabId: 7,
  url: 'https://lab.example/form',
  title: 'Lab',
  origin: 'https://lab.example',
  isSupported: true,
};

describe('Cancellation and ephemeral authority', () => {
  it('cancel during a delayed observe does not execute later', async () => {
    let executeCalls = 0;
    const ports: PagePorts = {
      async send<T>(_tabId: number, message: ExtensionMessage) {
        if (message.type === 'PING') return { ok: true, data: hello() as T };
        if (message.type === 'OBSERVE_REQUEST') {
          await new Promise((r) => setTimeout(r, 30));
          return { ok: true, data: scene() as T };
        }
        if (message.type === 'EXECUTE_ACTION_REQUEST') {
          executeCalls += 1;
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
    });
    controller.bindTab(tab);
    const done = controller.start('Continue');
    await new Promise((r) => setTimeout(r, 5));
    controller.cancel();
    await done;
    expect(controller.getState().phase).toBe('CANCELLED');
    expect(executeCalls).toBe(0);
  });

  it('hydrate of a running snapshot cannot resurrect confirmation', () => {
    const controller = new TrustLoopController({
      ports: {
        async send() {
          return { ok: false, lastError: 'unused' };
        },
        async inject() {
          return false;
        },
        async captureRois() {
          return [];
        },
      },
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
    });
    controller.hydrate({
      ...controller.getState(),
      running: true,
      phase: 'AWAITING_CONFIRMATION',
      confirmation: {
        confirmationId: 'cnf_fake',
        actionName: 'Submit',
        targetLabel: 'Submit',
        risk: 'HIGH',
        why: 'no',
        stayedLocal: [],
        dataUsed: [],
      },
    });
    expect(controller.getState().confirmation).toBeUndefined();
    expect(controller.getState().phase).toBe('CANCELLED');
    expect(controller.getState().running).toBe(false);
  });

  it('ConfirmationBroker invalidate drops pending grants (SW restart analogue)', () => {
    const broker = new ConfirmationBroker();
    expect(broker.pendingRequest()).toBeNull();
    broker.invalidate();
    expect(broker.resolve('cnf_x', true).ok).toBe(false);
  });
});
