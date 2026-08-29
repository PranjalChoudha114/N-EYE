/**
 * Bind snapshot → DOM.
 * OWNS: Presentation only. Never runs the trust loop or writes secrets.
 */

import type { ProductState, PipelineId } from '../runtime/ui-snapshot.js';
import { applyBuildIdentityToDom } from '../dev/build-identity.js';
import { boundaryVisualization } from './privacy-summary.js';
import { setSafeText } from './safe-text.js';
import { iconMoon, iconSun, iconSystem, replaceIcon } from './icons.js';
import type { ProductEls } from './shell.js';
import { themeControlLabel, type ThemePref } from './theme.js';

export interface ProductUi {
  els: ProductEls;
  update(state: ProductState, extras?: { role?: 'owner' | 'view'; themePref?: ThemePref }): void;
  setDetailsOpen(open: boolean): void;
  detailsOpen(): boolean;
  setTab(tab: 'activity' | 'privacy' | 'action' | 'evidence'): void;
}

const PIPELINE_IDS: PipelineId[] = ['SEE', 'PERCEIVE', 'PROTECT', 'THINK', 'VALIDATE', 'ACT', 'VERIFY'];

function show(el: HTMLElement, visible: boolean): void {
  el.classList.toggle('hidden', !visible);
}

function row(label: string, value: string, extraClass?: string): HTMLElement {
  const item = document.createElement('div');
  item.className = extraClass ? `n-row ${extraClass}` : 'n-row';
  const k = document.createElement('span');
  k.className = 'n-row-k';
  k.textContent = label;
  const v = document.createElement('span');
  v.className = 'n-row-v';
  v.textContent = value;
  item.append(k, v);
  return item;
}

export function bindProductUi(els: ProductEls): ProductUi {
  let details = false;

  const tabButtons = Array.from(els.tabs.querySelectorAll<HTMLButtonElement>('[data-tab]'));
  const tabOrder = ['activity', 'privacy', 'action', 'evidence'] as const;
  let toastTimer = 0;

  const setTab = (tab: 'activity' | 'privacy' | 'action' | 'evidence'): void => {
    for (const btn of tabButtons) {
      const on = btn.dataset['tab'] === tab;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-selected', String(on));
    }
    show(els.panelActivity, tab === 'activity');
    show(els.panelPrivacy, tab === 'privacy');
    show(els.panelAction, tab === 'action');
    show(els.panelEvidence, tab === 'evidence');
  };

  const setDetailsOpen = (open: boolean): void => {
    details = open;
    show(els.center, open);
    els.detailsBtn.setAttribute('aria-expanded', String(open));
    const label = els.detailsBtn.querySelector('#n-details-label');
    if (label) label.textContent = open ? 'Less' : 'Details';
  };

  els.detailsBtn.addEventListener('click', () => {
    setDetailsOpen(!details);
  });

  for (const btn of tabButtons) {
    btn.addEventListener('click', () => {
      const tab = btn.dataset['tab'];
      if (tab === 'activity' || tab === 'privacy' || tab === 'action' || tab === 'evidence') {
        setTab(tab);
      }
    });
    btn.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
      event.preventDefault();
      const current = btn.dataset['tab'];
      const index = tabOrder.findIndex((id) => id === current);
      if (index < 0) return;
      const delta = event.key === 'ArrowRight' ? 1 : -1;
      const next = tabOrder[(index + delta + tabOrder.length) % tabOrder.length];
      if (!next) return;
      setTab(next);
      tabButtons.find((item) => item.dataset['tab'] === next)?.focus();
    });
  }

  applyBuildIdentityToDom();

  const update = (
    state: ProductState,
    extras?: { role?: 'owner' | 'view'; themePref?: ThemePref }
  ): void => {
    const role = extras?.role ?? 'owner';
    const pref = extras?.themePref ?? 'dark';
    replaceIcon(els.themeToggle, pref === 'light' ? iconSun() : pref === 'system' ? iconSystem() : iconMoon());
    els.themeToggle.setAttribute('aria-label', themeControlLabel(pref));

    setSafeText(els.trustState, state.headline);
    setSafeText(els.siteHost, state.siteHostname);
    setSafeText(els.headline, state.headline);
    setSafeText(els.message, state.message);
    els.root.dataset['tone'] = state.tone;
    els.root.dataset['phase'] = state.phase;

    show(els.unsupported, !state.supported);
    setSafeText(els.unsupported, state.unsupportedReason || 'This page cannot be observed.');
    show(els.viewHint, role === 'view');

    const facts = state.privacySummary;
    show(els.quickPrivacy, Boolean(facts));
    els.quickPrivacy.replaceChildren();
    if (facts) {
      for (const name of facts.keptLocal) {
        els.quickPrivacy.append(row(name, 'Kept local'));
      }
      for (const token of facts.tokenized) {
        const chip = row(token.label, token.token, 'is-token');
        chip.classList.add('n-token-live');
        els.quickPrivacy.append(chip);
      }
      els.quickPrivacy.append(row('Screenshot', `${facts.screenshotBytes} B sent`));
    }

    if (document.activeElement !== els.goal) {
      els.goal.value = state.goal;
    }
    els.goal.disabled = role === 'view' || state.running;
    show(els.run, !state.running && role === 'owner');
    show(els.cancel, state.running && role === 'owner');
    els.run.disabled = !state.canRun || role === 'view';

    const extraLabel =
      state.phase === 'AWAITING_CONFIRMATION'
        ? 'Review'
        : state.receipt
          ? 'View result'
          : '';
    show(els.extra, Boolean(extraLabel) && !state.running);
    setSafeText(els.extra, extraLabel || 'View result');

    show(els.receipt, Boolean(state.receiptView));
    els.receipt.replaceChildren();
    if (state.receiptView) {
      const view = state.receiptView;
      const title = document.createElement('h3');
      title.textContent = `${view.title} receipt`;
      const body = document.createElement('p');
      body.textContent = view.humanSummary;
      const meta = document.createElement('ul');
      meta.className = 'n-facts';
      meta.append(row('Sensitive values', String(view.sensitiveCount)));
      meta.append(row('Kept local', String(view.keptLocalCount)));
      meta.append(row('Tokenized', String(view.tokenizedCount)));
      meta.append(row('Screenshot', `${view.screenshotBytes < 0 ? 'unknown' : `${view.screenshotBytes} B`}`));
      meta.append(row('Provider / model', view.providerLine));
      meta.append(row('Protected context', `${view.protectedContextBytes} B`));
      els.receipt.append(title, body, meta);
    }

    if (state.toast) {
      els.toast.textContent = state.toast.message;
      els.toast.dataset['kind'] = state.toast.kind;
      els.toast.classList.remove('hidden', 'is-out');
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        els.toast.classList.add('is-out');
      }, 4200);
    } else {
      els.toast.classList.add('hidden');
    }

    for (const id of PIPELINE_IDS) {
      const item = els.pipeline.querySelector(`[data-stage="${id}"]`);
      if (!item) continue;
      const visual = state.pipeline[id];
      item.className = `n-rail-step is-${visual}`;
    }
    show(els.stepLine, Boolean(state.step));
    if (state.step) {
      setSafeText(els.stepLine, `Step ${state.step.index} of ${state.step.max} · ${state.step.summary}`);
    }
    els.activityMeta.replaceChildren();
    els.activityMeta.append(row('Overall', state.headline));
    els.activityMeta.append(row('Site', state.siteHostname));
    els.activityMeta.append(row('Planner mode', state.plannerMode));
    els.activityMeta.append(row('Content script', state.contentScriptHealth));
    els.activityMeta.append(row('Task', state.goal || '—'));
    for (const id of PIPELINE_IDS) {
      const visual = state.pipeline[id];
      const timing =
        id === 'SEE'
          ? state.latency.see
          : id === 'PERCEIVE'
            ? state.latency.perceive
            : id === 'PROTECT'
              ? state.latency.protect
              : id === 'THINK'
                ? state.latency.plan
                : id === 'VALIDATE'
                  ? state.latency.validate
                  : id === 'ACT'
                    ? state.latency.act
                    : state.latency.verify;
      const reason = id === 'PERCEIVE' ? state.perceiveLabel : visual;
      els.activityMeta.append(row(id, `${visual} · ${reason} · ${timing}`));
    }
    els.activityMeta.append(row('TOTAL', state.latency.total));

    els.privacyViz.replaceChildren();
    if (facts) {
      const boundary = boundaryVisualization(facts);
      const col = (title: string, items: string[], live?: boolean): HTMLElement => {
        const wrap = document.createElement('div');
        wrap.className = live ? 'n-bound-col is-live' : 'n-bound-col';
        const h = document.createElement('h4');
        h.textContent = title;
        wrap.append(h);
        for (const item of items) {
          const p = document.createElement('p');
          p.textContent = item;
          if (item.includes('→')) p.className = 'n-token-live';
          wrap.append(p);
        }
        return wrap;
      };
      els.privacyViz.append(
        col('Your browser', boundary.browser),
        col('N-Eye local protection', boundary.local, true),
        col('Privacy boundary', ['Only SafeContext may cross']),
        col('AI', boundary.cloud)
      );
    } else {
      const empty = document.createElement('p');
      empty.className = 'n-caption';
      empty.textContent = 'No N-Eye privacy transformation has occurred for this task.';
      els.privacyViz.append(empty);
    }
    if (state.receipt) {
      const rec = state.receipt;
      els.privacyViz.append(row('Privacy Receipt', rec.receiptId));
      els.privacyViz.append(row('Event', rec.protectionEvent));
      els.privacyViz.append(row('Findings', String(rec.sensitiveClasses.length)));
      els.privacyViz.append(row('Categories', rec.sensitiveClasses.join(', ') || 'none'));
      els.privacyViz.append(
        row(
          'Policy',
          rec.transformations.map((item) => `${item.privacyClass}:${item.action}`).join(', ') || 'none'
        )
      );
      els.privacyViz.append(row('SafeContext bytes', String(rec.safeContextBytes)));
      els.privacyViz.append(row('Screenshot outbound', rec.rawScreenshotSent ? 'YES' : '0 B'));
      els.privacyViz.append(row('Egress', rec.egressResult));
    }

    els.actionView.replaceChildren();
    if (state.action) {
      const a = state.action;
      els.actionView.append(row('AI proposes', a.proposalText));
      if (a.proposalType) els.actionView.append(row('Proposal', a.proposalType));
      els.actionView.append(row('Target', a.targetLabel));
      if (a.targetId) els.actionView.append(row('Target id', a.targetId));
      if (a.frame) els.actionView.append(row('Frame', a.frame));
      els.actionView.append(row('Risk', a.risk));
      if (a.confirmationRequired !== undefined) {
        els.actionView.append(row('Confirmation', a.confirmationRequired ? 'Required' : 'Not required'));
      }
      els.actionView.append(row('Target current', yn(a.validation.targetCurrent)));
      els.actionView.append(row('Frame current', yn(a.validation.frameCurrent)));
      els.actionView.append(row('Page current', yn(a.validation.pageCurrent)));
      els.actionView.append(row('Token scope', yn(a.validation.tokenScopeValid)));
      els.actionView.append(row('Risk policy', a.validation.riskPolicy || '—'));
      els.actionView.append(row('Semantic re-grounding', a.validation.targetCurrent === true ? 'Live target matched' : '—'));
      if (a.verification) els.actionView.append(row('Verification', a.verification));
      if (a.verificationDelta) els.actionView.append(row('Delta', a.verificationDelta));
      if (a.blockedReason) els.actionView.append(row('Blocked', a.blockedReason));
      if (a.reasoning) els.actionView.append(row('Planner note', a.reasoning));
    } else {
      const empty = document.createElement('p');
      empty.className = 'n-caption';
      empty.textContent = 'No action proposal yet.';
      els.actionView.append(empty);
    }

    const ev = state.evidence;
    els.evidenceView.replaceChildren();
    els.evidenceView.append(
      group('Session', [
        row('Content script', ev.contentScriptHealth),
        row('PageEpoch', String(ev.pageEpoch)),
        row('Frame', ev.frameNote),
        row('Observed controls', String(ev.observedControls)),
      ])
    );
    els.evidenceView.append(
      group('Planner', [
        row('Request ID', ev.requestId),
        row('Planner mode', ev.plannerMode),
        row('Provider', ev.provider),
        row('Model', ev.model),
        row('SafeContext bytes', String(ev.payloadBytes)),
        row('Egress', ev.egressResult),
        row('Planner latency', ev.plannerLatency),
      ])
    );
    els.evidenceView.append(
      group('Perception', [
        row('Screenshot outbound', `${ev.screenshotOutBytes} B`),
        row('Crop outbound', ev.cropOutbound),
        row('OCR invoked', ev.ocrInvoked ? 'YES' : 'NO'),
        row('OCR reason', ev.ocrReason),
        row('ROI count', String(ev.roiCount)),
        row('Perception source', ev.perceptionSource),
      ])
    );
    els.evidenceView.append(
      group('Authority', [
        row('Validation', ev.validationResult),
        row('Execution', ev.executionResult),
        row('Verification', ev.verificationResult),
        row('Vault tokens', String(ev.vaultTokenCount)),
        row('Privacy findings', String(ev.findingsCount)),
      ])
    );
    els.evidenceView.append(
      group('Timing', [
        row('SEE', state.latency.see),
        row('PERCEIVE', state.latency.perceive),
        row('PROTECT', state.latency.protect),
        row('PLAN', state.latency.plan),
        row('VALIDATE', state.latency.validate),
        row('ACT', state.latency.act),
        row('VERIFY', state.latency.verify),
        row('TOTAL', state.latency.total),
      ])
    );
    const jsonBlock = document.createElement('details');
    jsonBlock.className = 'n-accordion';
    const jsonSummary = document.createElement('summary');
    jsonSummary.textContent = 'SafeContext JSON';
    const code = document.createElement('pre');
    const dump = document.createElement('code');
    dump.textContent = ev.safeContextJson;
    code.append(dump);
    jsonBlock.append(jsonSummary, code);
    els.evidenceView.append(jsonBlock);

    if (state.receipt) {
      const recBlock = document.createElement('details');
      recBlock.className = 'n-accordion';
      const recSummary = document.createElement('summary');
      recSummary.textContent = 'Privacy Receipt';
      const recBody = document.createElement('div');
      recBody.append(row('Receipt id', state.receipt.receiptId));
      recBody.append(row('Event', state.receipt.protectionEvent));
      recBody.append(row('Human summary', state.receipt.humanSummary));
      recBlock.append(recSummary, recBody);
      els.evidenceView.append(recBlock);
    }

    if (state.confirmation && role === 'owner' && !els.confirm.open) {
      setSafeText(els.confirmWhat, `What: ${state.confirmation.actionName}`);
      setSafeText(els.confirmTarget, `Target: ${state.confirmation.targetLabel}`);
      setSafeText(els.confirmWhy, state.confirmation.why);
      setSafeText(
        els.confirmLocal,
        `Stayed local: ${state.confirmation.stayedLocal.join(', ') || 'No secrets in this step'}`
      );
      setSafeText(
        els.confirmData,
        `Data used: ${state.confirmation.dataUsed.join(', ') || 'No private tokens'}`
      );
      els.confirm.showModal();
    }
    if (!state.confirmation && els.confirm.open) {
      els.confirm.close();
    }

    els.modeMock.classList.toggle('is-active', state.plannerMode === 'MOCK');
    els.modeRemote.classList.toggle('is-active', state.plannerMode === 'REMOTE');
    els.modeMock.disabled = role === 'view' || state.running;
    els.modeRemote.disabled = role === 'view' || state.running;

    if (state.plannerMode === 'MOCK') {
      setSafeText(els.gateway, 'Local mock planner');
    } else if (state.gatewayReachable === true) {
      setSafeText(els.gateway, 'Gateway reachable · provider is reported only after a real plan');
    } else if (state.gatewayReachable === false) {
      setSafeText(els.gateway, 'Gateway unreachable');
    } else {
      setSafeText(els.gateway, 'Remote mode · gateway not probed yet');
    }
    if (state.lastPlannerProvider) {
      setSafeText(
        els.gateway,
        `Last plan: ${state.lastPlannerProvider}${state.lastPlannerModel ? ` · ${state.lastPlannerModel}` : ''}`
      );
    }
  };

  els.extra.addEventListener('click', () => {
    setDetailsOpen(true);
    setTab(els.extra.textContent === 'Review' ? 'action' : 'evidence');
  });

  return { els, update, setDetailsOpen, detailsOpen: () => details, setTab };
}

function group(title: string, rows: HTMLElement[]): HTMLElement {
  const details = document.createElement('details');
  details.className = 'n-accordion';
  details.open = true;
  const summary = document.createElement('summary');
  summary.textContent = title;
  const body = document.createElement('div');
  for (const item of rows) body.append(item);
  details.append(summary, body);
  return details;
}

function yn(value: boolean | null): string {
  if (value === null) return '—';
  return value ? 'Yes' : 'No';
}
