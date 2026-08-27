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
  type ExtensionMessage,
  type ExtensionResponse,
  type PrivacyFinding,
  type RawScene,
  type SafeContext,
  type TabInfo,
  type ValidatedAction,
  type VerificationResult,
  createTaskId,
} from '@n-eye/protocol';
import { detectGoalPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { PlannerManager } from '../planner/planner-manager.js';
import { validateActionProposal } from '../authority/validator.js';
import { verifyActionExecution } from '../verification/verifier.js';

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
const stepProtect = document.getElementById('step-protect') as HTMLDivElement;
const stepThink = document.getElementById('step-think') as HTMLDivElement;
const stepThinkStatus = document.getElementById('step-think-status') as HTMLSpanElement;
const stepValidate = document.getElementById('step-validate') as HTMLDivElement;
const stepAct = document.getElementById('step-act') as HTMLDivElement;
const stepVerify = document.getElementById('step-verify') as HTMLDivElement;

const transformLocalItems = document.getElementById('transform-local-items') as HTMLDivElement;
const transformSafeItems = document.getElementById('transform-safe-items') as HTMLDivElement;

const actionVerificationCard = document.getElementById('action-verification-card') as HTMLElement;
const actionProposalText = document.getElementById('action-proposal-text') as HTMLSpanElement;
const actionRiskBadge = document.getElementById('action-risk-badge') as HTMLSpanElement;
const verificationStatusBadge = document.getElementById('verification-status-badge') as HTMLSpanElement;
const verificationDeltaText = document.getElementById('verification-delta-text') as HTMLDivElement;

const latSee = document.getElementById('lat-see') as HTMLSpanElement;
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

const confirmModal = document.getElementById('confirmation-dialog') as HTMLDialogElement;
const modalActionName = document.getElementById('modal-action-name') as HTMLSpanElement;
const modalActionTarget = document.getElementById('modal-action-target') as HTMLSpanElement;
const btnModalConfirm = document.getElementById('btn-modal-confirm') as HTMLButtonElement;
const btnModalCancel = document.getElementById('btn-modal-cancel') as HTMLButtonElement;

// Runtime state
let activeTab: TabInfo | null = null;
let _lastRawScene: RawScene | null = null;
let currentTaskAbortController: AbortController | null = null;
const vault = new PrivateTokenVault();
const plannerManager = new PlannerManager('MOCK', 'http://localhost:8000');

const MAX_STEPS = 8;

function setConnectionStatus(
  status: 'IDLE' | 'CONNECTING' | 'OBSERVING' | 'READY' | 'EXECUTING' | 'UNSUPPORTED' | 'FAILED' | 'CANCELLED',
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

async function requestObservation(tabId: number, retry = true): Promise<RawScene | null> {
  setConnectionStatus('OBSERVING', 'OBSERVING PAGE');
  updatePipelineStep(stepSee, 'active');

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tabId,
      { type: 'OBSERVE_REQUEST' },
      async (response: ExtensionResponse<RawScene>) => {
        if (chrome.runtime.lastError) {
          if (retry) {
            try {
              const injectRes = await chrome.runtime.sendMessage({ type: 'INJECT_CONTENT_SCRIPT', tabId });
              if (injectRes && injectRes.success) {
                setTimeout(() => {
                  requestObservation(tabId, false).then(resolve);
                }, 100);
                return;
              }
            } catch {
              // Ignore injection error
            }
          }

          setConnectionStatus('FAILED', 'CONTENT SCRIPT DISCONNECTED');
          resolve(null);
          return;
        }

        if (!response || !response.success || !response.data) {
          setConnectionStatus('FAILED', 'OBSERVATION FAILED');
          resolve(null);
          return;
        }

        const scene = response.data;
        _lastRawScene = scene;
        coreEpochLabel.textContent = `Epoch ${scene.pageEpoch}`;
        statEpoch.textContent = String(scene.pageEpoch);
        statElementsCount.textContent = String(scene.elements.length);

        setConnectionStatus('READY', 'TRUST LAYER READY');
        updatePipelineStep(stepSee, 'done');
        updatePipelineStep(stepProtect, 'idle');
        resolve(scene);
      }
    );
  });
}

function renderVisualizer(findings: PrivacyFinding[], safeContext: SafeContext): void {
  transformLocalItems.innerHTML = '';
  transformSafeItems.innerHTML = '';

  if (findings.length === 0) {
    transformLocalItems.innerHTML = `<div class="transform-item"><span class="item-tag">PUBLIC</span><span class="item-val">No PII candidates</span></div>`;
    transformSafeItems.innerHTML = `<div class="transform-item"><span class="item-tag token-tag">CLEAN</span><span class="item-desc">Full public context</span></div>`;
    return;
  }

  for (const f of findings.slice(0, 3)) {
    const localItem = document.createElement('div');
    localItem.className = 'transform-item';
    localItem.innerHTML = `<span class="item-tag">${f.privacyClass.replace('SECRET_', '').replace('PII_', '')}</span><span class="item-val">${f.textSpan || f.reason}</span>`;
    transformLocalItems.appendChild(localItem);
  }

  for (const token of safeContext.availableTokens) {
    const safeItem = document.createElement('div');
    safeItem.className = 'transform-item tokenized';
    safeItem.innerHTML = `<span class="item-tag token-tag">${token.tokenSymbol}</span><span class="item-desc">Scoped ${token.privacyClass}</span>`;
    transformSafeItems.appendChild(safeItem);
  }

  const hasPassword = findings.some((f) => f.privacyClass.startsWith('SECRET_'));
  if (hasPassword) {
    const blockedItem = document.createElement('div');
    blockedItem.className = 'transform-item blocked';
    blockedItem.innerHTML = `<span class="item-tag blocked-tag">SECRETS</span><span class="item-desc">NEVER_SEND</span>`;
    transformSafeItems.appendChild(blockedItem);
  }
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

      // 2. PROTECT LOCALLY
      const protectStart = performance.now();
      updatePipelineStep(stepProtect, 'active');
      coreStateLabel.textContent = 'PROTECT';

      const goalFindings = detectGoalPrivacy(rawGoal);
      const combinedFindings = [...preScene.privacyFindings, ...goalFindings];
      statFindingsCount.textContent = String(combinedFindings.length);

      const decisions = evaluatePrivacyPolicy(combinedFindings);

      // Register tokenizable findings into in-memory vault
      for (const d of decisions) {
        if (d.decision === 'TOKENIZE' && d.tokenRole) {
          const matchedFinding = combinedFindings.find((f) => f.findingId === d.findingId);
          const realVal =
            matchedFinding?.textSpan ||
            (d.privacyClass === 'PII_EMAIL' ? 'alice.applicant@example.com' : '+1-555-0199');
          vault.registerToken(
            d.tokenRole,
            d.privacyClass,
            realVal,
            taskId,
            tabId,
            origin,
            ['text', 'textbox', 'email', 'tel']
          );
        }
      }

      statTokensCount.textContent = String(vault.size());

      const safeContext = buildSafeContext(preScene, rawGoal, decisions, vault, taskId);
      if (priorOutcome) {
        safeContext.priorOutcome = priorOutcome;
      }

      // Egress Guard validation & byte scanning
      let serializedBytes: string;
      try {
        serializedBytes = validateSafeContextEgress(safeContext);
        proofCanaryStatus.textContent = 'PASS (0 Secrets Detected)';
        proofCanaryStatus.className = 'proof-val proof-pass';
      } catch (egressErr) {
        proofCanaryStatus.textContent = `BLOCKED: ${(egressErr as Error).message}`;
        proofCanaryStatus.className = 'proof-val proof-fail';
        throw egressErr;
      }

      evidenceSafeContextDump.textContent = JSON.stringify(JSON.parse(serializedBytes), null, 2);
      proofPayloadSize.textContent = `${serializedBytes.length} bytes`;

      const protectDuration = performance.now() - protectStart;
      latProtect.textContent = `${protectDuration.toFixed(1)} ms`;
      updatePipelineStep(stepProtect, 'done');
      renderVisualizer(combinedFindings, safeContext);

      // 3. THINK (MOCK OR REMOTE AI PLANNER)
      const planStart = performance.now();
      updatePipelineStep(stepThink, 'active');
      coreStateLabel.textContent = 'PLAN';

      const planResult = await plannerManager.propose(safeContext, { signal });
      const proposal = planResult.proposal;
      const metadata = planResult.metadata;

      const planDuration = performance.now() - planStart;
      latPlan.textContent = `${(metadata.planningLatencyMs || planDuration).toFixed(1)} ms`;
      proofRequestId.textContent = metadata.requestId;
      proofProviderModel.textContent = `${metadata.provider} (${metadata.model})`;
      updatePipelineStep(stepThink, 'done');

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
        validatedAction = validateActionProposal(proposal, preScene, vault, taskId, origin);
      } catch (err) {
        actionProposalText.textContent = `Rejected: ${(err as Error).message}`;
        updatePipelineStep(stepValidate, 'idle');
        throw err;
      }

      const validateDuration = performance.now() - validateStart;
      latValidate.textContent = `${validateDuration.toFixed(1)} ms`;
      updatePipelineStep(stepValidate, 'done');

      // 5. HIGH-RISK CONFIRMATION GATE
      if (proposal.riskLevel === 'HIGH') {
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
      return;
    }

    unsupportedBanner.classList.add('hidden');
    await requestObservation(activeTab.tabId);
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

    if (!activeTab.isSupported) {
      setConnectionStatus('UNSUPPORTED', 'RESTRICTED PAGE');
      unsupportedReason.textContent = activeTab.unsupportedReason || 'Unsupported browser scheme';
      unsupportedBanner.classList.remove('hidden');
    } else {
      unsupportedBanner.classList.add('hidden');
      requestObservation(activeTab.tabId);
    }
  }
});

// Mount
document.addEventListener('DOMContentLoaded', () => {
  initializeActiveTab();
});
