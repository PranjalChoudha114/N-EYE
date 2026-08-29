import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createIdleState } from '../runtime/ui-snapshot.js';
import { isNeyeOverlayMessage } from '../runtime/ui-messages.js';
import {
  applyOverlayState,
  isOverlayOpen,
  mountOverlay,
  overlayContainsRaw,
  toggleOverlay,
  unmountOverlay,
} from '../overlay/overlay-host.js';

function stubChrome(): { sendMessage: ReturnType<typeof vi.fn> } {
  const sendMessage = vi.fn();
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage,
      getURL: (path: string) => `chrome-extension://n-eye/${path}`,
    },
  });
  return { sendMessage };
}

describe('overlay host', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body></body>';
    unmountOverlay();
    stubChrome();
  });

  it('mounts a closed Shadow DOM overlay that page CSS cannot restyle', () => {
    const pageStyle = document.createElement('style');
    pageStyle.textContent = 'h1, h2, p { color: rgb(255, 0, 0) !important; }';
    document.head.append(pageStyle);
    const handle = mountOverlay(document);
    expect(handle.host.shadowRoot).toBeNull();
    expect(handle.shadow.querySelector('.nq-card')).not.toBeNull();
    expect(handle.shadow.querySelector('style')?.textContent).toContain('nq-card');
    const headline = handle.shadow.querySelector('.nq-headline');
    expect(headline?.textContent).toBe('Ready');
    expect(handle.host.id).toBe('n-eye-overlay-host');
  });

  it('toggles open and closed without leaving a host node', () => {
    expect(toggleOverlay(document)).toBe(true);
    expect(isOverlayOpen()).toBe(true);
    expect(toggleOverlay(document)).toBe(false);
    expect(isOverlayOpen()).toBe(false);
    expect(document.getElementById('n-eye-overlay-host')).toBeNull();
  });

  it('does not put raw secrets into overlay text', () => {
    mountOverlay(document);
    const state = createIdleState();
    applyOverlayState(
      { ...state, message: 'AI request protected. Sensitive values stayed local.', siteHostname: 'lab.example' },
      'dark'
    );
    expect(overlayContainsRaw('CANARY_PASSWORD_X')).toBe(false);
    expect(overlayContainsRaw('sk_live_secret')).toBe(false);
  });

  it('More sends openPanel and does not keep the overlay mounted', () => {
    const { sendMessage } = stubChrome();
    const handle = mountOverlay(document);
    handle.els.more.click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'N_EYE_UI_COMMAND', command: 'openPanel' });
    expect(isOverlayOpen()).toBe(false);
  });

  it('closing the overlay does not send cancel', () => {
    const { sendMessage } = stubChrome();
    const handle = mountOverlay(document);
    handle.els.closeBtn.click();
    expect(sendMessage).toHaveBeenCalledWith({ type: 'N_EYE_UI_COMMAND', command: 'closeOverlay' });
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ command: 'cancel' }));
    expect(isOverlayOpen()).toBe(false);
  });

  it('idle overlay facts omit filler zeros and raw secrets', () => {
    const handle = mountOverlay(document);
    expect(handle.shadow.querySelector('.nq-facts')?.classList.contains('nq-hidden')).toBe(true);
    expect(overlayContainsRaw('CANARY_PASSWORD_X')).toBe(false);
  });
});

describe('overlay messages', () => {
  it('accepts overlay commands and rejects protocol planner messages', () => {
    expect(isNeyeOverlayMessage({ type: 'N_EYE_TOGGLE_OVERLAY' })).toBe(true);
    expect(isNeyeOverlayMessage({ type: 'N_EYE_UNMOUNT_OVERLAY' })).toBe(true);
    expect(isNeyeOverlayMessage({ type: 'N_EYE_UI_COMMAND', command: 'run', goal: 'Continue' })).toBe(true);
    expect(isNeyeOverlayMessage({ type: 'OBSERVE_REQUEST' })).toBe(false);
  });

  it('uses an extension-page More catcher for Side Panel open', () => {
    const opener = readFileSync(resolve(__dirname, '../overlay/open-panel.js'), 'utf8');
    expect(opener).toMatch(/sidePanel\.open/);
    expect(opener).not.toMatch(/TrustLoopController/);
    expect(opener).not.toMatch(/realValue/);
  });
});
