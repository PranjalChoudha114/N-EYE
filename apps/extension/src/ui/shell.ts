/**
 * Product shell DOM.
 * OWNS: Semantic structure for the Side Panel Trust Center. Overlay uses overlay-card.ts.
 */

import { brandUrl } from './brand.js';
import { iconChevron, iconMoon } from './icons.js';
import { pipelineRailLabel, pipelineStageHelp } from './pipeline-copy.js';

export interface ProductEls {
  root: HTMLElement;
  toast: HTMLElement;
  mark: HTMLImageElement;
  trustState: HTMLElement;
  themeToggle: HTMLButtonElement;
  detailsBtn: HTMLButtonElement;
  siteHost: HTMLElement;
  headline: HTMLElement;
  message: HTMLElement;
  quickPrivacy: HTMLElement;
  goal: HTMLInputElement;
  run: HTMLButtonElement;
  cancel: HTMLButtonElement;
  extra: HTMLButtonElement;
  askHint: HTMLElement;
  receipt: HTMLElement;
  center: HTMLElement;
  tabs: HTMLElement;
  panelActivity: HTMLElement;
  panelPrivacy: HTMLElement;
  panelAction: HTMLElement;
  panelEvidence: HTMLElement;
  pipeline: HTMLElement;
  stepLine: HTMLElement;
  activityMeta: HTMLElement;
  privacyViz: HTMLElement;
  actionView: HTMLElement;
  evidenceView: HTMLElement;
  confirm: HTMLDialogElement;
  confirmWhat: HTMLElement;
  confirmTarget: HTMLElement;
  confirmWhy: HTMLElement;
  confirmLocal: HTMLElement;
  confirmData: HTMLElement;
  confirmCancel: HTMLButtonElement;
  confirmOk: HTMLButtonElement;
  modeMock: HTMLButtonElement;
  modeRemote: HTMLButtonElement;
  gateway: HTMLElement;
  identity: HTMLElement;
  unsupported: HTMLElement;
  viewHint: HTMLElement;
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | boolean | undefined> = {},
  children: Array<Node | string> = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (value === true) {
      node.setAttribute(key, '');
      continue;
    }
    if (key === 'class') {
      node.className = value;
      continue;
    }
    node.setAttribute(key, value);
  }
  for (const child of children) {
    node.append(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function mountProductShell(doc: Document): ProductEls {
  const toast = h('div', { id: 'n-toast', class: 'n-toast', role: 'status', 'aria-live': 'polite' });
  const mark = h('img', {
    id: 'n-mark',
    class: 'n-mark',
    alt: 'N-Eye',
    src: brandUrl('mark'),
    width: '28',
    height: '14',
  });
  const trustState = h('p', { id: 'n-trust-state', class: 'n-kicker' }, ['Ready']);
  const themeToggle = h('button', {
    id: 'n-theme',
    class: 'n-icon-btn',
    type: 'button',
    'aria-label': 'Theme: Dark. Click for light.',
  });
  themeToggle.append(iconMoon());
  const detailsLabel = h('span', { id: 'n-details-label' }, ['Details']);
  const detailsBtn = h('button', { id: 'n-details', class: 'n-text-btn', type: 'button', 'aria-expanded': 'false' });
  detailsBtn.append(detailsLabel, iconChevron());

  const siteHost = h('p', { id: 'n-site', class: 'n-site' }, ['Connecting…']);
  const headline = h('h2', { id: 'n-headline', class: 'n-headline' }, ['Ready']);
  const message = h('p', { id: 'n-message', class: 'n-message', 'aria-live': 'polite' }, [
    'Looking at this page on your device. No AI request has been sent.',
  ]);
  const quickPrivacy = h('ul', { id: 'n-quick-privacy', class: 'n-facts hidden' });
  const goal = h('input', {
    id: 'n-goal',
    class: 'n-input',
    type: 'text',
    'aria-label': 'Task goal',
    placeholder: 'Describe what N-Eye should do',
    value: 'Enter my email and continue',
  });
  const run = h('button', { id: 'n-run', class: 'n-btn n-btn-primary', type: 'button' }, ['Run']);
  const cancel = h('button', { id: 'n-cancel', class: 'n-btn n-btn-danger hidden', type: 'button' }, ['Cancel']);
  const extra = h('button', { id: 'n-extra', class: 'n-btn n-btn-quiet hidden', type: 'button' }, ['View result']);
  const askHint = h('p', { id: 'n-ask-hint', class: 'n-caption hidden' });
  const receipt = h('section', { id: 'n-receipt', class: 'n-receipt hidden', 'aria-label': 'Privacy Receipt' });

  const pipeline = h('ol', { id: 'n-pipeline', class: 'n-rail', 'aria-label': 'Trust loop' });
  const stages = ['SEE', 'PERCEIVE', 'PROTECT', 'THINK', 'VALIDATE', 'ACT', 'VERIFY'] as const;
  for (const stage of stages) {
    pipeline.append(
      h('li', { class: 'n-rail-step is-pending', 'data-stage': stage }, [
        h('span', { class: 'n-rail-dot' }),
        h('span', { class: 'n-rail-name', title: `${stage} · ${pipelineStageHelp(stage)}` }, [
          pipelineRailLabel(stage),
        ]),
      ])
    );
  }
  const stepLine = h('p', { id: 'n-step', class: 'n-caption hidden' });
  const activityMeta = h('div', { id: 'n-activity-meta', class: 'n-evidence' });
  const panelActivity = h('section', { id: 'n-panel-activity', class: 'n-panel', role: 'tabpanel' }, [
    pipeline,
    stepLine,
    activityMeta,
  ]);
  const privacyViz = h('div', { id: 'n-privacy-viz', class: 'n-boundary' });
  const panelPrivacy = h('section', { id: 'n-panel-privacy', class: 'n-panel hidden', role: 'tabpanel' }, [privacyViz]);
  const actionView = h('div', { id: 'n-action-view' });
  const panelAction = h('section', { id: 'n-panel-action', class: 'n-panel hidden', role: 'tabpanel' }, [actionView]);
  const evidenceView = h('div', { id: 'n-evidence-view', class: 'n-evidence' });
  const panelEvidence = h('section', { id: 'n-panel-evidence', class: 'n-panel hidden', role: 'tabpanel' }, [
    evidenceView,
  ]);

  const tabs = h('div', { class: 'n-tabs', role: 'tablist', 'aria-label': 'Trust Center' }, [
    h('button', { class: 'n-tab is-active', type: 'button', role: 'tab', 'aria-selected': 'true', 'data-tab': 'activity' }, [
      'Activity',
    ]),
    h('button', { class: 'n-tab', type: 'button', role: 'tab', 'aria-selected': 'false', 'data-tab': 'privacy' }, [
      'Privacy',
    ]),
    h('button', { class: 'n-tab', type: 'button', role: 'tab', 'aria-selected': 'false', 'data-tab': 'action' }, [
      'Action',
    ]),
    h('button', { class: 'n-tab', type: 'button', role: 'tab', 'aria-selected': 'false', 'data-tab': 'evidence' }, [
      'Evidence',
    ]),
  ]);

  const center = h('section', { id: 'n-center', class: 'n-center' }, [
    tabs,
    panelActivity,
    panelPrivacy,
    panelAction,
    panelEvidence,
  ]);

  const confirmWhat = h('p', { id: 'n-confirm-what' });
  const confirmTarget = h('p', { id: 'n-confirm-target' });
  const confirmWhy = h('p', { id: 'n-confirm-why' });
  const confirmLocal = h('p', { id: 'n-confirm-local' });
  const confirmData = h('p', { id: 'n-confirm-data' });
  const confirmCancel = h('button', { id: 'n-confirm-cancel', class: 'n-btn n-btn-quiet', type: 'button' }, [
    "Don't allow",
  ]);
  const confirmOk = h('button', { id: 'n-confirm-ok', class: 'n-btn n-btn-danger', type: 'button' }, ['Allow once']);
  const confirm = h('dialog', { id: 'n-confirm', class: 'n-dialog' }, [
    h('div', { class: 'n-modal' }, [
      h('h3', {}, ['N-Eye needs your approval']),
      confirmWhat,
      confirmTarget,
      confirmWhy,
      confirmLocal,
      confirmData,
      h('div', { class: 'n-modal-actions' }, [confirmCancel, confirmOk]),
    ]),
  ]);

  const modeMock = h('button', { id: 'n-mode-mock', class: 'n-chip is-active', type: 'button' }, ['Mock']);
  const modeRemote = h('button', { id: 'n-mode-remote', class: 'n-chip', type: 'button' }, ['Remote']);
  const gateway = h('p', { id: 'n-gateway', class: 'n-caption' }, ['Planning locally (no cloud AI)']);
  const identity = h('span', { id: 'build-identity', class: 'n-identity' }, ['DEV • …']);
  const unsupported = h('p', { id: 'n-unsupported', class: 'n-alert hidden', role: 'alert' });
  const viewHint = h('p', { id: 'n-view-hint', class: 'n-caption hidden' }, [
    'This panel is the N-Eye Trust Center.',
  ]);

  const root = h('div', { class: 'n-app' }, [
    toast,
    h('header', { class: 'n-header' }, [
      h('div', { class: 'n-brand' }, [
        mark,
        h('div', {}, [h('h1', { class: 'n-name' }, ['N-Eye']), trustState]),
      ]),
      h('div', { class: 'n-header-actions' }, [themeToggle, detailsBtn]),
    ]),
    unsupported,
    viewHint,
    h('section', { class: 'n-card n-site-card' }, [siteHost]),
    h('section', { class: 'n-card n-status-card' }, [headline, message, quickPrivacy]),
    receipt,
    h('section', { class: 'n-card n-task' }, [
      goal,
      askHint,
      h('div', { class: 'n-actions' }, [run, cancel, extra]),
    ]),
    center,
    h('footer', { class: 'n-footer' }, [
      h('div', { class: 'n-mode', role: 'group', 'aria-label': 'Planner mode' }, [modeMock, modeRemote]),
      gateway,
      identity,
    ]),
    confirm,
  ]);

  doc.body.replaceChildren(root);
  return {
    root,
    toast,
    mark,
    trustState,
    themeToggle,
    detailsBtn,
    siteHost,
    headline,
    message,
    quickPrivacy,
    goal,
    run,
    cancel,
    extra,
    askHint,
    receipt,
    center,
    tabs,
    panelActivity,
    panelPrivacy,
    panelAction,
    panelEvidence,
    pipeline,
    stepLine,
    activityMeta,
    privacyViz,
    actionView,
    evidenceView,
    confirm,
    confirmWhat,
    confirmTarget,
    confirmWhy,
    confirmLocal,
    confirmData,
    confirmCancel,
    confirmOk,
    modeMock,
    modeRemote,
    gateway,
    identity,
    unsupported,
    viewHint,
  };
}
