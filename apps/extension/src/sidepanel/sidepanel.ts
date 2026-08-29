/**
 * N-Eye Side Panel Runtime & Trust Loop Coordinator (Zone 2 Privileged Core)
 *
 * OWNS: Product UI V2, Trust Core visualizer, SafeContext inspection drawer,
 * mode switching (Mock vs Remote AI), and multi-step closed-loop task execution.
 * TRUST BOUNDARY: Coordinates local observation, privacy policy, egress guarding,
 * untrusted remote proposal validation, live re-grounding, and verification.
 * MUST NOT: Send raw secrets across the network or allow remote planners to bypass local authority.
 */

import {
  type ElementId,
  type ExtensionMessage,
  type ExtensionResponse,
  type PerceptionResult,
  type PrivacyFinding,
  type PrivacyReceipt,
  type RawScene,
  type RoiSpec,
  type SafeContext,
  type TabInfo,
  type ValidatedAction,
  type VerificationResult,
  type ContentScriptHealth,
  type ContentScriptHello,
  type ContentScriptErrorClass,
  CONTENT_SCRIPT_PROTOCOL,
  createTaskId,
} from '@n-eye/protocol';
import { detectGoalPrivacy, detectOcrTextPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { tokenizeDecisionsWithValues } from '../privacy/token-values.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { PlannerManager } from '../planner/planner-manager.js';
import { validateActionProposal } from '../authority/validator.js';
import { verifyActionExecution } from '../verification/verifier.js';
import { applyBuildIdentityToDom } from '../dev/build-identity.js';
import {
  applyFusionLabels,
  runPerception,
  TesseractOcrEngine,
  discardWireRois,
  wireRoisToBuffers,
} from '../perception/index.js';
import type { CapturedRoiWire } from '../perception/capture.js';
import {
  AssuranceBus,
  blockedState,
  buildAdvisoryRecommendations,
  buildPrivacyReceipt,
  disconnectedObservationState,
  findingsHaveOcrSecrets,
  localMonitoringState,
  maybeSiteChangeEvent,
  protectedState,
  protectingState,
  remoteReasoningState,
  siteChangeHostname,
  unsupportedState,
  visualizerModel,
} from '../assurance/index.js';
import {
  classifySendMessageError,
  decideRecovery,
  disconnectedLabel,
  HANDSHAKE_POLL_MS,
  HANDSHAKE_TIMEOUT_MS,
} from '../runtime/content-connection.js';
import { classifySupportedUrl } from '../runtime/supported-url.js';

// DOM Element References
const connectionPill = document.getElementById('connection-pill') as HTMLDivElement;
const connectionText = document.getElementById('connection-text') as HTMLSpanElement;
const targetOrigin = document.getElementById('target-origin') as HTMLDivElement;
const targetTitle = document.getElementById('target-title') as HTMLDivElement;
const unsupportedBanner = document.getElementById('unsupported-banner') as HTMLDivElement;
const unsupportedReason = document.getElementById('unsupported-reason') as HTMLDivElement;

const btnModeMock = document.getElementById('btn-mode-mock') as HTMLButtonElement;
const btnModeRemote = document.getElementById('btn-mode-remote') as HTMLButtonElement;
const gatewayStatusPill = document.getElementById('gateway-status-pill') as HTMLDivElement;
const gatewayStatusText = document.getElementById('gateway-status-text') as HTMLSpanElement;

const coreStateLabel = document.getElementById('core-state-label') as HTMLSpanElement;
const coreEpochLabel = document.getElementById('core-epoch-label') as HTMLSpanElement;

const taskGoalInput = document.getElementById('task-goal-input') as HTMLInputElement;
const btnRunLoop = document.getElementById('btn-run-loop') as HTMLButtonElement;
const btnCancelLoop = document.getElementById('btn-cancel-loop') as HTMLButtonElement;
const taskStepIndicator = document.getElementById('task-step-indicator') as HTMLDivElement;
const stepBadgeText = document.getElementById('step-badge-text') as HTMLSpanElement;
const stepSummaryText = document.getElementById('step-summary-text') as HTMLSpanElement;

const stepSee = document.getElementById('step-see') as HTMLDivElement;
const stepPerceive = document.getElementById('step-perceive') as HTMLDivElement;
const stepPerceiveStatus = document.getElementById('step-perceive-status') as HTMLSpanElement;
const stepProtect = document.getElementById('step-protect') as HTMLDivElement;
const stepThink = document.getElementById('step-think') as HTMLDivElement;
const stepThinkStatus = document.getElementById('step-think-status') as HTMLSpanElement;
const stepValidate = document.getElementById('step-validate') as HTMLDivElement;
const stepAct = document.getElementById('step-act') as HTMLDivElement;
const stepVerify = document.getElementById('step-verify') as HTMLDivElement;

const transformLocalItems = document.getElementById('transform-local-items') as HTMLDivElement;
const transformSafeItems = document.getElementById('transform-safe-items') as HTMLDivElement;
const visualizerCard = document.getElementById('visualizer-card') as HTMLElement;
const visualizerCaption = document.getElementById('visualizer-caption') as HTMLElement;

const actionVerificationCard = document.getElementById('action-verification-card') as HTMLElement;
const actionProposalText = document.getElementById('action-proposal-text') as HTMLSpanElement;
const actionRiskBadge = document.getElementById('action-risk-badge') as HTMLSpanElement;
const verificationStatusBadge = document.getElementById('verification-status-badge') as HTMLSpanElement;
const verificationDeltaText = document.getElementById('verification-delta-text') as HTMLDivElement;

const latSee = document.getElementById('lat-see') as HTMLSpanElement;
const latPerceive = document.getElementById('lat-perceive') as HTMLSpanElement;
const latProtect = document.getElementById('lat-protect') as HTMLSpanElement;
const latPlanLabel = document.getElementById('lat-plan-label') as HTMLSpanElement;
const latPlan = document.getElementById('lat-plan') as HTMLSpanElement;
const latValidate = document.getElementById('lat-validate') as HTMLSpanElement;
const latAct = document.getElementById('lat-act') as HTMLSpanElement;
const latVerify = document.getElementById('lat-verify') as HTMLSpanElement;
const latTotal = document.getElementById('lat-total') as HTMLSpanElement;

const btnToggleEvidence = document.getElementById('btn-toggle-evidence') as HTMLButtonElement;
const evidenceDrawer = document.getElementById('evidence-drawer') as HTMLDivElement;
const evidenceChevron = document.getElementById('evidence-chevron') as HTMLSpanElement;
const statElementsCount = document.getElementById('stat-elements-count') as HTMLDivElement;
const statFindingsCount = document.getElementById('stat-findings-count') as HTMLDivElement;
const statTokensCount = document.getElementById('stat-tokens-count') as HTMLDivElement;
const statEpoch = document.getElementById('stat-epoch') as HTMLDivElement;

const proofRequestId = document.getElementById('proof-request-id') as HTMLSpanElement;
const proofPlannerMode = document.getElementById('proof-planner-mode') as HTMLSpanElement;
const proofProviderModel = document.getElementById('proof-provider-model') as HTMLSpanElement;
const proofPayloadSize = document.getElementById('proof-payload-size') as HTMLSpanElement;
const proofCanaryStatus = document.getElementById('proof-canary-status') as HTMLSpanElement;
const evidenceSafeContextDump = document.getElementById('evidence-safecontext-dump') as HTMLElement;
const protectionStrip = document.getElementById('protection-strip') as HTMLElement;
const protectionStateLabel = document.getElementById('protection-state-label') as HTMLElement;
const protectionDetail = document.getElementById('protection-detail') as HTMLElement;
const assuranceToast = document.getElementById('assurance-toast') as HTMLElement;
const receiptCard = document.getElementById('receipt-card') as HTMLElement;
const receiptHuman = document.getElementById('receipt-human') as HTMLElement;
const receiptTechnical = document.getElementById('receipt-technical') as HTMLElement;
const advisoryCard = document.getElementById('advisory-card') as HTMLElement;
const advisoryList = document.getElementById('advisory-list') as HTMLElement;
const statOcrInvoked = document.getElementById('stat-ocr-invoked') as HTMLElement;
const statRoiCount = document.getElementById('stat-roi-count') as HTMLElement;
const statPerceptionSource = document.getElementById('stat-perception-source') as HTMLElement;
const statScreenshotOut = document.getElementById('stat-screenshot-out') as HTMLElement;
const proofOcrReason = document.getElementById('proof-ocr-reason') as HTMLElement;
const proofCropOut = document.getElementById('proof-crop-out') as HTMLElement;
const statCsState = document.getElementById('stat-cs-state') as HTMLElement;

const confirmModal = document.getElementById('confirmation-dialog') as HTMLDialogElement;
const modalActionName = document.getElementById('modal-action-name') as HTMLSpanElement;
const modalActionTarget = document.getElementById('modal-action-target') as HTMLSpanElement;
const btnModalConfirm = document.getElementById('btn-modal-confirm') as HTMLButtonElement;
const btnModalCancel = document.getElementById('btn-modal-cancel') as HTMLButtonElement;

// Runtime state
let activeTab: TabInfo | null = null;
let _lastRawScene: RawScene | null = null;
let currentTaskAbortController: AbortController | null = null;
let observeGeneration = 0;
const recoveryExhausted = new Set<string>();
const vault = new PrivateTokenVault();
const plannerManager = new PlannerManager('MOCK', 'http://localhost:8000');
const ocrEngine = new TesseractOcrEngine();
const assuranceBus = new AssuranceBus();
let lastSiteHostname: string | null = null;

const MAX_STEPS = 8;

function showToast(message: string): void {
  assuranceToast.textContent = message;
  assuranceToast.classList.remove('hidden');
  window.setTimeout(() => {
    assuranceToast.classList.add('hidden');
  }, 4500);
}

function setProtectionView(state: string, headline: string, detail: string): void {
  protectionStrip.dataset['state'] = state;
  protectionStateLabel.textContent = headline;
  protectionDetail.textContent = detail;
}

function renderReceipt(receipt: PrivacyReceipt): void {
  receiptCard.classList.remove('hidden');
  receiptHuman.textContent = receipt.humanSummary;
  receiptTechnical.replaceChildren();
  const rows: Array<[string, string]> = [
    ['Site', receipt.hostname],
    ['Event', receipt.protectionEvent],
    ['Perception', receipt.perceptionSource],
    ['Classes', receipt.sensitiveClasses.join(', ') || 'none'],
    ['Raw screenshot sent', receipt.rawScreenshotSent ? 'YES' : 'NO'],
    ['Safe crop sent', receipt.safeCropSent ? 'YES' : 'NO'],
    ['SafeContext bytes', String(receipt.safeContextBytes)],
    ['Egress', receipt.egressResult],
    ['Provider', receipt.plannerProvider || '—'],
  ];
  for (const [label, value] of rows) {
    const line = document.createElement('div');
    line.textContent = `${label}: ${value}`;
    receiptTechnical.appendChild(line);
  }
}

function captureRoisFromTab(tabId: number): (rois: RoiSpec[]) => Promise<ReturnType<typeof wireRoisToBuffers>> {
  return async (rois: RoiSpec[]) => {
    const wires = await new Promise<CapturedRoiWire[]>((resolve) => {
      chrome.tabs.sendMessage(
        tabId,
        {
          type: 'CAPTURE_ROIS_REQUEST',
          rois: rois.map((roi) => ({
            roiId: roi.roiId,
            x: roi.bbox.x,
            y: roi.bbox.y,
            width: roi.bbox.width,
            height: roi.bbox.height,
          })),
        },
        (response: ExtensionResponse<CapturedRoiWire[]>) => {
          if (chrome.runtime.lastError || !response?.success || !response.data) {
            resolve([]);
            return;
          }
          resolve(response.data);
        }
      );
    });
    const buffers = wireRoisToBuffers(wires);
    discardWireRois(wires);
    return buffers;
  };
}

function applyLocalMonitoring(scene: RawScene | null, supported: boolean, reason?: string): void {
  if (!supported) {
    const view = unsupportedState(reason || 'This page cannot be observed.');
    setProtectionView(view.state, view.headline, view.detail);
    return;
  }
  if (!scene) {
    const view = disconnectedObservationState();
    setProtectionView(view.state, view.headline, view.detail);
    return;
  }
  const classes = scene.privacyFindings.map((f) => f.privacyClass);
  const view = localMonitoringState(classes);
  setProtectionView(view.state, view.headline, view.detail);
}

function setContentHealth(health: ContentScriptHealth): void {
  if (statCsState) statCsState.textContent = health;
}

function setConnectionStatus(
  status: 'IDLE' | 'CONNECTING' | 'OBSERVING' | 'READY' | 'EXECUTING' | 'UNSUPPORTED' | 'FAILED' | 'CANCELLED' | 'INJECTING',
  labelText?: string
): void {
  connectionPill.className = `status-pill status-${status.toLowerCase()}`;
  connectionText.textContent = labelText || status;
  coreStateLabel.textContent = status;
}

function updatePipelineStep(stepEl: HTMLDivElement, state: 'idle' | 'active' | 'done'): void {
  stepEl.classList.remove('step-idle', 'step-active', 'step-done');
  stepEl.classList.add(`step-${state}`);
}

async function refreshGatewayStatus(): Promise<void> {
  if (plannerManager.getMode() === 'MOCK') {
    gatewayStatusPill.className = 'gateway-pill gateway-offline';
    gatewayStatusText.textContent = 'Gateway: Standby (Mock Mode)';
    stepThinkStatus.textContent = 'MOCK';
    latPlanLabel.textContent = 'PLAN (MOCK)';
    proofPlannerMode.textContent = 'MOCK (Deterministic)';
    proofProviderModel.textContent = 'mock (local-deterministic)';
    return;
  }

  gatewayStatusText.textContent = 'Gateway: Connecting...';
  const health = await plannerManager.checkGatewayHealth();

  if (health.healthy) {
    if (health.provider === 'mock') {
      gatewayStatusPill.className = 'gateway-pill gateway-online';
      gatewayStatusText.textContent = `Gateway: Mock Mode (${health.model})`;
      stepThinkStatus.textContent = 'MOCK';
      latPlanLabel.textContent = 'PLAN (SERVER MOCK)';
      proofPlannerMode.textContent = 'REMOTE (Server Mock)';
      proofProviderModel.textContent = `mock (${health.model})`;
    } else {
      gatewayStatusPill.className = 'gateway-pill gateway-online';
      gatewayStatusText.textContent = `Gateway: Online (${health.provider}: ${health.model})`;
      stepThinkStatus.textContent = 'REMOTE';
      latPlanLabel.textContent = `PLAN (REMOTE: ${health.provider})`;
      proofPlannerMode.textContent = 'REMOTE (Real AI)';
      proofProviderModel.textContent = `${health.provider} (${health.model})`;
    }
  } else {
    gatewayStatusPill.className = 'gateway-pill gateway-offline';
    gatewayStatusText.textContent = 'Gateway: Offline (Run FastAPI)';
    stepThinkStatus.textContent = 'OFFLINE';
    latPlanLabel.textContent = 'PLAN (REMOTE: OFFLINE)';
    proofPlannerMode.textContent = 'REMOTE (Offline)';
    proofProviderModel.textContent = 'Unreachable Gateway';
  }
}

async function requestObservation(tabId: number, allowRecovery = true): Promise<RawScene | null> {
  const generation = ++observeGeneration;
  setConnectionStatus('OBSERVING', 'OBSERVING PAGE');
  updatePipelineStep(stepSee, 'active');

  const applyScene = (scene: RawScene): RawScene => {
    _lastRawScene = scene;
    coreEpochLabel.textContent = `Epoch ${scene.pageEpoch}`;
    statEpoch.textContent = String(scene.pageEpoch);
    statElementsCount.textContent = String(scene.elements.length);
    setContentHealth('READY');
    setConnectionStatus('READY', 'TRUST LAYER READY');
    updatePipelineStep(stepSee, 'done');
    updatePipelineStep(stepProtect, 'idle');
    const url = activeTab?.url || '';
    recoveryExhausted.delete(`${tabId}:${url}`);
    return scene;
  };

  const failDisconnected = (errorClass: ContentScriptErrorClass): null => {
    setContentHealth(errorClass === 'UNSUPPORTED_URL' ? 'UNSUPPORTED' : 'DISCONNECTED');
    setConnectionStatus(
      errorClass === 'UNSUPPORTED_URL' ? 'UNSUPPORTED' : 'FAILED',
      disconnectedLabel(errorClass)
    );
    updatePipelineStep(stepSee, 'idle');
    return null;
  };

  const ping = await pingContentScript(tabId);
  if (generation !== observeGeneration) return null;

  if (ping.ok) {
    if (ping.hello.contentProtocol !== CONTENT_SCRIPT_PROTOCOL) {
      return failDisconnected('VERSION_MISMATCH');
    }
    const observed = await tabSendMessage<RawScene>(tabId, { type: 'OBSERVE_REQUEST' });
    if (generation !== observeGeneration) return null;
    if (observed.ok) return applyScene(observed.data);
    setConnectionStatus('FAILED', 'OBSERVATION FAILED');
    setContentHealth('DISCONNECTED');
    return null;
  }

  if (!allowRecovery) {
    return failDisconnected(classifySendMessageError(ping.lastError));
  }

  const url = activeTab?.url || '';
  const exhaustedKey = `${tabId}:${url}`;
  if (recoveryExhausted.has(exhaustedKey)) {
    return failDisconnected('INJECTION_FAILED');
  }

  const supported = classifySupportedUrl(url).isSupported && Boolean(activeTab?.isSupported);
  const errorClass = classifySendMessageError(ping.lastError);
  const decision = decideRecovery({ urlSupported: supported, injectAttempts: 0, errorClass });
  if (decision.action === 'UNSUPPORTED') {
    setContentHealth('UNSUPPORTED');
    setConnectionStatus('UNSUPPORTED', 'RESTRICTED PAGE');
    updatePipelineStep(stepSee, 'idle');
    return null;
  }
  if (decision.action !== 'INJECT') {
    recoveryExhausted.add(exhaustedKey);
    return failDisconnected(errorClass);
  }

  setContentHealth('INJECTING');
  setConnectionStatus('INJECTING', 'RECOVERING CONTENT SCRIPT');

  let injectOk = false;
  try {
    const injectRes: ExtensionResponse = await chrome.runtime.sendMessage({
      type: 'INJECT_CONTENT_SCRIPT',
      tabId,
    });
    injectOk = Boolean(injectRes?.success);
  } catch {
    injectOk = false;
  }
  if (generation !== observeGeneration) return null;
  if (!injectOk) {
    recoveryExhausted.add(exhaustedKey);
    return failDisconnected('INJECTION_FAILED');
  }

  const hello = await waitForHandshake(tabId, generation);
  if (generation !== observeGeneration) return null;
  if (!hello) {
    recoveryExhausted.add(exhaustedKey);
    return failDisconnected('TIMEOUT');
  }
  if (hello.contentProtocol !== CONTENT_SCRIPT_PROTOCOL) {
    recoveryExhausted.add(exhaustedKey);
    return failDisconnected('VERSION_MISMATCH');
  }

  const observed = await tabSendMessage<RawScene>(tabId, { type: 'OBSERVE_REQUEST' });
  if (generation !== observeGeneration) return null;
  if (observed.ok) return applyScene(observed.data);
  recoveryExhausted.add(exhaustedKey);
  return failDisconnected(classifySendMessageError(observed.lastError));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function tabSendMessage<T>(
  tabId: number,
  message: ExtensionMessage
): Promise<{ ok: true; data: T } | { ok: false; lastError: string }> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response: ExtensionResponse<T>) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, lastError: chrome.runtime.lastError.message || 'unknown' });
        return;
      }
      if (!response?.success || response.data === undefined) {
        resolve({ ok: false, lastError: response?.error || 'empty response' });
        return;
      }
      resolve({ ok: true, data: response.data });
    });
  });
}

async function pingContentScript(
  tabId: number
): Promise<{ ok: true; hello: ContentScriptHello } | { ok: false; lastError: string }> {
  const result = await tabSendMessage<ContentScriptHello>(tabId, { type: 'PING' });
  if (!result.ok) return result;
  return { ok: true, hello: result.data };
}

async function waitForHandshake(tabId: number, generation: number): Promise<ContentScriptHello | null> {
  const deadline = Date.now() + HANDSHAKE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (generation !== observeGeneration) return null;
    const ping = await pingContentScript(tabId);
    if (ping.ok) return ping.hello;
    await delay(HANDSHAKE_POLL_MS);
  }
  return null;
}

function appendTransformItem(
  parent: HTMLElement,
  tag: string,
  value: string,
  options?: { itemClass?: string; tagClass?: string; valueClass?: string }
): void {
  // PRIVACY/SECURITY: Untrusted page text (labels, ARIA, findings) must never be assigned via innerHTML.
  const item = document.createElement('div');
  item.className = options?.itemClass ? `transform-item ${options.itemClass}` : 'transform-item';
  const tagEl = document.createElement('span');
  tagEl.className = options?.tagClass || 'item-tag';
  tagEl.textContent = tag;
  const valEl = document.createElement('span');
  valEl.className = options?.valueClass || 'item-val';
  valEl.textContent = value;
  item.append(tagEl, valEl);
  parent.appendChild(item);
}

function renderVisualizer(findings: PrivacyFinding[] | null, safeContext: SafeContext | null): void {
  const model = visualizerModel(findings, safeContext);
  transformLocalItems.replaceChildren();
  transformSafeItems.replaceChildren();
  visualizerCaption.textContent = model.caption;
  visualizerCard.dataset['evidence'] = model.mode;

  for (const item of model.local) {
    appendTransformItem(transformLocalItems, item.tag, item.value, {
      itemClass: item.kind === 'empty' ? 'empty' : undefined,
      valueClass: item.kind === 'empty' ? 'item-desc' : 'item-val',
    });
  }
  for (const item of model.safe) {
    appendTransformItem(transformSafeItems, item.tag, item.value, {
      itemClass: item.kind === 'token' ? 'tokenized' : item.kind === 'blocked' ? 'blocked' : item.kind === 'empty' ? 'empty' : undefined,
      tagClass: item.kind === 'token' ? 'item-tag token-tag' : item.kind === 'blocked' ? 'item-tag blocked-tag' : 'item-tag',
      valueClass: 'item-desc',
    });
  }
}

function clearLiveEvidence(): void {
  _lastRawScene = null;
  renderVisualizer(null, null);
  receiptCard.classList.add('hidden');
}

/**
 * Multi-Step Closed-Loop Task Execution
 *
 * Enforces:
 * 1. SEE locally
 * 2. PROTECT locally & Egress Guard byte scan
 * 3. THINK via PlannerManager (Mock or Remote AI)
 * 4. VALIDATE locally against live DOM & Token Vault
 * 5. HIGH-RISK Confirmation Gate
 * 6. ACT locally on live node
 * 7. VERIFY state delta & feed priorOutcome into next step
 */
async function executeClosedTrustLoop(): Promise<void> {
  if (!activeTab || !activeTab.isSupported) return;
  const currentTab = activeTab;
  const tabId = currentTab.tabId;
  const origin = currentTab.origin;

  const taskId = createTaskId(`task_${Date.now()}`);
  const rawGoal = taskGoalInput.value.trim() || 'Enter my email and continue';
  resetTokenCounters();
  vault.clear();
  plannerManager.reset();
  clearLiveEvidence();

  currentTaskAbortController = new AbortController();
  const signal = currentTaskAbortController.signal;

  btnRunLoop.classList.add('hidden');
  btnCancelLoop.classList.remove('hidden');
  taskStepIndicator.classList.remove('hidden');

  let priorOutcome: SafeContext['priorOutcome'] | undefined = undefined;
  const executedProposals: string[] = [];
  const loopStartTime = performance.now();

  try {
    for (let step = 1; step <= MAX_STEPS; step++) {
      if (signal.aborted) {
        throw new DOMException('Task cancelled by user.', 'AbortError');
      }

      stepBadgeText.textContent = `Step ${step} of ${MAX_STEPS}`;
      stepSummaryText.textContent = `Executing step ${step}...`;

      // 1. SEE LOCALLY
      const seeStart = performance.now();
      updatePipelineStep(stepSee, 'active');
      const preScene = await requestObservation(tabId);
      const seeDuration = performance.now() - seeStart;
      latSee.textContent = `${seeDuration.toFixed(1)} ms`;
      updatePipelineStep(stepSee, 'done');

      if (!preScene) {
        throw new Error('Failed to observe active page state.');
      }

      // 1b. PERCEIVE LOCALLY — OCR only when the adaptive controller escalates.
      updatePipelineStep(stepPerceive, 'active');
      stepPerceiveStatus.textContent = '…';
      const perception: PerceptionResult = await runPerception({
        scene: preScene,
        engine: ocrEngine,
        capture: captureRoisFromTab(tabId),
        goal: rawGoal,
        origin,
      });
      latPerceive.textContent = perception.invoked ? `${perception.timings.totalMs.toFixed(1)} ms` : 'skipped';

      if (perception.fallback === 'PAGE_CHANGED') {
        updatePipelineStep(stepPerceive, 'idle');
        stepPerceiveStatus.textContent = 'STALE';
        throw new Error('Page changed during visual perception. Re-perceive required.');
      }

      let workingScene = preScene;
      if (perception.invoked) {
        updatePipelineStep(stepPerceive, 'done');
        stepPerceiveStatus.textContent = perception.fallback ? perception.fallback : 'OCR';
        workingScene = {
          ...preScene,
          elements: applyFusionLabels(preScene.elements, perception.candidates),
        };
      } else {
        updatePipelineStep(stepPerceive, 'idle');
        stepPerceiveStatus.textContent = 'SKIP';
      }
      proofOcrReason.textContent = perception.invoked
        ? perception.decision.reasons.join(', ') || 'escalated'
        : perception.decision.skippedReason || 'DOM sufficient';
      proofCropOut.textContent = 'NO';
      statOcrInvoked.textContent = perception.invoked ? 'YES' : 'NO';
      statRoiCount.textContent = String(perception.decision.roiSpecs.length);
      statPerceptionSource.textContent = perception.invoked
        ? perception.fusedElementIds.length > 0
          ? 'FUSED'
          : 'OCR'
        : 'DOM';
      statScreenshotOut.textContent = '0 B';

      // 2. PROTECT LOCALLY
      const protectStart = performance.now();
      updatePipelineStep(stepProtect, 'active');
      coreStateLabel.textContent = 'PROTECT';
      const protecting = protectingState();
      setProtectionView(protecting.state, protecting.headline, protecting.detail);

      const goalFindings = detectGoalPrivacy(rawGoal);
      const blockToElement = new Map<string, ElementId>();
      for (const grounding of perception.groundings) {
        if (!grounding.elementId) continue;
        for (const blockId of grounding.ocrBlockIds) {
          blockToElement.set(blockId, grounding.elementId);
        }
      }
      const ocrFindings = perception.ocrBlocks.flatMap((block) =>
        detectOcrTextPrivacy(block.text, {
          roiId: block.roiId,
          blockId: block.blockId,
          elementId: blockToElement.get(block.blockId),
        })
      );
      const combinedFindings = [...workingScene.privacyFindings, ...goalFindings, ...ocrFindings];
      statFindingsCount.textContent = String(combinedFindings.length);

      const decisions = evaluatePrivacyPolicy(combinedFindings);

      // Register only findings that carry a real value. Never invent demo identities.
      for (const { decision, realValue } of tokenizeDecisionsWithValues(decisions, combinedFindings)) {
        if (!decision.tokenRole) continue;
        vault.registerToken(
          decision.tokenRole,
          decision.privacyClass,
          realValue,
          taskId,
          tabId,
          origin,
          ['text', 'textbox', 'email', 'tel']
        );
      }

      statTokensCount.textContent = String(vault.size());

      const safeContext = buildSafeContext(workingScene, rawGoal, decisions, vault, taskId, combinedFindings, {
        visualCandidates: perception.candidates,
      });
      if (priorOutcome) {
        safeContext.priorOutcome = priorOutcome;
      }

      // Egress Guard validation & byte scanning
      let serializedBytes: string;
      const perceptionSource = perception.invoked
        ? perception.fusedElementIds.length > 0
          ? 'FUSED'
          : 'OCR'
        : 'DOM';
      try {
        serializedBytes = validateSafeContextEgress(safeContext);
        proofCanaryStatus.textContent = 'PASS (0 Secrets Detected)';
        proofCanaryStatus.className = 'proof-val proof-pass';
      } catch (egressErr) {
        proofCanaryStatus.textContent = `BLOCKED: ${(egressErr as Error).message}`;
        proofCanaryStatus.className = 'proof-val proof-fail';
        const blocked = blockedState();
        setProtectionView(blocked.state, blocked.headline, blocked.detail);
        const blockedReceipt = buildPrivacyReceipt({
          hostname: siteChangeHostname(currentTab.url, origin, true),
          protectionEvent: 'BLOCKED',
          perceptionSource,
          findings: combinedFindings,
          decisions,
          rawScreenshotSent: false,
          safeCropSent: false,
          safeContextBytes: 0,
          egressResult: 'BLOCKED',
          ocrInvoked: perception.invoked,
          roiCount: perception.decision.roiSpecs.length,
          ocrBlockCount: perception.ocrBlocks.length,
          escalationReasons: perception.decision.reasons.join(', '),
        });
        renderReceipt(blockedReceipt);
        const blockedToast = assuranceBus.emit({
          kind: 'BLOCKED',
          hostname: blockedReceipt.hostname,
          message: 'N-Eye blocked an unsafe AI request. Forbidden sensitive data was detected before network.',
          severity: 'warning',
          dedupeKey: `blocked:${blockedReceipt.hostname}`,
        });
        if (blockedToast) showToast(blockedToast.message);
        throw egressErr;
      }

      evidenceSafeContextDump.textContent = JSON.stringify(JSON.parse(serializedBytes), null, 2);
      proofPayloadSize.textContent = `${serializedBytes.length} bytes`;

      const protectDuration = performance.now() - protectStart;
      latProtect.textContent = `${protectDuration.toFixed(1)} ms`;
      updatePipelineStep(stepProtect, 'done');
      renderVisualizer(combinedFindings, safeContext);

      const notes = buildAdvisoryRecommendations(combinedFindings, perception);
      if (notes.length > 0) {
        advisoryCard.classList.remove('hidden');
        advisoryList.replaceChildren();
        for (const note of notes) {
          const li = document.createElement('li');
          li.textContent = note;
          advisoryList.appendChild(li);
        }
      }

      // 3. THINK (MOCK OR REMOTE AI PLANNER)
      const planStart = performance.now();
      updatePipelineStep(stepThink, 'active');
      coreStateLabel.textContent = 'PLAN';
      const remoteView = remoteReasoningState();
      setProtectionView(remoteView.state, remoteView.headline, remoteView.detail);

      const planResult = await plannerManager.propose(safeContext, { signal });
      const proposal = planResult.proposal;
      const metadata = planResult.metadata;

      const planDuration = performance.now() - planStart;
      latPlan.textContent = `${(metadata.planningLatencyMs || planDuration).toFixed(1)} ms`;
      proofRequestId.textContent = metadata.requestId;
      proofProviderModel.textContent = `${metadata.provider} (${metadata.model})`;
      updatePipelineStep(stepThink, 'done');

      const protectedView = protectedState(combinedFindings.length);
      setProtectionView(protectedView.state, protectedView.headline, protectedView.detail);
      const receipt = buildPrivacyReceipt({
        hostname: siteChangeHostname(currentTab.url, origin, true),
        protectionEvent: 'PROTECTED',
        perceptionSource,
        findings: combinedFindings,
        decisions,
        rawScreenshotSent: false,
        safeCropSent: false,
        safeContextBytes: serializedBytes.length,
        plannerProvider: metadata.provider,
        plannerModel: metadata.model,
        egressResult: 'PASS',
        requestId: metadata.requestId,
        latencyMs: metadata.planningLatencyMs || planDuration,
        ocrInvoked: perception.invoked,
        roiCount: perception.decision.roiSpecs.length,
        ocrBlockCount: perception.ocrBlocks.length,
        escalationReasons: perception.decision.reasons.join(', '),
      });
      renderReceipt(receipt);
      const protectedToast = assuranceBus.emit({
        kind: findingsHaveOcrSecrets(combinedFindings) ? 'OCR_PROTECTED' : 'PROTECTED',
        hostname: receipt.hostname,
        message: findingsHaveOcrSecrets(combinedFindings)
          ? 'OCR found private text in this visual region. It was protected locally.'
          : protectedView.detail,
        severity: 'success',
        dedupeKey: `protected:${receipt.hostname}:${metadata.requestId}`,
      });
      if (protectedToast) showToast(protectedToast.message);
      if (combinedFindings.some((f) => f.privacyClass === 'SECRET_PASSWORD')) {
        const pwdToast = assuranceBus.emit({
          kind: 'PASSWORD_EXCLUDED',
          hostname: receipt.hostname,
          message: 'Password was not sent to the AI planner.',
          severity: 'info',
          dedupeKey: `password:${receipt.hostname}`,
        });
        if (pwdToast) showToast(pwdToast.message);
      }

      actionVerificationCard.classList.remove('hidden');
      actionProposalText.textContent = `${proposal.type} ${proposal.targetId ? `(target: ${proposal.targetId})` : ''}`;
      actionRiskBadge.textContent = proposal.riskLevel;
      actionRiskBadge.className = `risk-badge risk-${proposal.riskLevel.toLowerCase()}`;

      // Check if task goal is complete
      if (proposal.type === 'COMPLETE') {
        verificationStatusBadge.textContent = 'COMPLETED';
        verificationStatusBadge.className = 'verify-badge verify-success';
        verificationDeltaText.textContent = proposal.reasoning || 'Goal fully achieved on active page.';
        stepSummaryText.textContent = 'Task completed successfully.';
        break;
      }

      // Check if model requested user clarification
      if (proposal.type === 'ASK_USER') {
        verificationStatusBadge.textContent = 'NEEDS INPUT';
        verificationStatusBadge.className = 'verify-badge verify-pending';
        verificationDeltaText.textContent = proposal.reasoning || 'Planner requires user input to proceed.';
        stepSummaryText.textContent = 'Awaiting user input.';
        break;
      }

      // Cycle detection loop safety
      const proposalSignature = `${proposal.type}:${proposal.targetId || ''}:${proposal.tokenId || ''}`;
      if (executedProposals.filter((p) => p === proposalSignature).length >= 2) {
        throw new Error(`Loop safety triggered: Action ${proposalSignature} was proposed repeatedly without progress.`);
      }
      executedProposals.push(proposalSignature);

      // 4. VALIDATE LOCALLY
      const validateStart = performance.now();
      updatePipelineStep(stepValidate, 'active');
      coreStateLabel.textContent = 'VALIDATE';

      let validatedAction: ValidatedAction;
      try {
        validatedAction = validateActionProposal(proposal, workingScene, vault, taskId, origin);
      } catch (err) {
        actionProposalText.textContent = `Rejected: ${(err as Error).message}`;
        updatePipelineStep(stepValidate, 'idle');
        throw err;
      }

      const validateDuration = performance.now() - validateStart;
      latValidate.textContent = `${validateDuration.toFixed(1)} ms`;
      updatePipelineStep(stepValidate, 'done');
      actionRiskBadge.textContent = validatedAction.approvedRiskLevel;
      actionRiskBadge.className = `risk-badge risk-${validatedAction.approvedRiskLevel.toLowerCase()}`;

      // 5. HIGH-RISK CONFIRMATION GATE (local approvedRiskLevel; planner cannot downgrade)
      if (validatedAction.approvedRiskLevel === 'HIGH') {
        modalActionName.textContent = proposal.type;
        modalActionTarget.textContent = proposal.targetId || 'Interactive Action';
        confirmModal.showModal();

        const confirmed = await new Promise<boolean>((resolve) => {
          btnModalConfirm.onclick = () => {
            confirmModal.close();
            resolve(true);
          };
          btnModalCancel.onclick = () => {
            confirmModal.close();
            resolve(false);
          };
        });

        if (!confirmed || signal.aborted) {
          actionProposalText.textContent = 'Action cancelled by user';
          throw new DOMException('Action cancelled by user.', 'AbortError');
        }
      }

      // 6. ACT LOCALLY
      const actStart = performance.now();
      updatePipelineStep(stepAct, 'active');
      coreStateLabel.textContent = 'ACT';

      const execResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        chrome.tabs.sendMessage(
          tabId,
          { type: 'EXECUTE_ACTION_REQUEST', action: validatedAction },
          (response: ExtensionResponse<{ success: boolean; error?: string }>) => {
            if (chrome.runtime.lastError || !response || !response.success) {
              resolve({ success: false, error: response?.error || chrome.runtime.lastError?.message });
            } else {
              resolve({ success: true });
            }
          }
        );
      });

      const actDuration = performance.now() - actStart;
      latAct.textContent = `${actDuration.toFixed(1)} ms`;
      updatePipelineStep(stepAct, 'done');

      if (!execResult.success) {
        verificationStatusBadge.textContent = 'FAILED';
        verificationStatusBadge.className = 'verify-badge verify-failure';
        verificationDeltaText.textContent = `Execution failed: ${execResult.error}`;
        throw new Error(`Action execution failed: ${execResult.error}`);
      }

      // 7. VERIFY LOCALLY
      const verifyStart = performance.now();
      updatePipelineStep(stepVerify, 'active');
      coreStateLabel.textContent = 'VERIFY';

      // Wait 120ms for DOM mutation to settle and re-observe
      await new Promise((r) => setTimeout(r, 120));
      const postScene = await requestObservation(tabId, false);

      if (postScene) {
        const verification: VerificationResult = verifyActionExecution(validatedAction, preScene, postScene);
        verificationStatusBadge.textContent = verification.status === 'VERIFIED_SUCCESS' ? 'VERIFIED' : 'FAILED';
        verificationStatusBadge.className = `verify-badge verify-${verification.status === 'VERIFIED_SUCCESS' ? 'success' : 'failure'}`;
        verificationDeltaText.textContent = verification.observedDelta;

        priorOutcome = {
          actionId: proposal.actionId,
          status: verification.status === 'VERIFIED_SUCCESS' ? 'VERIFIED' : 'FAILURE',
          summary: verification.observedDelta,
        };
      }

      const verifyDuration = performance.now() - verifyStart;
      latVerify.textContent = `${verifyDuration.toFixed(1)} ms`;
      updatePipelineStep(stepVerify, 'done');
    }

    const totalDuration = performance.now() - loopStartTime;
    latTotal.textContent = `${totalDuration.toFixed(1)} ms`;
    setConnectionStatus('READY', 'LOOP COMPLETE');
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      setConnectionStatus('CANCELLED', 'TASK CANCELLED');
      stepSummaryText.textContent = 'Task cancelled by user.';
      clearLiveEvidence();
    } else {
      setConnectionStatus('FAILED', 'TASK FAILED');
      stepSummaryText.textContent = `Error: ${(err as Error).message}`;
    }
  } finally {
    btnRunLoop.classList.remove('hidden');
    btnCancelLoop.classList.add('hidden');
    currentTaskAbortController = null;
  }
}

async function initializeActiveTab(): Promise<void> {
  setConnectionStatus('CONNECTING', 'DISCOVERING TAB');
  renderVisualizer(null, null);

  try {
    const res: ExtensionResponse<TabInfo> = await chrome.runtime.sendMessage({ type: 'GET_ACTIVE_TAB_INFO' });

    if (!res || !res.success || !res.data) {
      setConnectionStatus('FAILED', 'NO ACTIVE TAB');
      return;
    }

    activeTab = res.data;
    targetOrigin.textContent = activeTab.origin || activeTab.url || 'Unknown page';
    targetTitle.textContent = activeTab.title || 'Untitled';

    if (!activeTab.isSupported) {
      setConnectionStatus('UNSUPPORTED', 'RESTRICTED PAGE');
      unsupportedReason.textContent = activeTab.unsupportedReason || 'Unsupported browser scheme';
      unsupportedBanner.classList.remove('hidden');
      applyLocalMonitoring(null, false, activeTab.unsupportedReason);
      return;
    }

    unsupportedBanner.classList.add('hidden');
    const scene = await requestObservation(activeTab.tabId);
    applyLocalMonitoring(scene, true);
    const hostname = siteChangeHostname(activeTab.url, activeTab.origin, true);
    const siteEvent = maybeSiteChangeEvent(assuranceBus, lastSiteHostname, activeTab.url, activeTab.origin, true);
    lastSiteHostname = hostname;
    if (siteEvent) showToast(siteEvent.message);
    await refreshGatewayStatus();
  } catch {
    setConnectionStatus('FAILED', 'CONNECTION ERROR');
  }
}

// Event Listeners
btnRunLoop.addEventListener('click', () => {
  executeClosedTrustLoop();
});

btnCancelLoop.addEventListener('click', () => {
  if (currentTaskAbortController) {
    currentTaskAbortController.abort();
  }
});

btnModeMock.addEventListener('click', () => {
  plannerManager.setMode('MOCK');
  btnModeMock.classList.add('active');
  btnModeRemote.classList.remove('active');
  refreshGatewayStatus();
});

btnModeRemote.addEventListener('click', () => {
  plannerManager.setMode('REMOTE');
  btnModeRemote.classList.add('active');
  btnModeMock.classList.remove('active');
  refreshGatewayStatus();
});

btnToggleEvidence.addEventListener('click', () => {
  const isHidden = evidenceDrawer.classList.toggle('hidden');
  btnToggleEvidence.setAttribute('aria-expanded', String(!isHidden));
  evidenceChevron.textContent = isHidden ? '▼' : '▲';
});

chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
  if (message.type === 'TAB_CHANGED') {
    activeTab = message.tabInfo;
    targetOrigin.textContent = activeTab.origin || activeTab.url;
    targetTitle.textContent = activeTab.title || 'Untitled';
    clearLiveEvidence();

    const hostname = siteChangeHostname(activeTab.url, activeTab.origin, activeTab.isSupported);
    const siteEvent = maybeSiteChangeEvent(
      assuranceBus,
      lastSiteHostname,
      activeTab.url,
      activeTab.origin,
      activeTab.isSupported
    );
    lastSiteHostname = hostname;
    if (siteEvent) showToast(siteEvent.message);

    if (!activeTab.isSupported) {
      setConnectionStatus('UNSUPPORTED', 'RESTRICTED PAGE');
      unsupportedReason.textContent = activeTab.unsupportedReason || 'Unsupported browser scheme';
      unsupportedBanner.classList.remove('hidden');
      applyLocalMonitoring(null, false, activeTab.unsupportedReason);
    } else {
      unsupportedBanner.classList.add('hidden');
      requestObservation(activeTab.tabId).then((scene) => {
        applyLocalMonitoring(scene, true);
      });
    }
  }
});

applyBuildIdentityToDom();
renderVisualizer(null, null);
setContentHealth('UNKNOWN');

// Mount
document.addEventListener('DOMContentLoaded', () => {
  applyBuildIdentityToDom();
  renderVisualizer(null, null);
  initializeActiveTab();
});
