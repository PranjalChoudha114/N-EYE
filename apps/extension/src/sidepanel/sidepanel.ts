import {
  type ExtensionMessage,
  type ExtensionResponse,
  type PrivacyFinding,
  type RawScene,
  type SafeContext,
  type TabInfo,
  type ValidatedAction,
  type ActionProposal,
  type VerificationResult,
  createTaskId,
} from '@n-eye/protocol';
import { detectGoalPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';
import { validateActionProposal } from '../authority/validator.js';
import { verifyActionExecution } from '../verification/verifier.js';

// Elements
const connectionPill = document.getElementById('connection-pill') as HTMLDivElement;
const connectionText = document.getElementById('connection-text') as HTMLSpanElement;
const targetOrigin = document.getElementById('target-origin') as HTMLDivElement;
const targetTitle = document.getElementById('target-title') as HTMLDivElement;
const unsupportedBanner = document.getElementById('unsupported-banner') as HTMLDivElement;
const unsupportedReason = document.getElementById('unsupported-reason') as HTMLDivElement;

const coreStateLabel = document.getElementById('core-state-label') as HTMLSpanElement;
const coreEpochLabel = document.getElementById('core-epoch-label') as HTMLSpanElement;

const taskGoalInput = document.getElementById('task-goal-input') as HTMLInputElement;
const btnRunLoop = document.getElementById('btn-run-loop') as HTMLButtonElement;

const stepSee = document.getElementById('step-see') as HTMLDivElement;
const stepProtect = document.getElementById('step-protect') as HTMLDivElement;
const stepThink = document.getElementById('step-think') as HTMLDivElement;
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
const evidenceSafeContextDump = document.getElementById('evidence-safecontext-dump') as HTMLElement;

const confirmModal = document.getElementById('confirmation-dialog') as HTMLDialogElement;
const modalActionName = document.getElementById('modal-action-name') as HTMLSpanElement;
const modalActionTarget = document.getElementById('modal-action-target') as HTMLSpanElement;
const btnModalConfirm = document.getElementById('btn-modal-confirm') as HTMLButtonElement;
const btnModalCancel = document.getElementById('btn-modal-cancel') as HTMLButtonElement;

// Runtime state
let activeTab: TabInfo | null = null;
let _lastRawScene: RawScene | null = null;
let _lastSafeContext: SafeContext | null = null;
let _lastFindings: PrivacyFinding[] = [];
const vault = new PrivateTokenVault();
const planner = new DeterministicPlanner();

function setConnectionStatus(status: 'IDLE' | 'CONNECTING' | 'OBSERVING' | 'READY' | 'EXECUTING' | 'UNSUPPORTED' | 'FAILED', labelText?: string): void {
  connectionPill.className = `status-pill status-${status.toLowerCase()}`;
  connectionText.textContent = labelText || status;
  coreStateLabel.textContent = status;
}

function updatePipelineStep(stepEl: HTMLDivElement, state: 'idle' | 'active' | 'done'): void {
  stepEl.classList.remove('step-idle', 'step-active', 'step-done');
  stepEl.classList.add(`step-${state}`);
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
            // Attempt automatic programmatic content script injection
            try {
              const injectRes = await chrome.runtime.sendMessage({ type: 'INJECT_CONTENT_SCRIPT', tabId });
              if (injectRes && injectRes.success) {
                // Retry observation once after injection
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

async function executeClosedTrustLoop(): Promise<void> {
  if (!activeTab || !activeTab.isSupported) return;
  const currentTab = activeTab;
  const tabId = currentTab.tabId;
  const origin = currentTab.origin;

  const taskId = createTaskId(`task_${Date.now()}`);
  const rawGoal = taskGoalInput.value.trim() || 'Enter my email and continue';
  resetTokenCounters();
  vault.clear();
  btnRunLoop.disabled = true;

  const startTime = performance.now();

  // 1. SEE LOCALLY
  updatePipelineStep(stepSee, 'active');
  const preScene = await requestObservation(tabId);
  const seeDuration = performance.now() - startTime;
  latSee.textContent = `${seeDuration.toFixed(1)} ms`;
  updatePipelineStep(stepSee, 'done');

  if (!preScene) {
    btnRunLoop.disabled = false;
    return;
  }

  // 2. PROTECT LOCALLY
  const protectStart = performance.now();
  updatePipelineStep(stepProtect, 'active');
  coreStateLabel.textContent = 'PROTECT';

  const goalFindings = detectGoalPrivacy(rawGoal);
  const combinedFindings = [...preScene.privacyFindings, ...goalFindings];
  _lastFindings = combinedFindings;
  statFindingsCount.textContent = String(combinedFindings.length);

  const decisions = evaluatePrivacyPolicy(combinedFindings);

  // Register detected tokenizable values into PrivateTokenVault
  for (const d of decisions) {
    if (d.decision === 'TOKENIZE' && d.tokenRole) {
      const matchedFinding = combinedFindings.find((f) => f.findingId === d.findingId);
      const realVal = matchedFinding?.textSpan || (d.privacyClass === 'PII_EMAIL' ? 'alice.applicant@example.com' : '+1-555-0199');
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
  _lastSafeContext = safeContext;

  // Egress Guard validation
  const serializedBytes = validateSafeContextEgress(safeContext);
  evidenceSafeContextDump.textContent = JSON.stringify(JSON.parse(serializedBytes), null, 2);

  const protectDuration = performance.now() - protectStart;
  latProtect.textContent = `${protectDuration.toFixed(1)} ms`;
  updatePipelineStep(stepProtect, 'done');
  renderVisualizer(combinedFindings, safeContext);

  // 3. THINK (DETERMINISTIC PLANNER)
  const planStart = performance.now();
  updatePipelineStep(stepThink, 'active');
  coreStateLabel.textContent = 'PLAN';

  const proposal: ActionProposal = planner.proposeAction(safeContext);
  const planDuration = performance.now() - planStart;
  latPlan.textContent = `${planDuration.toFixed(1)} ms`;
  updatePipelineStep(stepThink, 'done');

  actionVerificationCard.classList.remove('hidden');
  actionProposalText.textContent = `${proposal.type} ${proposal.targetId ? `(target: ${proposal.targetId})` : ''}`;
  actionRiskBadge.textContent = proposal.riskLevel;
  actionRiskBadge.className = `risk-badge risk-${proposal.riskLevel.toLowerCase()}`;

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
    btnRunLoop.disabled = false;
    return;
  }

  const validateDuration = performance.now() - validateStart;
  latValidate.textContent = `${validateDuration.toFixed(1)} ms`;
  updatePipelineStep(stepValidate, 'done');

  // Confirmation gate for high-risk actions
  if (proposal.riskLevel === 'HIGH') {
    modalActionName.textContent = proposal.type;
    modalActionTarget.textContent = proposal.targetId || 'Form Submit';
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

    if (!confirmed) {
      actionProposalText.textContent = 'Action cancelled by user';
      btnRunLoop.disabled = false;
      return;
    }
  }

  // 5. ACT LOCALLY
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
    btnRunLoop.disabled = false;
    return;
  }

  // 6. VERIFY LOCALLY
  const verifyStart = performance.now();
  updatePipelineStep(stepVerify, 'active');
  coreStateLabel.textContent = 'VERIFY';

  // Wait 100ms for DOM mutation to settle and re-observe
  await new Promise((r) => setTimeout(r, 100));
  const postScene = await requestObservation(tabId, false);

  if (postScene) {
    const verification: VerificationResult = verifyActionExecution(validatedAction, preScene, postScene);
    verificationStatusBadge.textContent = verification.status === 'VERIFIED_SUCCESS' ? 'VERIFIED' : 'FAILED';
    verificationStatusBadge.className = `verify-badge verify-${verification.status === 'VERIFIED_SUCCESS' ? 'success' : 'failure'}`;
    verificationDeltaText.textContent = verification.observedDelta;
  }

  const verifyDuration = performance.now() - verifyStart;
  latVerify.textContent = `${verifyDuration.toFixed(1)} ms`;
  updatePipelineStep(stepVerify, 'done');

  const totalDuration = performance.now() - startTime;
  latTotal.textContent = `${totalDuration.toFixed(1)} ms`;

  setConnectionStatus('READY', 'LOOP COMPLETE');
  btnRunLoop.disabled = false;
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
  } catch {
    setConnectionStatus('FAILED', 'CONNECTION ERROR');
  }
}

// Event Listeners
btnRunLoop.addEventListener('click', () => {
  executeClosedTrustLoop();
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
