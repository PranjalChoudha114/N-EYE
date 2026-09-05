/**
 * Missing target is a normal condition, not an engine crash.
 */
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
import { createIdleState, mergeActionView } from '../runtime/ui-snapshot.js';
import { bindProductUi } from '../ui/render.js';
import { mountProductShell } from '../ui/shell.js';
import { isEngineExceptionText, MISSING_TARGET_HUMAN } from '../ui/human-copy.js';
import { statusCopy } from '../ui/status-map.js';
import { classifyAskUser } from '../ui/ask-user.js';
import { validateActionProposal, ActionValidationError } from '../authority/validator.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { createActionId, createTaskId } from '@n-eye/protocol';
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
        ariaLabel: 'Continue',
        innerTextCandidate: 'Continue',
        inputType: 'button',
        isEnabled: true,
        bbox: { x: 0, y: 0, width: 80, height: 24 },
      },
    ],
    privacyFindings: [],
  };
}

function mockPorts(): PagePorts {
  return {
    async send<T>(tabId: number, message: ExtensionMessage) {
      if (tabId !== 7) return { ok: false, lastError: 'wrong tab' };
      if (message.type === 'PING') return { ok: true, data: hello() as T };
      if (message.type === 'OBSERVE_REQUEST') return { ok: true, data: scene() as T };
      if (message.type === 'EXECUTE_ACTION_REQUEST') {
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
}

const tab: TabInfo = {
  tabId: 7,
  url: 'https://lab.example/form',
  title: 'Lab',
  origin: 'https://lab.example',
  isSupported: true,
};

describe('Unresolved target is a typed failure', () => {
  it('human copy never shows targetCurrent TypeError text', () => {
    expect(isEngineExceptionText("Cannot read properties of undefined (reading 'targetCurrent')")).toBe(true);
    expect(statusCopy('ERROR', "Cannot read properties of undefined (reading 'targetCurrent')").message).toBe(
      'Something went wrong while checking this page. N-Eye stopped without changing anything.'
    );
    expect(classifyAskUser(`${MISSING_TARGET_HUMAN} TARGET_NOT_FOUND`)).toBe('TARGET_NOT_FOUND');
  });

  it('validator missing target is INVALID_TARGET, not an untyped throw', () => {
    try {
      validateActionProposal(
        {
          actionId: createActionId('a1'),
          type: 'CLICK',
          targetId: createElementId('e99'),
          reasoning: 'click missing',
          expectedOutcome: 'clicked',
          riskLevel: 'LOW',
        },
        scene(),
        new PrivateTokenVault(),
        createTaskId('t1'),
        'https://lab.example'
      );
      throw new Error('expected validation failure');
    } catch (err) {
      expect(err).toBeInstanceOf(ActionValidationError);
      expect((err as ActionValidationError).reasonCode).toBe('INVALID_TARGET');
      expect((err as Error).message).toMatch(/was not found/);
    }
  });

  it('render does not crash when action.validation is missing', () => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: (path: string) => `/${path}`,
        getManifest: () => ({ version_name: 'DEV • test' }),
      },
    });
    const els = mountProductShell(document);
    const ui = bindProductUi(els);
    const state = createIdleState();
    state.action = {
      proposalText: 'Click missing',
      targetLabel: '—',
      risk: 'LOW',
      reasoning: '',
    } as typeof state.action;
    expect(() => ui.update(state, { role: 'owner', themePref: 'dark' })).not.toThrow();
    expect(els.actionView.textContent).toMatch(/Target still current/);
  });

  it('mergeActionView never yields an action without validation', () => {
    const merged = mergeActionView(undefined, { blockedReason: 'failed' });
    expect(merged.validation.targetCurrent).toBeNull();
  });

  it('nonexistent labeled control ASK_USER without executing and produces a report', async () => {
    const controller = new TrustLoopController({
      ports: mockPorts(),
      planner: new PlannerManager(),
      ocr: new MockOcrEngine(),
    });
    controller.bindTab(tab);
    await controller.start('Click the Missing Widget that does not exist');
    const state = controller.getState();
    expect(state.phase).toBe('ASK_USER');
    expect(state.message.toLowerCase()).not.toMatch(/cannot read propert/);
    expect(state.message.toLowerCase()).not.toMatch(/targetcurrent/);
    expect(state.taskReport).toBeTruthy();
    expect(state.taskReport?.result).not.toBe('VERIFIED COMPLETE');
    expect(state.taskReport?.human.whatYouAsked).toMatch(/Missing Widget/i);
  });
});
