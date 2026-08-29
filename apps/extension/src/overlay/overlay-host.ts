/**
 * Page overlay host (Zone 1 view).
 * OWNS: Isolated Shadow DOM card over the current webpage.
 * TRUST: View/control only. Closing this host must not cancel the trust loop or vault.
 * MUST NEVER: Hold the token vault, run the planner, or put secrets in attributes.
 */

import { OVERLAY_CSS } from './overlay-styles.js';
import { mountOverlayCard, paintOverlayCard, type OverlayEls } from './overlay-card.js';
import { OVERLAY_HOST_ID } from '../runtime/ui-messages.js';
import type { NEyeUiCommand } from '../runtime/ui-messages.js';
import type { ProductState } from '../runtime/ui-snapshot.js';
import { createIdleState } from '../runtime/ui-snapshot.js';
import { nextThemePref, resolveTheme, type ThemePref } from '../ui/theme.js';

export interface OverlayHandle {
  host: HTMLElement;
  shadow: ShadowRoot;
  els: OverlayEls;
}

let handle: OverlayHandle | null = null;
let themePref: ThemePref = 'dark';
let lastState: ProductState = createIdleState();

function sendCommand(msg: NEyeUiCommand): void {
  try {
    void chrome.runtime.sendMessage(msg);
  } catch {
    // Service worker may be restarting.
  }
}

function bind(els: OverlayEls): void {
  els.closeBtn.addEventListener('click', () => {
    unmountOverlay();
    sendCommand({ type: 'N_EYE_UI_COMMAND', command: 'closeOverlay' });
  });
  els.themeToggle.addEventListener('click', () => {
    themePref = nextThemePref(themePref);
    paintOverlayCard(els, lastState, themePref, resolveTheme(themePref, systemIsLight()));
    sendCommand({ type: 'N_EYE_UI_COMMAND', command: 'setTheme', pref: themePref });
  });
  els.run.addEventListener('click', () => {
    sendCommand({ type: 'N_EYE_UI_COMMAND', command: 'run', goal: els.goal.value });
  });
  els.cancel.addEventListener('click', () => {
    sendCommand({ type: 'N_EYE_UI_COMMAND', command: 'cancel' });
  });
  els.more.addEventListener('click', () => {
    sendCommand({ type: 'N_EYE_UI_COMMAND', command: 'openPanel' });
    unmountOverlay();
  });
  els.extra.addEventListener('click', () => {
    sendCommand({ type: 'N_EYE_UI_COMMAND', command: 'openPanel' });
    unmountOverlay();
  });
  els.modeMock.addEventListener('click', () => {
    sendCommand({ type: 'N_EYE_UI_COMMAND', command: 'setMode', mode: 'MOCK' });
  });
  els.modeRemote.addEventListener('click', () => {
    sendCommand({ type: 'N_EYE_UI_COMMAND', command: 'setMode', mode: 'REMOTE' });
  });
  // TRUST: the overlay echoes the pending confirmationId it was given. It cannot invent one,
  // and the owner refuses any id that is not the currently pending capability.
  els.confirmOk.addEventListener('click', () => {
    const confirmationId = lastState.confirmation?.confirmationId;
    if (!confirmationId) return;
    sendCommand({ type: 'N_EYE_UI_COMMAND', command: 'confirm', approved: true, confirmationId });
  });
  els.confirmCancel.addEventListener('click', () => {
    const confirmationId = lastState.confirmation?.confirmationId;
    if (!confirmationId) return;
    sendCommand({ type: 'N_EYE_UI_COMMAND', command: 'confirm', approved: false, confirmationId });
  });
  els.goal.addEventListener('change', () => {
    sendCommand({ type: 'N_EYE_UI_COMMAND', command: 'setGoal', goal: els.goal.value });
  });
}

function systemIsLight(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

export function isOverlayOpen(): boolean {
  return handle !== null;
}

export function mountOverlay(doc: Document = document): OverlayHandle {
  if (handle) return handle;
  const existing = doc.getElementById(OVERLAY_HOST_ID);
  existing?.remove();
  lastState = {
    ...createIdleState(),
    siteHostname: doc.location?.hostname || lastState.siteHostname,
  };
  const host = doc.createElement('div');
  host.id = OVERLAY_HOST_ID;
  host.setAttribute('data-n-eye', 'overlay');
  const shadow = host.attachShadow({ mode: 'closed' });
  const style = doc.createElement('style');
  style.textContent = OVERLAY_CSS;
  shadow.append(style);
  const els = mountOverlayCard(shadow);
  bind(els);
  doc.documentElement.append(host);
  handle = { host, shadow, els };
  paintOverlayCard(els, lastState, themePref, resolveTheme(themePref, systemIsLight()));
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (!handle || themePref !== 'system') return;
      paintOverlayCard(handle.els, lastState, themePref, resolveTheme(themePref, systemIsLight()));
    });
  } catch {
    // matchMedia unavailable in some test documents.
  }
  return handle;
}

export function unmountOverlay(): void {
  handle?.host.remove();
  handle = null;
}

export function toggleOverlay(doc: Document = document): boolean {
  if (handle) {
    unmountOverlay();
    return false;
  }
  mountOverlay(doc);
  return true;
}

export function applyOverlayState(state: ProductState, pref: ThemePref): void {
  lastState = state;
  themePref = pref;
  if (!handle) return;
  paintOverlayCard(handle.els, state, pref, resolveTheme(pref, systemIsLight()));
}

export function overlayContainsRaw(secret: string): boolean {
  if (!handle) return false;
  return (handle.shadow.textContent || '').includes(secret);
}
