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
import { pipelineRailLabel, pipelineStageHelp } from './pipeline-copy.js';
import {
  AI_CONNECTION_HINT,
  HIDDEN_FROM_AI_HINT,
  STAYED_ON_DEVICE_HINT,
  protectedContextHint,
  protectedContextLabel,
  screenshotOutboundHint,
  screenshotOutboundLabel,
} from './human-copy.js';

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

function row(label: string, value: string, extraClass?: string, hint?: string): HTMLElement {
  const item = document.createElement('div');
  item.className = extraClass ? `n-row ${extraClass}` : 'n-row';
  const k = document.createElement('span');
  k.className = 'n-row-k';
  k.textContent = label;
  const v = document.createElement('span');
  v.className = 'n-row-v';
  v.textContent = value;
  if (hint) {
    item.title = hint;
    k.title = hint;
  }
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
        els.quickPrivacy.append(row(name, 'Stayed on your device', undefined, STAYED_ON_DEVICE_HINT));
      }
      for (const token of facts.tokenized) {
        const chip = row(token.label, 'Hidden from the AI', 'is-token', HIDDEN_FROM_AI_HINT);
        chip.classList.add('n-token-live');
        chip.title = `${HIDDEN_FROM_AI_HINT} Technical reference: ${token.token}`;
        els.quickPrivacy.append(chip);
      }
      els.quickPrivacy.append(
        row('Screenshot', screenshotOutboundLabel(facts.screenshotBytes), undefined, screenshotOutboundHint(facts.screenshotBytes))
      );
    }

    if (document.activeElement !== els.goal) {
      els.goal.value = state.goal;
    }
    const asking = state.phase === 'ASK_USER';
    els.goal.disabled = role === 'view' || state.running;
    els.goal.placeholder = asking
      ? 'Rewrite your request, then continue'
      : 'Describe what N-Eye should do';
    show(els.run, !state.running && role === 'owner');
    show(els.cancel, (state.running || asking) && role === 'owner');
    els.run.disabled = !state.canRun || role === 'view';
    setSafeText(els.run, asking ? state.askUser?.continueLabel || 'Continue' : 'Run');
    setSafeText(els.cancel, asking && !state.running ? state.askUser?.dismissLabel || 'Cancel' : 'Cancel');
    show(els.askHint, asking);
    setSafeText(
      els.askHint,
      asking ? state.askUser?.hint || 'Rewrite your request below, then continue. This is not an approval.' : ''
    );

    const extraLabel =
      state.phase === 'AWAITING_CONFIRMATION'
        ? 'Review'
        : asking
          ? 'Details'
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
      const protectedHead = document.createElement('h4');
      protectedHead.textContent = 'What N-Eye protected';
      const protectedList = document.createElement('div');
      protectedList.className = 'n-facts';
      for (const line of view.protectedLines) {
        protectedList.append(row('Protected', line));
      }
      const receivedHead = document.createElement('h4');
      receivedHead.textContent = 'What the AI received';
      const receivedList = document.createElement('div');
      receivedList.className = 'n-facts';
      for (const line of view.receivedLines) {
        receivedList.append(row('Received', line));
      }
      const tech = document.createElement('details');
      tech.className = 'n-accordion';
      const techSummary = document.createElement('summary');
      techSummary.textContent = 'View technical details';
      const techBody = document.createElement('div');
      for (const line of view.technicalLines) {
        techBody.append(row(line.label, line.value));
      }
      tech.append(techSummary, techBody);
      els.receipt.append(title, body, protectedHead, protectedList, receivedHead, receivedList, tech);
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
    els.activityMeta.append(row('What N-Eye is doing', state.headline));
    els.activityMeta.append(row('Site', state.siteHostname));
    els.activityMeta.append(row('AI connection', state.plannerMode === 'REMOTE' ? 'Remote' : 'Local', undefined, AI_CONNECTION_HINT));
    els.activityMeta.append(row('Page connection', state.contentScriptHealth));
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
      els.activityMeta.append(
        row(
          pipelineRailLabel(id),
          `${pipelineStageHelp(id)} · ${visual} · ${timing}`,
          undefined,
          `${id} · ${pipelineStageHelp(id)}`
        )
      );
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
          if (item.includes('hidden from the AI') || item.includes('stayed on your device')) p.className = 'n-token-live';
          wrap.append(p);
        }
        return wrap;
      };
      els.privacyViz.append(
        col('Your browser', boundary.browser),
        col('On this device', boundary.local, true),
        col('Privacy boundary', ['Only protected page information may be sent to AI']),
        col('AI', boundary.cloud)
      );
    } else {
      const empty = document.createElement('p');
      empty.className = 'n-caption';
      empty.textContent = 'No privacy protection has occurred for this task yet.';
      els.privacyViz.append(empty);
    }
    if (state.receipt) {
      const rec = state.receipt;
      els.privacyViz.append(row('Privacy Receipt', rec.receiptId));
      els.privacyViz.append(row('Event', rec.protectionEvent));
      els.privacyViz.append(row('Personal details found', String(rec.sensitiveClasses.length)));
      els.privacyViz.append(row('Categories', rec.sensitiveClasses.join(', ') || 'none'));
      els.privacyViz.append(
        row(
          'Policy',
          rec.transformations.map((item) => `${item.privacyClass}:${item.action}`).join(', ') || 'none'
        )
      );
      els.privacyViz.append(
        row(protectedContextLabel(rec.safeContextBytes), `${rec.safeContextBytes} B`, undefined, protectedContextHint(rec.safeContextBytes))
      );
      els.privacyViz.append(
        row(
          screenshotOutboundLabel(rec.rawScreenshotSent ? -1 : 0),
          rec.rawScreenshotSent ? 'YES' : '0 B',
          undefined,
          screenshotOutboundHint(rec.rawScreenshotSent ? -1 : 0)
        )
      );
      els.privacyViz.append(row('Privacy check', rec.egressResult, undefined, 'Technical: EgressGuard result'));
    }

    els.actionView.replaceChildren();
    if (state.action) {
      const a = state.action;
      els.actionView.append(row('AI proposes', a.proposalText));
      if (a.proposalType) els.actionView.append(row('Proposal type', a.proposalType));
      els.actionView.append(row('Target', a.targetLabel));
      if (a.targetId) els.actionView.append(row('Target id', a.targetId));
      if (a.frame) els.actionView.append(row('Frame', a.frame));
      els.actionView.append(row('Risk', a.risk));
      if (a.confirmationRequired !== undefined) {
        els.actionView.append(row('Your approval', a.confirmationRequired ? 'Required' : 'Not required'));
      }
      els.actionView.append(row('Target still current', yn(a.validation.targetCurrent)));
      els.actionView.append(row('Frame still current', yn(a.validation.frameCurrent)));
      els.actionView.append(row('Page still current', yn(a.validation.pageCurrent)));
      els.actionView.append(row('Private reference still valid', yn(a.validation.tokenScopeValid)));
      els.actionView.append(row('Risk policy', a.validation.riskPolicy || '—'));
      els.actionView.append(
        row(
          'Checked the page again',
          a.validation.targetCurrent === true ? 'Live target matched' : '—',
          undefined,
          'N-Eye rechecked the control before acting because webpages can change.'
        )
      );
      if (a.verification) els.actionView.append(row('Did it work?', a.verification));
      if (a.verificationDelta) els.actionView.append(row('Delta', a.verificationDelta));
      if (a.blockedReason) els.actionView.append(row('Blocked', a.blockedReason));
      // Reason code, not the attacker's payload. Safe to show in the compact Action tab.
      if (a.securityReason) els.actionView.append(row('Security reason', a.securityReason));
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
        row('Page connection', ev.contentScriptHealth),
        row('Page version', String(ev.pageEpoch), undefined, 'Technical: PageEpoch'),
        row('Frame', ev.frameNote),
        row('Observed controls', String(ev.observedControls)),
      ])
    );
    els.evidenceView.append(
      group('Planner', [
        row('Request ID', ev.requestId),
        row('AI connection', ev.plannerMode, undefined, AI_CONNECTION_HINT),
        row('Provider', ev.provider),
        row('Model', ev.model),
        row(protectedContextLabel(ev.payloadBytes), `${ev.payloadBytes} B`, undefined, protectedContextHint(ev.payloadBytes)),
        row('Privacy check', ev.egressResult, undefined, 'Technical: EgressGuard result'),
        row('Planner latency', ev.plannerLatency),
        row('Planner attempts', String(ev.plannerAttempts)),
        row('Recovery path', ev.recoveryPath),
      ])
    );
    els.evidenceView.append(
      group('Perception', [
        row(screenshotOutboundLabel(ev.screenshotOutBytes), `${ev.screenshotOutBytes} B`, undefined, screenshotOutboundHint(ev.screenshotOutBytes)),
        row('Crop outbound', ev.cropOutbound),
        row(
          ev.ocrInvoked ? 'Read visible text locally' : 'Did not read pixels',
          ev.ocrInvoked ? 'YES' : 'NO',
          undefined,
          `Technical: OCR invoked · ROI ${ev.roiCount}`
        ),
        row('Why pixels were used', ev.ocrReason),
        row('Regions read', String(ev.roiCount)),
        row('Perception source', ev.perceptionSource),
      ])
    );
    els.evidenceView.append(
      group('Authority', [
        row('Action checked', ev.validationResult),
        row('Security reason', ev.securityReason),
        row('Execution', ev.executionResult),
        row('Confirmed that it worked', ev.verificationResult),
        row('Private references', String(ev.vaultTokenCount)),
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
    jsonSummary.textContent = 'Protected AI context JSON';
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
      // Risk shown is the locally classified level, never the planner's self-declared one.
      setSafeText(els.confirmWhy, `Risk: ${state.confirmation.risk} (classified on this device). ${state.confirmation.why}`);
      setSafeText(
        els.confirmLocal,
        `Stayed on your device for this AI request: ${state.confirmation.stayedLocal.join(', ') || 'No secrets in this step'}`
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
      setSafeText(els.gateway, 'Planning locally (no cloud AI)');
    } else if (state.gatewayReachable === true) {
      setSafeText(els.gateway, 'AI service is reachable. The specific model is shown after a real request.');
    } else if (state.gatewayReachable === false) {
      setSafeText(els.gateway, "Can't connect to the AI service");
    } else {
      setSafeText(els.gateway, 'Remote mode · AI service not probed yet');
    }
    if (state.lastPlannerProvider) {
      setSafeText(
        els.gateway,
        `AI connection: ${state.lastPlannerProvider}${state.lastPlannerModel ? ` · ${state.lastPlannerModel}` : ''}`
      );
    }
  };

  els.extra.addEventListener('click', () => {
    setDetailsOpen(true);
    setTab(
      els.extra.textContent === 'Review' ? 'action' : els.extra.textContent === 'Details' ? 'privacy' : 'evidence'
    );
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
