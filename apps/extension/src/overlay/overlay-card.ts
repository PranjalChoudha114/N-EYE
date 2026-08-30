/**
 * Compact overlay card (view/control only).
 * OWNS: Compact DOM for the page overlay. Never holds the vault or trust loop.
 */

import type { ProductState } from '../runtime/ui-snapshot.js';
import { brandUrl } from '../ui/brand.js';
import { iconClose, iconMoon, iconSun, iconSystem, replaceIcon } from '../ui/icons.js';
import { setSafeText } from '../ui/safe-text.js';
import type { ThemePref } from '../ui/theme.js';
import { themeControlLabel } from '../ui/theme.js';

export interface OverlayEls {
  card: HTMLElement;
  mark: HTMLImageElement;
  trustState: HTMLElement;
  themeToggle: HTMLButtonElement;
  closeBtn: HTMLButtonElement;
  siteHost: HTMLElement;
  headline: HTMLElement;
  message: HTMLElement;
  facts: HTMLElement;
  unsupported: HTMLElement;
  goal: HTMLInputElement;
  run: HTMLButtonElement;
  cancel: HTMLButtonElement;
  extra: HTMLButtonElement;
  askHint: HTMLElement;
  confirmBox: HTMLElement;
  confirmAction: HTMLElement;
  confirmTarget: HTMLElement;
  confirmRisk: HTMLElement;
  confirmWhy: HTMLElement;
  confirmOk: HTMLButtonElement;
  confirmCancel: HTMLButtonElement;
  modeMock: HTMLButtonElement;
  modeRemote: HTMLButtonElement;
  more: HTMLButtonElement;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: Array<Node | string> = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) {
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function mountOverlayCard(root: ShadowRoot): OverlayEls {
  const mark = el('img', { class: 'nq-mark', alt: 'N-Eye', width: '32', height: '16' });
  mark.src = brandUrl('mark');
  const trustState = el('p', { class: 'nq-kicker' }, ['Ready']);
  const statusPill = el('div', { class: 'nq-status-pill' }, [
    el('span', { class: 'nq-status-dot', 'aria-hidden': 'true' }),
    trustState,
  ]);
  const themeToggle = el('button', { class: 'nq-icon', type: 'button', 'aria-label': 'Theme: Dark. Click for light.' });
  themeToggle.append(iconMoon());
  const closeBtn = el('button', { class: 'nq-icon', type: 'button', 'aria-label': 'Close N-Eye' });
  closeBtn.append(iconClose());
  const siteHost = el('p', { class: 'nq-site' }, ['Connecting…']);
  const headline = el('h2', { class: 'nq-headline' }, ['Ready']);
  const message = el('p', { class: 'nq-message' }, ['Looking at this page on your device. No AI request has been sent.']);
  const facts = el('ul', { class: 'nq-facts nq-hidden' });
  const unsupported = el('p', { class: 'nq-alert nq-hidden' });
  const goal = el('input', {
    class: 'nq-input',
    type: 'text',
    'aria-label': 'Task goal',
    placeholder: 'Describe what N-Eye should do',
  });
  const run = el('button', { class: 'nq-btn nq-btn-primary', type: 'button' }, ['Run']);
  const cancel = el('button', { class: 'nq-btn nq-btn-danger nq-hidden', type: 'button' }, ['Cancel']);
  const extra = el('button', { class: 'nq-btn nq-hidden', type: 'button' }, ['Review']);
  const askHint = el('p', { class: 'nq-hint nq-hidden' });
  const confirmOk = el('button', { class: 'nq-btn nq-btn-danger', type: 'button' }, ['Allow once']);
  const confirmCancel = el('button', { class: 'nq-btn', type: 'button' }, ["Don't allow"]);
  // Truthful confirmation: the user must see the action, the target, and the local risk.
  // Cancel is first and nothing is preselected — no dark patterns, no auto-confirm timer.
  const confirmAction = el('p', { class: 'nq-message' }, ['N-Eye needs your approval for a high-risk action.']);
  const confirmTarget = el('p', { class: 'nq-confirm-line' });
  const confirmRisk = el('p', { class: 'nq-confirm-line' });
  const confirmWhy = el('p', { class: 'nq-confirm-line' });
  const confirmBox = el('div', { class: 'nq-confirm nq-hidden' }, [
    confirmAction,
    confirmTarget,
    confirmRisk,
    confirmWhy,
    el('div', { class: 'nq-row-btns' }, [confirmCancel, confirmOk]),
  ]);
  const modeMock = el('button', { class: 'nq-chip is-active', type: 'button' }, ['Mock']);
  const modeRemote = el('button', { class: 'nq-chip', type: 'button' }, ['Remote']);
  const more = el('button', { class: 'nq-more', type: 'button' }, ['More / Details →']);
  const moreSlot = el('div', { class: 'nq-more-slot' }, [more]);
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.id && chrome.runtime.getURL) {
      const iframe = el('iframe', {
        class: 'nq-more-frame',
        title: 'Open N-Eye Trust Center',
        src: chrome.runtime.getURL('overlay/open-panel.html'),
      });
      iframe.addEventListener('load', () => {
        iframe.classList.add('is-ready');
        more.tabIndex = -1;
      });
      moreSlot.append(iframe);
    }
  } catch {
    // Tests and missing runtime fall back to the in-shadow More button.
  }

  const card = el('article', { class: 'nq-card', 'data-theme': 'dark' }, [
    el('header', { class: 'nq-header' }, [
      el('div', { class: 'nq-brand' }, [
        mark,
        el('div', { class: 'nq-brand-text' }, [el('h1', { class: 'nq-name' }, ['N-Eye']), statusPill]),
      ]),
      el('div', { class: 'nq-actions-h' }, [themeToggle, closeBtn]),
    ]),
    unsupported,
    el('div', { class: 'nq-context' }, [siteHost, headline, message, facts]),
    el('div', { class: 'nq-task' }, [
      goal,
      askHint,
      el('div', { class: 'nq-row-btns' }, [run, cancel, extra]),
    ]),
    confirmBox,
    el('div', { class: 'nq-mode', role: 'group', 'aria-label': 'Planner mode' }, [modeMock, modeRemote]),
    moreSlot,
  ]);
  const wrap = el('div', { class: 'nq-wrap' }, [card]);
  root.append(wrap);
  return {
    card,
    mark,
    trustState,
    themeToggle,
    closeBtn,
    siteHost,
    headline,
    message,
    facts,
    unsupported,
    goal,
    run,
    cancel,
    extra,
    askHint,
    confirmBox,
    confirmAction,
    confirmTarget,
    confirmRisk,
    confirmWhy,
    confirmOk,
    confirmCancel,
    modeMock,
    modeRemote,
    more,
  };
}

export function paintOverlayCard(
  els: OverlayEls,
  state: ProductState,
  themePref: ThemePref,
  resolvedTheme: 'dark' | 'light'
): void {
  els.card.dataset['theme'] = resolvedTheme;
  els.card.dataset['tone'] = state.tone;
  // Presentation only: CSS reads phase/running for glow and the working sweep. Not a state machine.
  els.card.dataset['phase'] = state.phase;
  els.card.dataset['running'] = state.running ? '1' : '0';
  replaceIcon(els.themeToggle, themePref === 'light' ? iconSun() : themePref === 'system' ? iconSystem() : iconMoon());
  els.themeToggle.setAttribute('aria-label', themeControlLabel(themePref));
  setSafeText(els.trustState, state.headline);
  setSafeText(els.siteHost, state.siteHostname);
  setSafeText(els.headline, state.headline);
  setSafeText(els.message, state.message);
  els.unsupported.classList.toggle('nq-hidden', state.supported);
  setSafeText(els.unsupported, state.unsupportedReason || 'This page cannot be observed.');
  if (document.activeElement !== els.goal) els.goal.value = state.goal;
  const asking = state.phase === 'ASK_USER';
  els.goal.disabled = state.running;
  els.goal.placeholder = asking
    ? 'Rewrite your request, then continue'
    : 'Describe what N-Eye should do';
  els.run.classList.toggle('nq-hidden', state.running);
  els.cancel.classList.toggle('nq-hidden', !(state.running || asking));
  els.run.disabled = !state.canRun;
  setSafeText(els.run, asking ? state.askUser?.continueLabel || 'Continue' : 'Run');
  setSafeText(els.cancel, asking && !state.running ? state.askUser?.dismissLabel || 'Cancel' : 'Cancel');
  els.askHint.classList.toggle('nq-hidden', !asking);
  setSafeText(els.askHint, asking ? state.askUser?.hint || 'Rewrite your request below, then continue. This is not an approval.' : '');
  const extraLabel =
    state.phase === 'AWAITING_CONFIRMATION' ? 'Review' : state.receipt ? 'View result' : '';
  els.extra.classList.toggle(
    'nq-hidden',
    !extraLabel || state.running || state.phase === 'AWAITING_CONFIRMATION'
  );
  setSafeText(els.extra, extraLabel || 'View result');
  els.modeMock.classList.toggle('is-active', state.plannerMode === 'MOCK');
  els.modeRemote.classList.toggle('is-active', state.plannerMode === 'REMOTE');
  els.modeMock.disabled = state.running;
  els.modeRemote.disabled = state.running;
  // Only a real pending capability shows Confirm. An ASK_USER pause is not an approval request,
  // so it must never render a Confirm button the user could mistake for one.
  const confirmation = state.confirmation;
  els.confirmBox.classList.toggle('nq-hidden', !confirmation);
  if (confirmation) {
    setSafeText(els.confirmAction, `Action: ${confirmation.actionName}`);
    setSafeText(els.confirmTarget, `Target: ${confirmation.targetLabel}`);
    setSafeText(els.confirmRisk, `Risk: ${confirmation.risk} (classified on this device)`);
    setSafeText(els.confirmWhy, confirmation.why);
  }

  els.facts.replaceChildren();
  const facts: Array<[string, string]> = [];
  const summary = state.privacySummary;
  if (summary) {
    if (summary.sensitiveCount > 0) {
      facts.push(['Personal information', `${summary.sensitiveCount} found`]);
    }
    facts.push(['Screenshot', summary.screenshotBytes === 0 ? 'No screenshot was sent' : `${summary.screenshotBytes} B sent`]);
  }
  if (state.evidence.ocrInvoked) {
    facts.push(['On this device', 'Read visible text locally']);
  }
  if (state.lastRequestId) {
    facts.push(['AI connection', state.plannerMode === 'REMOTE' ? 'Remote' : 'Local']);
  }
  if (facts.length === 0) {
    els.facts.classList.add('nq-hidden');
  } else {
    els.facts.classList.remove('nq-hidden');
    for (const [label, value] of facts) {
      const shotZero = label === 'Screenshot' && value === 'No screenshot was sent';
      const row = el('li', { class: shotZero ? 'nq-row is-shot-zero' : 'nq-row' }, [
        el('span', {}, [label]),
        el('span', {}, [value]),
      ]);
      els.facts.append(row);
    }
  }
}
