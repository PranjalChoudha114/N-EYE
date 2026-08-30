/**
 * Controlled task-outcome bench using local completion truth (Mock planner).
 * ASK_USER is not success. Planner COMPLETE is not success.
 */

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
    registeredElements: 2,
  };
}

function searchScene(filled = false): RawScene {
  return {
    _isLocalOnly: true,
    pageEpoch: createPageEpoch(filled ? 3 : 2),
    url: 'https://lab.example/form',
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
        tagName: 'BUTTON',
        role: 'button',
        ariaLabel: 'Search',
        innerTextCandidate: 'Search',
        inputType: 'button',
        isEnabled: true,
        bbox: { x: 250, y: 0, width: 80, height: 32 },
      },
    ],
    privacyFindings: [],
  };
}

function mockPorts(sceneFn: () => RawScene): PagePorts {
  return {
    async send<T>(_tabId: number, message: ExtensionMessage) {
      if (message.type === 'PING') return { ok: true, data: hello() as T };
      if (message.type === 'OBSERVE_REQUEST') return { ok: true, data: sceneFn() as T };
      if (message.type === 'EXECUTE_ACTION_REQUEST') {
        return { ok: true, data: { success: true, fieldState: 'MATCHED', scrollMoved: true, selectMatched: true } as T };
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
}

const tab: TabInfo = {
  tabId: 7,
  url: 'https://lab.example/form',
  title: 'Lab',
  origin: 'https://lab.example',
  isSupported: true,
};

export interface TaskCase {
  id: string;
  goal: string;
  filledField?: boolean;
}

export async function runTaskBench(): Promise<{
  n: number;
  counts: Record<string, number>;
  rows: Array<{ id: string; goal: string; phase: string; verification: string }>;
}> {
  const cases: TaskCase[] = [
    { id: 'unknown-github-style', goal: 'Open UPESSEM1 Repositories' },
    { id: 'type-search-openai', goal: 'Type OpenAI in the search box', filledField: true },
    { id: 'search-for', goal: 'Search for OpenAI', filledField: true },
    { id: 'click-missing', goal: 'Click the missing unicorn' },
    { id: 'scroll', goal: 'Scroll down' },
    { id: 'continue-no-button', goal: 'Continue' },
  ];
  const counts: Record<string, number> = {};
  const rows: Array<{ id: string; goal: string; phase: string; verification: string }> = [];

  for (const item of cases) {
    let filled = false;
    const controller = new TrustLoopController({
      ports: mockPorts(() => searchScene(filled)),
      planner: new PlannerManager('MOCK'),
      ocr: new MockOcrEngine(),
      delayFn: async () => undefined,
    });
    controller.bindTab(tab);
    if (item.filledField) {
      filled = true;
    }
    await controller.start(item.goal);
    const state = controller.getState();
    const phase = state.phase;
    counts[phase] = (counts[phase] || 0) + 1;
    rows.push({
      id: item.id,
      goal: item.goal,
      phase,
      verification: state.evidence.verificationResult,
    });
  }

  return { n: cases.length, counts, rows };
}
