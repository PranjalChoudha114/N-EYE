/**
 * Event-contract tests for the compact overlay.
 * WHY: Programmatic node.click() on the More button never proved Chrome hit-testing.
 * Real Chrome mounts the More iframe (runtime.id) and paints CSS layers that jsdom skipped.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createIdleState, type ProductState } from '../runtime/ui-snapshot.js';
import { buildAskUserView } from '../ui/ask-user.js';
import { OVERLAY_CSS } from '../overlay/overlay-styles.js';
import {
  applyOverlayState,
  isOverlayOpen,
  mountOverlay,
  unmountOverlay,
} from '../overlay/overlay-host.js';

function stubChrome(withExtensionId: boolean): { sendMessage: ReturnType<typeof vi.fn> } {
  const sendMessage = vi.fn();
  vi.stubGlobal('chrome', {
    runtime: {
      ...(withExtensionId ? { id: 'n-eye-test' } : {}),
      sendMessage,
      getURL: (path: string) =>
        path.includes('open-panel') ? 'about:blank' : `chrome-extension://n-eye/${path}`,
    },
  });
  return { sendMessage };
}

function readyState(): ProductState {
  return {
    ...createIdleState(),
    phase: 'READY' as const,
    canRun: true,
    supported: true,
    contentScriptHealth: 'READY' as const,
    headline: 'Ready',
  };
}

describe('overlay CSS hit-test contract', () => {
  it('does not clip the card or scale controls on :active', () => {
    expect(OVERLAY_CSS).toMatch(/overflow:\s*visible/);
    expect(OVERLAY_CSS).not.toMatch(/\.nq-card[^{]*\{[^}]*overflow:\s*hidden/);
    expect(OVERLAY_CSS).toMatch(/pointer-events:\s*none\s*!important/);
    expect(OVERLAY_CSS).toMatch(/isolation:\s*isolate/);
    expect(OVERLAY_CSS).not.toMatch(/\.nq-btn:active[^{]*\{[^}]*transform:\s*scale/);
    expect(OVERLAY_CSS).not.toMatch(/\.nq-more:active[^{]*\{[^}]*transform:/);
    expect(OVERLAY_CSS).toMatch(/\.nq-more-frame\.is-ready\s*\{\s*pointer-events:\s*auto/);
  });
});

describe('overlay interaction dispatch', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    unmountOverlay();
  });

  it('types a goal and Run dispatches the exact task-start command', () => {
    const { sendMessage } = stubChrome(false);
    const handle = mountOverlay(document);
    applyOverlayState(readyState(), 'dark');
    expect(handle.els.run.disabled).toBe(false);
    const goal = 'Search for OpenAI in YouTube search bar';
    handle.els.goal.value = goal;
    handle.els.run.click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'N_EYE_UI_COMMAND', command: 'run', goal });
  });

  it('clicking a child node inside Run still starts the task', () => {
    const { sendMessage } = stubChrome(false);
    const handle = mountOverlay(document);
    applyOverlayState(readyState(), 'dark');
    const child = document.createElement('span');
    child.textContent = 'Run';
    handle.els.run.replaceChildren(child);
    child.click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'N_EYE_UI_COMMAND', command: 'run', goal: handle.els.goal.value });
  });

  it('idle overlay keeps Run disabled so a dead click cannot start a task', () => {
    const { sendMessage } = stubChrome(false);
    const handle = mountOverlay(document);
    expect(handle.els.run.disabled).toBe(true);
    handle.els.run.click();
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ command: 'run' }));
  });

  it('More / Details requests Side Panel open and unmounts the card', () => {
    const { sendMessage } = stubChrome(false);
    const handle = mountOverlay(document);
    applyOverlayState(readyState(), 'dark');
    handle.els.more.click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'N_EYE_UI_COMMAND', command: 'openPanel' });
    expect(isOverlayOpen()).toBe(false);
  });

  it('More iframe stays inside the More slot after load and does not steal Run', () => {
    const { sendMessage } = stubChrome(true);
    const handle = mountOverlay(document);
    applyOverlayState(readyState(), 'dark');
    const slot = handle.shadow.querySelector('.nq-more-slot');
    const iframe = handle.shadow.querySelector('.nq-more-frame');
    expect(slot).not.toBeNull();
    expect(iframe).not.toBeNull();
    expect(slot?.contains(iframe)).toBe(true);
    iframe?.dispatchEvent(new Event('load'));
    expect(iframe?.classList.contains('is-ready')).toBe(true);
    handle.els.goal.value = 'Enter my email and continue';
    handle.els.run.click();
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'N_EYE_UI_COMMAND',
      command: 'run',
      goal: 'Enter my email and continue',
    });
    expect(isOverlayOpen()).toBe(true);
  });

  it('Close, Mock, Remote, and theme still dispatch without starting a task', () => {
    const { sendMessage } = stubChrome(false);
    const handle = mountOverlay(document);
    applyOverlayState(readyState(), 'dark');
    handle.els.modeRemote.click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'N_EYE_UI_COMMAND', command: 'setMode', mode: 'REMOTE' });
    handle.els.modeMock.click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'N_EYE_UI_COMMAND', command: 'setMode', mode: 'MOCK' });
    handle.els.themeToggle.click();
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: 'setTheme' }));
    sendMessage.mockClear();
    handle.els.closeBtn.click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'N_EYE_UI_COMMAND', command: 'closeOverlay' });
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ command: 'run' }));
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ command: 'cancel' }));
    expect(isOverlayOpen()).toBe(false);
  });

  it('ASK_USER Continue/Cancel keep clarification semantics', () => {
    const { sendMessage } = stubChrome(false);
    const handle = mountOverlay(document);
    const ask = buildAskUserView('This goal is outside the Mock planner grammar.');
    applyOverlayState(
      {
        ...readyState(),
        phase: 'ASK_USER',
        headline: ask.headline,
        message: ask.message,
        askUser: ask,
        running: false,
        canRun: true,
      },
      'light'
    );
    expect(handle.els.run.textContent).toBe('Continue');
    expect(handle.els.confirmBox.classList.contains('nq-hidden')).toBe(true);
    handle.els.run.click();
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: 'run' }));
    handle.els.cancel.click();
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ command: 'cancel' }));
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ command: 'confirm' }));
  });

  it('confirmation Allow once / Don\'t allow echo the pending id', () => {
    const { sendMessage } = stubChrome(false);
    const handle = mountOverlay(document);
    applyOverlayState(
      {
        ...readyState(),
        phase: 'AWAITING_CONFIRMATION',
        confirmation: {
          confirmationId: 'cnf_hit_1',
          actionName: 'CLICK Delete account',
          targetLabel: 'Delete account',
          risk: 'HIGH',
          why: 'Destructive action',
          stayedLocal: ['Password'],
          dataUsed: [],
        },
      },
      'system'
    );
    handle.els.confirmCancel.click();
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'N_EYE_UI_COMMAND',
      command: 'confirm',
      approved: false,
      confirmationId: 'cnf_hit_1',
    });
    sendMessage.mockClear();
    handle.els.confirmOk.click();
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'N_EYE_UI_COMMAND',
      command: 'confirm',
      approved: true,
      confirmationId: 'cnf_hit_1',
    });
  });
});
