/**
 * Trust-loop coordinator (Zone 3).
 * OWNS: Observe → perceive → protect → plan → validate → confirm → act → verify.
 * TRUST: The overlay is a view. This module holds the vault in the Side Panel document's memory.
 * MUST NOT: Persist vault values, put secrets in ProductState, or render HTML.
 */

import {
  type ContentScriptErrorClass,
  type ContentScriptHello,
  type ElementId,
  type FieldValueState,
  type PerceptionResult,
  type PrivacyFinding,
  type RawScene,
  type SafeContext,
  type SecurityReasonCode,
  type TabInfo,
  type ValidatedAction,
  type VerificationResult,
  CONTENT_SCRIPT_PROTOCOL,
  createActionId,
  createTaskId,
} from '@n-eye/protocol';
import { detectGoalPrivacy, detectOcrTextPrivacy } from '../privacy/detectors.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { tokenizeDecisionsWithValues } from '../privacy/token-values.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';
import { PlannerManager } from '../planner/planner-manager.js';
import type { GatewayHealth, PlannerMode } from '../planner/types.js';
import { PLANNER_MAX_ATTEMPTS } from '../planner/transport-error.js';
import { validateActionProposal, ActionValidationError } from '../authority/validator.js';
import {
  buildConfirmationBinding,
  ConfirmationBroker,
  retargetProposalToApprovedBinding,
  verifyConfirmationBinding,
} from '../authority/confirmation.js';
import { SecurityLog } from '../authority/security-log.js';
import { verifyActionExecution, verificationShowsNavigation, safeUrlEvidence } from '../verification/verifier.js';
import { shouldStopAfterUnverifiedHighRisk } from '../verification/idempotency.js';
import {
  beginRecoveryBudget,
  identicalFailureKey,
  shouldAbstainAfterFailure,
} from '../intelligence/recovery-policy.js';
import { applyFusionLabels, runPerception } from '../perception/index.js';
import type { OcrEngine } from '../perception/ocr-engine.js';
import {
  AssuranceBus,
  blockedState,
  buildAdvisoryRecommendations,
  buildPrivacyReceipt,
  disconnectedObservationState,
  emptyVisualizerModel,
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
} from './content-connection.js';
import { classifySupportedUrl } from './supported-url.js';
import { classifyPlannerFailure, statusCopy } from '../ui/status-map.js';
import { buildAskUserView } from '../ui/ask-user.js';
import { buildPrivacySummary } from '../ui/privacy-summary.js';
import { mapReceiptView } from '../ui/receipt-map.js';
import { toastFromEvent, toastFromPhase } from '../ui/notification-map.js';
import { describeAction } from '../ui/action-copy.js';
import { ENGINE_FAILURE_HUMAN, MISSING_TARGET_HUMAN, isEngineExceptionText } from '../ui/human-copy.js';
import {
  createIdleState,
  emptyEvidence,
  emptyValidation,
  idlePipeline,
  isTerminalOutcome,
  markSessionInterrupted,
  mergeActionView,
  stripQuery,
  type PipelineId,
  type ProductState,
} from './ui-snapshot.js';
import { EvidenceLedger } from './evidence-ledger.js';
import { buildVerifiedTaskReport } from './task-report.js';
import { delay, executeOnTab, probeFieldOnTab, type PagePorts } from './page-ports.js';
import { abortableDelay } from './abortable-delay.js';
import {
  arbitratePlannerComplete,
  completedStageContradiction,
  pipelineForAlreadySatisfied,
  pipelineForUnprovenComplete,
  pipelineForVerifiedCompletion,
} from './completion-arbiter.js';
import { parseMockGoal, pickUniqueTypeTextTarget } from '../planner/mock-grammar.js';
import { interpretGoal, scoreLabelAgainstHints } from '../intelligence/goal-interpreter.js';
import { evaluateLearningEligibility, getNalisMemory } from '../intelligence/memory.js';
import { beginForensicTrace, getForensicTrace, humanHealthLine, snapshotNalisHealth } from '../intelligence/forensic.js';

export const MAX_STEPS = 8;
export const WAIT_SETTLE_MS = 400;

function sceneOutcomeHay(scene: RawScene): string {
  return `${safeUrlEvidence(scene.url)} ${scene.title || ''}`;
}

export interface TrustLoopDeps {
  ports: PagePorts;
  planner: PlannerManager;
  ocr: OcrEngine;
  vault?: PrivateTokenVault;
  delayFn?: (ms: number) => Promise<void>;
}

type Listener = (state: ProductState) => void;

export class TrustLoopController {
  private readonly ports: PagePorts;
  private readonly planner: PlannerManager;
  private readonly ocr: OcrEngine;
  private readonly vault: PrivateTokenVault;
  private readonly wait: (ms: number) => Promise<void>;
  private readonly listeners = new Set<Listener>();
  private readonly recoveryExhausted = new Set<string>();
  private readonly assuranceBus = new AssuranceBus();
  private readonly confirmations = new ConfirmationBroker();
  private readonly securityLog = new SecurityLog();
  private readonly ledger = new EvidenceLedger();
  private state: ProductState = createIdleState();
  private tab: TabInfo | null = null;
  private abort: AbortController | null = null;
  private observeGeneration = 0;
  private taskGeneration = 0;
  private lastHostname: string | null = null;
  private confirmWait: { confirmationId: string; resolve: (approved: boolean) => void } | null = null;
  private completionAlreadySatisfied = false;

  constructor(deps: TrustLoopDeps) {
    this.ports = deps.ports;
    this.planner = deps.planner;
    this.ocr = deps.ocr;
    this.vault = deps.vault ?? new PrivateTokenVault();
    const innerWait = deps.delayFn ?? delay;
    this.wait = (ms) => abortableDelay(ms, this.abort?.signal, innerWait);
    this.state.plannerMode = this.planner.getMode();
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getState(): ProductState {
    return this.state;
  }

  public getVaultSize(): number {
    return this.vault.size();
  }

  public setMode(mode: PlannerMode): void {
    this.planner.setMode(mode);
    this.patch({ plannerMode: mode });
    void this.refreshGateway();
  }

  public setGoal(goal: string): void {
    this.patch({ goal });
  }

  public hydrate(snapshot: ProductState): void {
    // WHY: Reopen must reconstruct the last serializable snapshot. Vault is gone with the old document.
    let next: ProductState = {
      ...snapshot,
      running: false,
      canCancel: false,
      confirmation: undefined,
    };
    if (snapshot.running || snapshot.phase === 'AWAITING_CONFIRMATION') {
      next = markSessionInterrupted(
        next,
        'The N-Eye Trust Center closed. The in-flight task was stopped.'
      );
    }
    this.state = next;
    this.lastHostname = next.siteHostname || null;
    this.emit();
  }

  public bindTab(tab: TabInfo): void {
    const hostname = siteChangeHostname(tab.url, tab.origin, tab.isSupported);
    // WHY: T011 cleared live evidence on every TAB_CHANGED so tab B cannot inherit A's receipt.
    if (this.tab !== null) {
      this.clearLiveEvidence();
    }
    // An open approval must not survive a tab or origin change.
    if (this.tab !== null && (this.tab.tabId !== tab.tabId || this.tab.origin !== tab.origin)) {
      this.confirmations.invalidate();
      if (this.confirmWait) {
        this.confirmWait.resolve(false);
        this.confirmWait = null;
      }
      if (this.state.running) {
        this.abort?.abort();
        this.taskGeneration += 1;
      }
    }
    this.tab = tab;
    const siteEvent = maybeSiteChangeEvent(
      this.assuranceBus,
      this.lastHostname,
      tab.url,
      tab.origin,
      tab.isSupported
    );
    this.lastHostname = hostname;
    this.patch({
      siteHostname: hostname,
      siteTitle: tab.title || '',
      supported: tab.isSupported,
      unsupportedReason: tab.unsupportedReason,
      tabId: tab.tabId,
      origin: tab.origin,
      url: stripQuery(tab.url),
    });
    if (siteEvent && !this.state.running) {
      // Site identity updates in-place. Observation/site-change is not a toast.
    }
  }

  public async refreshGateway(): Promise<GatewayHealth | null> {
    if (this.planner.getMode() === 'MOCK') {
      this.patch({
        plannerMode: 'MOCK',
        gatewayReachable: null,
        evidence: {
          ...this.state.evidence,
          plannerMode: 'MOCK (Deterministic)',
          provider: this.state.lastPlannerProvider || '—',
          model: this.state.lastPlannerModel || '—',
        },
      });
      return null;
    }
    const health = await this.planner.checkGatewayHealth();
    this.patch({
      plannerMode: 'REMOTE',
      gatewayReachable: health.healthy,
      evidence: {
        ...this.state.evidence,
        plannerMode: health.healthy
          ? health.provider === 'mock'
            ? 'REMOTE (Server Mock)'
            : 'REMOTE (gateway reachable)'
          : 'REMOTE (gateway unreachable)',
      },
    });
    return health;
  }

  public async idleObserve(): Promise<void> {
    if (!this.tab) return;
    if (!this.tab.isSupported) {
      const view = unsupportedState(this.tab.unsupportedReason || 'This page cannot be observed.');
      this.applyPhase('UNSUPPORTED', view.detail);
      this.patch({ canRun: false, contentScriptHealth: 'UNSUPPORTED' });
      return;
    }
    const scene = await this.requestObservation(this.tab.tabId, true);
    if (this.state.running) return;
    if (!scene) {
      const view = disconnectedObservationState();
      if (this.state.phase !== 'UNSUPPORTED') {
        this.applyPhase(this.state.contentScriptHealth === 'UNSUPPORTED' ? 'UNSUPPORTED' : 'DISCONNECTED', view.detail);
      }
      this.patch({ canRun: false });
      return;
    }
    const classes = scene.privacyFindings.map((f) => f.privacyClass);
    const view = localMonitoringState(classes);
    this.applyPhase('READY', view.detail);
    this.patch({ canRun: true });
    await this.refreshGateway();
  }

  public cancel(): void {
    this.taskGeneration += 1;
    this.abort?.abort();
    this.confirmations.invalidate();
    if (this.confirmWait) {
      this.confirmWait.resolve(false);
      this.confirmWait = null;
    }
    // ASK_USER is already terminal. Cancel here dismisses clarification, it does not deny a capability.
    if (!this.state.running && this.state.phase === 'ASK_USER') {
      this.dismissAskUser();
    }
  }

  /**
   * Clarification recovery. TRUST: never mints confirmation or executes a stale proposal.
   */
  private dismissAskUser(): void {
    this.applyPhase('READY', 'Looking at this page on your device. No new AI request was sent.');
    this.patch({
      askUser: null,
      confirmation: undefined,
      toast: null,
      canRun: Boolean(this.tab?.isSupported && this.state.contentScriptHealth === 'READY'),
      canCancel: false,
    });
  }

  /**
   * Enter ASK_USER with human copy and a rewrite/continue path.
   * TRUST: confirmation stays empty. Continue later calls start() → fresh observe/validate.
   */
  private enterAskUser(detail: string, extra?: Partial<ProductState>): void {
    const view = buildAskUserView(detail);
    if (view.reason === 'TARGET_NOT_FOUND' || view.reason === 'NO_SUPPORTED_ACTION') {
      this.ledger.record('TARGET_NOT_FOUND', 'TARGET MATCHING', view.reason);
    }
    if (view.reason === 'PARTIAL_GOAL' || view.reason === 'SEARCH_SUBMIT_MISSING') {
      this.ledger.record('PARTIAL_OUTCOME', 'OUTCOME VERIFICATION', view.reason);
    }
    if (view.reason === 'ENGINE_FAILURE') {
      this.ledger.record('TASK_FAILED', 'SYSTEM LIFECYCLE', 'engine-exception');
    }
    this.applyPhase('ASK_USER', view.message);
    this.patch({
      askUser: view,
      confirmation: undefined,
      toast: toastFromPhase('ASK_USER', view.message),
      ...extra,
    });
  }

  /**
   * Records a human answer to the pending confirmation capability.
   *
   * TRUST: `approved` alone is not authority. The answer must name the pending confirmationId,
   *        and the grant is still re-verified against freshly observed page state before execute.
   * WHY optional id: local trusted callers (the Side Panel buttons) may omit it; the broker then
   *        answers only the single pending request. A supplied id that does not match is refused,
   *        so a replayed or fabricated id cannot answer on the user's behalf.
   */
  public confirm(approved: boolean, confirmationId?: string): void {
    const wait = this.confirmWait;
    if (!wait) return;
    const id = confirmationId ?? wait.confirmationId;
    const resolution = this.confirmations.resolve(id, approved);
    if (!resolution.ok) {
      this.securityLog.record({
        reasonCode: resolution.reasonCode ?? 'UNTRUSTED_AUTHORITY_CLAIM',
        detail: resolution.reason ?? 'Confirmation answer refused.',
      });
      this.patch({ evidence: { ...this.state.evidence, securityReason: resolution.reasonCode ?? 'UNTRUSTED_AUTHORITY_CLAIM' } });
      return;
    }
    this.confirmWait = null;
    this.patch({ confirmation: undefined });
    wait.resolve(approved);
  }

  public getSecurityEvents(): ReturnType<SecurityLog['list']> {
    return this.securityLog.list();
  }

  public async start(goal?: string): Promise<void> {
    if (!this.tab || !this.tab.isSupported || this.state.running) return;
    await this.executeClosedTrustLoop(goal ?? this.state.goal);
  }

  private emit(): void {
    const snapshot = this.state;
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  private patch(partial: Partial<ProductState>): void {
    this.state = { ...this.state, ...partial };
    this.emit();
  }

  private applyPhase(phase: ProductState['phase'], detail?: string): void {
    const copy = statusCopy(phase, detail);
    this.patch({
      phase,
      headline: copy.headline,
      message: copy.message,
      tone: copy.tone,
    });
  }

  /**
   * Local completion truth. Planner COMPLETE and empty loops cannot author this.
   * WHY: Green Completed with pending ACT/VERIFY was a trust contradiction.
   */
  private applyLocalCompletion(decision: ReturnType<typeof arbitratePlannerComplete>, step: number): void {
    this.completionAlreadySatisfied = decision.alreadySatisfied;
    if (decision.phase === 'COMPLETED') {
      this.patch({
        pipeline: decision.alreadySatisfied
          ? pipelineForAlreadySatisfied(this.state.pipeline)
          : pipelineForVerifiedCompletion(this.state.pipeline),
      });
      if (completedStageContradiction('COMPLETED', this.state.pipeline, decision.alreadySatisfied)) {
        this.patch({ pipeline: pipelineForUnprovenComplete(this.state.pipeline) });
        this.enterAskUser('Completion evidence was inconsistent with VALIDATE/ACT/VERIFY. This is not success.');
        return;
      }
      this.applyPhase('COMPLETED', decision.message);
      this.ledger.record('OUTCOME_VERIFIED', 'OUTCOME VERIFICATION', decision.kind, { status: 'VERIFIED' });
      this.patch({
        toast: toastFromPhase(
          'COMPLETED',
          decision.alreadySatisfied ? decision.message : 'Task completed.'
        ),
        step: {
          index: step,
          max: MAX_STEPS,
          summary: decision.alreadySatisfied ? decision.message : 'Task completed successfully.',
        },
        evidence: {
          ...this.state.evidence,
          verificationResult: decision.alreadySatisfied ? 'ALREADY_SATISFIED' : 'VERIFIED_SUCCESS',
          ...this.nalisEvidenceFields(),
        },
        action: this.state.action
          ? {
              ...this.state.action,
              verification: 'VERIFIED_SUCCESS',
              verificationDelta: decision.message,
            }
          : this.state.action,
      });
      if (!decision.alreadySatisfied) {
        getForensicTrace()?.append('VERIFICATION_COMPLETED', 'local arbiter VERIFIED_SEQUENCE');
        this.maybeLearnVerifiedPreference();
      }
      return;
    }
    this.patch({ pipeline: pipelineForUnprovenComplete(this.state.pipeline) });
    this.ledger.record('PARTIAL_OUTCOME', 'OUTCOME VERIFICATION', decision.kind);
    this.enterAskUser(decision.message, {
      step: { index: step, max: MAX_STEPS, summary: decision.message },
      action: this.state.action
        ? { ...this.state.action, verification: 'AMBIGUOUS', verificationDelta: decision.message }
        : this.state.action,
    });
  }

  private nalisEvidenceFields(): Pick<
    ProductState['evidence'],
    'nalisVersion' | 'nalisHealth' | 'memoryCount' | 'learningEnabled'
  > {
    const health = snapshotNalisHealth();
    return {
      nalisVersion: health.version,
      nalisHealth: humanHealthLine(health),
      memoryCount: getNalisMemory().size(),
      learningEnabled: getNalisMemory().isEnabled(),
    };
  }

  private isMissingTargetFailure(err: unknown): boolean {
    if (!(err instanceof ActionValidationError)) return false;
    if (err.reasonCode !== 'INVALID_TARGET') return false;
    return /was not found|requires a targetId/i.test(err.message);
  }

  private sealTaskReport(taskId: string): void {
    if (this.state.running) return;
    if (!isTerminalOutcome(this.state.phase) && this.state.phase !== 'COMPLETED') return;
    this.ledger.record('REPORT_VERIFIED', 'REPORT GENERATION', `result-phase=${this.state.phase}`);
    let buildId = '—';
    try {
      buildId = chrome.runtime.getManifest().version_name || '—';
    } catch {
      buildId = '—';
    }
    const report = buildVerifiedTaskReport({
      state: this.state,
      ledger: this.ledger,
      taskId,
      buildId,
    });
    this.patch({ taskReport: report });
  }

  /**
   * Learn only possessive resource preferences after local verification.
   * TRUST: Page/Remote text never enters this path. Risk/confirmation cannot be stored.
   */
  private maybeLearnVerifiedPreference(): void {
    const interpreted = interpretGoal(this.state.goal || '');
    if (interpreted.preferenceHint !== 'POSSESSIVE_RESOURCE') return;
    const label = this.state.action?.targetLabel || '';
    if (!label || /^e\d+$/i.test(label) || /\b(delete|remove|confirm|allow|submit|password)\b/i.test(label)) {
      getForensicTrace()?.append('LEARNING_BLOCKED', 'unsafe-or-empty-label');
      return;
    }
    const verdict = evaluateLearningEligibility({
      locallyVerified: true,
      plannerClaimedComplete: false,
      userCorrected: false,
      userReversed: false,
      source: 'VERIFIED_TASK_OUTCOME',
      privacyBlocked: false,
    });
    const stored = getNalisMemory().record({
      verdict,
      generalizedGoal: 'possessive-resource',
      generalizedIntent: interpreted.family,
      originScope: this.state.origin || this.state.siteHostname || '',
      semanticUiPattern: 'OPEN_RESOURCE',
      successfulStrategy: label.slice(0, 80),
    });
    getForensicTrace()?.append(stored ? 'MEMORY_UPDATED' : 'LEARNING_BLOCKED', stored ? stored.id : verdict.reason);
  }

  private setPipeline(id: PipelineId, visual: ProductState['pipeline'][PipelineId]): void {
    this.patch({ pipeline: { ...this.state.pipeline, [id]: visual } });
  }

  /**
   * Single exit for security refusals.
   * WHY: A failure must never widen authority. This drops any pending approval, records a
   *      reason code, and shows the user a truthful block — it never retries with more context.
   * PRIVACY: `detail` is scrubbed by SecurityLog. Attack payloads are not surfaced verbatim.
   */
  private failClosed(reasonCode: SecurityReasonCode, detail: string, actionType?: string, targetId?: string): void {
    this.confirmations.invalidate();
    const event = this.securityLog.record({ reasonCode, detail, actionType, targetId });
    this.applyPhase('BLOCKED', detail);
    this.patch({
      confirmation: undefined,
      toast: toastFromEvent({
        kind: 'BLOCKED',
        hostname: this.state.siteHostname,
        message: `Action blocked. ${event.detail}`,
        severity: 'warning',
        dedupeKey: `blocked-sec:${reasonCode}:${event.timestamp}`,
        timestamp: event.timestamp,
      }),
      action: mergeActionView(this.state.action, {
        blockedReason: event.detail,
        securityReason: reasonCode,
        validation: this.state.action?.validation ?? {
          targetCurrent: false,
          frameCurrent: false,
          pageCurrent: true,
          tokenScopeValid: false,
          riskPolicy: reasonCode,
        },
      }),
      evidence: { ...this.state.evidence, securityReason: reasonCode, validationResult: reasonCode },
    });
  }

  private clearLiveEvidence(): void {
    this.patch({
      privacySummary: null,
      visualizer: emptyVisualizerModel(),
      receipt: undefined,
      receiptView: undefined,
      action: undefined,
      confirmation: undefined,
      advisories: [],
      evidence: {
        ...emptyEvidence(this.state.contentScriptHealth),
        plannerMode: this.state.evidence.plannerMode,
      },
    });
  }

  private async requestObservation(tabId: number, allowRecovery = true): Promise<RawScene | null> {
    const generation = ++this.observeGeneration;
    this.applyPhase(this.state.running ? this.state.phase : 'OBSERVING');
    if (!this.state.running) this.setPipeline('SEE', 'active');

    const applyScene = (scene: RawScene): RawScene => {
      this.recoveryExhausted.delete(`${tabId}:${this.tab?.url || ''}`);
      this.patch({
        contentScriptHealth: 'READY',
        evidence: {
          ...this.state.evidence,
          pageEpoch: Number(scene.pageEpoch),
          observedControls: scene.elements.length,
          contentScriptHealth: 'READY',
          frameNote: scene.inaccessibleFrames?.length
            ? `${scene.inaccessibleFrames.length} inaccessible frame(s)`
            : 'Top document',
        },
      });
      if (!this.state.running) {
        this.setPipeline('SEE', 'done');
      }
      return scene;
    };

    const failDisconnected = (errorClass: ContentScriptErrorClass): null => {
      const health = errorClass === 'UNSUPPORTED_URL' ? 'UNSUPPORTED' : 'DISCONNECTED';
      this.patch({ contentScriptHealth: health });
      if (!this.state.running) {
        this.applyPhase(health === 'UNSUPPORTED' ? 'UNSUPPORTED' : 'DISCONNECTED', disconnectedLabel(errorClass));
        this.setPipeline('SEE', 'pending');
      }
      return null;
    };

    const ping = await this.ports.send<ContentScriptHello>(tabId, { type: 'PING' });
    if (generation !== this.observeGeneration) return null;

    if (ping.ok) {
      if (ping.data.contentProtocol !== CONTENT_SCRIPT_PROTOCOL) {
        return failDisconnected('VERSION_MISMATCH');
      }
      const observed = await this.ports.send<RawScene>(tabId, { type: 'OBSERVE_REQUEST' });
      if (generation !== this.observeGeneration) return null;
      if (observed.ok) return applyScene(observed.data);
      this.patch({ contentScriptHealth: 'DISCONNECTED' });
      return null;
    }

    if (!allowRecovery) {
      return failDisconnected(classifySendMessageError(ping.lastError));
    }

    const url = this.tab?.url || '';
    const exhaustedKey = `${tabId}:${url}`;
    if (this.recoveryExhausted.has(exhaustedKey)) {
      return failDisconnected('INJECTION_FAILED');
    }

    const supported = classifySupportedUrl(url).isSupported && Boolean(this.tab?.isSupported);
    const errorClass = classifySendMessageError(ping.lastError);
    const decision = decideRecovery({ urlSupported: supported, injectAttempts: 0, errorClass });
    if (decision.action === 'UNSUPPORTED') {
      this.patch({ contentScriptHealth: 'UNSUPPORTED' });
      this.applyPhase('UNSUPPORTED', 'RESTRICTED PAGE');
      return null;
    }
    if (decision.action !== 'INJECT') {
      this.recoveryExhausted.add(exhaustedKey);
      return failDisconnected(errorClass);
    }

    this.patch({ contentScriptHealth: 'INJECTING' });
    this.applyPhase('RECOVERING', 'RECOVERING CONTENT SCRIPT');

    const injectOk = await this.ports.inject(tabId);
    if (generation !== this.observeGeneration) return null;
    if (!injectOk) {
      this.recoveryExhausted.add(exhaustedKey);
      return failDisconnected('INJECTION_FAILED');
    }

    const hello = await this.waitForHandshake(tabId, generation);
    if (generation !== this.observeGeneration) return null;
    if (!hello) {
      this.recoveryExhausted.add(exhaustedKey);
      return failDisconnected('TIMEOUT');
    }
    if (hello.contentProtocol !== CONTENT_SCRIPT_PROTOCOL) {
      this.recoveryExhausted.add(exhaustedKey);
      return failDisconnected('VERSION_MISMATCH');
    }

    const observed = await this.ports.send<RawScene>(tabId, { type: 'OBSERVE_REQUEST' });
    if (generation !== this.observeGeneration) return null;
    if (observed.ok) return applyScene(observed.data);
    this.recoveryExhausted.add(exhaustedKey);
    return failDisconnected(classifySendMessageError(observed.lastError));
  }

  private async waitForHandshake(tabId: number, generation: number): Promise<ContentScriptHello | null> {
    const deadline = Date.now() + HANDSHAKE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (generation !== this.observeGeneration) return null;
      const ping = await this.ports.send<ContentScriptHello>(tabId, { type: 'PING' });
      if (ping.ok) return ping.data;
      await this.wait(HANDSHAKE_POLL_MS);
    }
    return null;
  }

  private async executeClosedTrustLoop(rawGoalInput: string): Promise<void> {
    const currentTab = this.tab;
    if (!currentTab?.isSupported) return;
    const tabId = currentTab.tabId;
    const origin = currentTab.origin;
    const rawGoal = rawGoalInput.trim() || 'Enter my email and continue';

    resetTokenCounters();
    this.vault.clear();
    this.planner.reset();
    this.clearLiveEvidence();
    const trace = beginForensicTrace();
    const parsed = interpretGoal(rawGoal);
    const taskId = createTaskId(`task_${Date.now()}`);
    this.ledger.begin(taskId);
    this.ledger.record('TASK_RECEIVED', 'USER INTENT', `goal-len=${rawGoal.length}`);
    this.ledger.record('TASK_UNDERSTOOD', 'USER INTENT', `family=${parsed.family}`);
    this.ledger.record('LOCAL_INTELLIGENCE_USED', 'TASK PLANNING', 'deterministic interpreter');
    trace.append('GOAL_PARSED', `${parsed.family} conf=${parsed.confidence.toFixed(2)}`);
    trace.append('TASKGRAPH_CREATED', `subgoals=${parsed.subgoals.length}`);

    this.abort = new AbortController();
    const signal = this.abort.signal;
    const taskGeneration = ++this.taskGeneration;
    this.completionAlreadySatisfied = false;

    this.patch({
      running: true,
      canRun: false,
      canCancel: true,
      goal: rawGoal,
      pipeline: idlePipeline(),
      toast: null,
      askUser: null,
      taskReport: null,
    });

    let priorOutcome: SafeContext['priorOutcome'] | undefined;
    const executedProposals: string[] = [];
    const loopStart = performance.now();
    let verifiedCount = 0;
    let lastVerifiedType: string | undefined;
    let lastFieldState: FieldValueState | undefined;
    let verifiedClick = false;
    let verifiedSearchOutcome = false;
    let verifiedResourceOpen = false;
    let outcomeEvidenceHay = '';
    let lastFailureKey: string | null = null;
    let identicalFailCount = 0;
    let remainingRetryBudget = beginRecoveryBudget();

    try {
      for (let step = 1; step <= MAX_STEPS; step++) {
        if (signal.aborted) {
          throw new DOMException('Task cancelled by user.', 'AbortError');
        }

        this.patch({
          step: { index: step, max: MAX_STEPS, summary: `Executing step ${step}...` },
        });

        const seeStart = performance.now();
        this.setPipeline('SEE', 'active');
        this.applyPhase('OBSERVING', 'Reading this page on your device.');
        const preScene = await this.requestObservation(tabId);
        this.patch({
          latency: { ...this.state.latency, see: `${(performance.now() - seeStart).toFixed(1)} ms` },
        });
        this.setPipeline('SEE', 'done');
        if (!preScene) {
          throw new Error('Failed to observe active page state.');
        }
        this.ledger.record('PAGE_OBSERVED', 'PAGE OBSERVATION', `controls=${preScene.elements.length}`, {
          durationMs: performance.now() - seeStart,
        });
        outcomeEvidenceHay = sceneOutcomeHay(preScene);
        const pageHay = preScene.elements
          .map((el) => `${el.ariaLabel || ''} ${el.innerTextCandidate || ''} ${el.regionHeading || ''}`)
          .join(' ');
        if (/system\s*:|ignore n-eye|already (approved|confirmed)|skip confirmation/i.test(pageHay)) {
          this.ledger.record('UNTRUSTED_INPUT', 'PAGE OBSERVATION', 'policy-like page text treated as data only', {
            provenance: 'UNTRUSTED_PAGE',
          });
        }

        this.setPipeline('PERCEIVE', 'active');
        this.applyPhase('PERCEIVING');
        this.patch({ perceiveLabel: '…' });
        const perception: PerceptionResult = await runPerception({
          scene: preScene,
          engine: this.ocr,
          capture: (rois) => this.ports.captureRois(tabId, rois),
          goal: rawGoal,
          origin,
          signal,
        });
        this.patch({
          latency: {
            ...this.state.latency,
            perceive: perception.invoked ? `${perception.timings.totalMs.toFixed(1)} ms` : 'skipped',
          },
        });

        if (perception.fallback === 'CANCELLED' || signal.aborted || taskGeneration !== this.taskGeneration) {
          throw new DOMException('Task cancelled by user.', 'AbortError');
        }

        if (perception.fallback === 'PAGE_CHANGED') {
          this.setPipeline('PERCEIVE', 'pending');
          this.patch({ perceiveLabel: 'STALE' });
          throw new Error('Page changed during visual perception. Re-perceive required.');
        }

        let workingScene = preScene;
        if (perception.invoked) {
          this.setPipeline('PERCEIVE', 'done');
          this.patch({ perceiveLabel: perception.fallback ? perception.fallback : 'OCR' });
          workingScene = {
            ...preScene,
            elements: applyFusionLabels(preScene.elements, perception.candidates),
          };
          this.ledger.record('OCR_USED', 'VISUAL PERCEPTION', `rois=${perception.decision.roiSpecs.length}`);
          this.ledger.record('VISUAL_ANALYSIS_USED', 'VISUAL PERCEPTION', perception.decision.reasons.join(',') || 'escalated');
        } else {
          this.setPipeline('PERCEIVE', 'skipped');
          this.patch({ perceiveLabel: 'SKIP' });
        }

        const perceptionSource = perception.invoked
          ? perception.fusedElementIds.length > 0
            ? 'FUSED'
            : 'OCR'
          : 'DOM';
        this.patch({
          evidence: {
            ...this.state.evidence,
            ocrInvoked: perception.invoked,
            roiCount: perception.decision.roiSpecs.length,
            perceptionSource,
            screenshotOutBytes: 0,
            ocrReason: perception.invoked
              ? perception.decision.reasons.join(', ') || 'escalated'
              : perception.decision.skippedReason || 'DOM sufficient',
            cropOutbound: 'NO',
            recoveryPath: perception.fallback || '—',
          },
        });

        const visualRequired = perception.decision.reasons.some(
          (reason) =>
            reason === 'UNRESOLVED_VISUAL_TARGET' ||
            reason === 'IMAGE_TEXT' ||
            reason === 'CANVAS_RENDERED' ||
            reason === 'PDF_OR_DOCUMENT_PREVIEW'
        );
        const structureSufficient = workingScene.elements.some(
          (el) =>
            (el.innerTextCandidate && el.innerTextCandidate.trim().length > 1) ||
            (el.ariaLabel && el.ariaLabel.trim().length > 1)
        );
        if (
          perception.fallback &&
          perception.decision.escalate &&
          perception.fusedElementIds.length === 0 &&
          visualRequired &&
          !structureSufficient
        ) {
          this.applyPhase(
            'OCR_UNAVAILABLE',
            'On-device capture/OCR failed and page structure is insufficient. The screenshot stayed on this device.'
          );
          this.patch({
            evidence: {
              ...this.state.evidence,
              screenshotOutBytes: 0,
              cropOutbound: 'NO',
              recoveryPath: perception.fallback,
              ocrReason: perception.fallback,
            },
            toast: toastFromPhase('OCR_UNAVAILABLE', this.state.message),
          });
          break;
        }

        const protectStart = performance.now();
        this.setPipeline('PROTECT', 'active');
        const protecting = protectingState();
        this.applyPhase('PROTECTING', protecting.detail);

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
        const combinedFindings: PrivacyFinding[] = [
          ...workingScene.privacyFindings,
          ...goalFindings,
          ...ocrFindings,
        ];

        const decisions = evaluatePrivacyPolicy(combinedFindings);
        for (const { decision, realValue } of tokenizeDecisionsWithValues(decisions, combinedFindings)) {
          if (!decision.tokenRole) continue;
          this.vault.registerToken(
            decision.tokenRole,
            decision.privacyClass,
            realValue,
            taskId,
            tabId,
            origin,
            ['text', 'textbox', 'email', 'tel']
          );
        }

        const safeContext = buildSafeContext(
          workingScene,
          rawGoal,
          decisions,
          this.vault,
          taskId,
          combinedFindings,
          { visualCandidates: perception.candidates }
        );
        if (priorOutcome) {
          safeContext.priorOutcome = priorOutcome;
        }

        // TRUST: Continue is a fresh loop, not approval. Live MATCHED typing must not be
        // re-executed; remaining search-submit is still required.
        const typeIntent = parseMockGoal(rawGoal);
        if (typeIntent.kind === 'type_text' && !priorOutcome) {
          const liveTyped = pickUniqueTypeTextTarget(workingScene.elements, typeIntent.fieldHints);
          if (liveTyped.ok && liveTyped.target.fingerprint) {
            const probe = await probeFieldOnTab(
              this.ports,
              tabId,
              liveTyped.target.fingerprint,
              typeIntent.text,
              liveTyped.target.frameProvenance?.frameId
            );
            if (probe.fieldState === 'MATCHED') {
              lastFieldState = 'MATCHED';
              priorOutcome = {
                actionId: createActionId('act_live_matched'),
                status: 'VERIFIED',
                summary: 'Live field already holds the requested text.',
              };
              safeContext.priorOutcome = priorOutcome;
            }
          }
        }

        let serializedBytes: string;
        try {
          serializedBytes = validateSafeContextEgress(safeContext);
        } catch (egressErr) {
          const blocked = blockedState();
          this.applyPhase('BLOCKED', blocked.detail);
          this.setPipeline('PROTECT', 'pending');
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
          const summary = buildPrivacySummary(combinedFindings, decisions, safeContext, {
            screenshotBytes: 0,
            protectedContextBytes: 0,
          });
          const blockedToast = this.assuranceBus.emit({
            kind: 'BLOCKED',
            hostname: blockedReceipt.hostname,
            message: 'N-Eye blocked an unsafe AI request. Forbidden sensitive data was detected before network.',
            severity: 'warning',
            dedupeKey: `blocked:${blockedReceipt.hostname}`,
          });
          this.patch({
            privacySummary: summary,
            visualizer: visualizerModel(combinedFindings, safeContext),
            receipt: blockedReceipt,
            receiptView: mapReceiptView(blockedReceipt, summary),
            toast: blockedToast ? toastFromEvent(blockedToast) : this.state.toast,
            evidence: {
              ...this.state.evidence,
              findingsCount: combinedFindings.length,
              vaultTokenCount: this.vault.size(),
              egressResult: 'BLOCKED',
              egressAudit: 'BLOCKED',
            },
          });
          throw egressErr;
        }

        const summary = buildPrivacySummary(combinedFindings, decisions, safeContext, {
          screenshotBytes: 0,
          protectedContextBytes: serializedBytes.length,
        });
        this.patch({
          privacySummary: summary,
          visualizer: visualizerModel(combinedFindings, safeContext),
          latency: { ...this.state.latency, protect: `${(performance.now() - protectStart).toFixed(1)} ms` },
          evidence: {
            ...this.state.evidence,
            findingsCount: combinedFindings.length,
            vaultTokenCount: this.vault.size(),
            payloadBytes: serializedBytes.length,
            egressResult: 'PASS (0 Secrets Detected)',
            egressAudit: 'PASS',
            safeContextJson: JSON.stringify(JSON.parse(serializedBytes), null, 2),
          },
          advisories: buildAdvisoryRecommendations(combinedFindings, perception),
        });
        this.setPipeline('PROTECT', 'done');
        if (combinedFindings.length > 0) {
          this.ledger.record('PRIVACY_DETECTED', 'PRIVACY', `findings=${combinedFindings.length}`);
        }
        if (
          decisions.some(
            (d) => d.decision === 'MINIMIZE' || d.decision === 'MASK' || d.decision === 'REMOVE'
          )
        ) {
          this.ledger.record('DATA_MINIMIZED', 'PRIVACY', 'minimize-or-mask');
        }
        this.ledger.record('DATA_PROTECTED', 'PRIVACY', `tokens=${this.vault.size()}`);
        this.ledger.record('PROTECTED_CONTEXT_CREATED', 'PRIVACY', `bytes=${serializedBytes.length}`);

        const planStart = performance.now();
        this.setPipeline('THINK', 'active');
        const remoteView = remoteReasoningState();
        this.applyPhase('PLANNING', remoteView.detail);

        const planResult = await this.planner.propose(safeContext, {
          signal,
          onRetry: (notice) => {
            if (signal.aborted || taskGeneration !== this.taskGeneration) return;
            this.applyPhase(
              'RETRYING',
              `Retrying planner (attempt ${notice.nextAttempt}/${PLANNER_MAX_ATTEMPTS}). Same protected context.`
            );
            this.patch({
              evidence: {
                ...this.state.evidence,
                plannerAttempts: notice.nextAttempt,
                recoveryPath: notice.code,
              },
            });
          },
        });
        if (signal.aborted || taskGeneration !== this.taskGeneration) {
          throw new DOMException('Task cancelled by user.', 'AbortError');
        }
        const proposal = planResult.proposal;
        const metadata = planResult.metadata;
        const planMs = metadata.planningLatencyMs || performance.now() - planStart;

        this.patch({
          lastRequestId: metadata.requestId,
          lastPlannerProvider: metadata.provider,
          lastPlannerModel: metadata.model,
          latency: { ...this.state.latency, plan: `${planMs.toFixed(1)} ms` },
          evidence: {
            ...this.state.evidence,
            requestId: metadata.requestId,
            provider: metadata.provider,
            model: metadata.model,
            plannerLatency: `${planMs.toFixed(1)} ms`,
            plannerAttempts: metadata.attempt ?? 1,
            recoveryPath: (metadata.attempt ?? 1) > 1 ? 'PLANNER_RETRY' : '—',
            reasoningProvenance: metadata.reasoningProvenance || '—',
            nalisVersion: snapshotNalisHealth().version,
            nalisHealth: humanHealthLine(snapshotNalisHealth()),
            memoryCount: getNalisMemory().size(),
            learningEnabled: getNalisMemory().isEnabled(),
          },
        });
        this.setPipeline('THINK', 'done');
        if (this.state.plannerMode === 'REMOTE' || /REMOTE/i.test(metadata.reasoningProvenance || '')) {
          this.ledger.record('REMOTE_INTELLIGENCE_USED', 'TASK PLANNING', metadata.provider || 'remote');
        } else {
          this.ledger.record('LOCAL_INTELLIGENCE_USED', 'TASK PLANNING', metadata.model || 'deterministic');
        }
        this.ledger.record('ACTION_PROPOSED', 'TASK PLANNING', proposal.type, {
          provenance: 'UNTRUSTED_MODEL',
        });
        if (proposal.type === 'PRESS_ENTER') {
          this.ledger.record('FALLBACK_USED', 'TASK PLANNING', 'constrained-enter');
        }

        const protectedView = protectedState(combinedFindings.length);
        this.applyPhase('PROTECTED', protectedView.detail);
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
          latencyMs: planMs,
          ocrInvoked: perception.invoked,
          roiCount: perception.decision.roiSpecs.length,
          ocrBlockCount: perception.ocrBlocks.length,
          escalationReasons: perception.decision.reasons.join(', '),
        });
        const protectedToast = this.assuranceBus.emit({
          kind: findingsHaveOcrSecrets(combinedFindings) ? 'OCR_PROTECTED' : 'PROTECTED',
          hostname: receipt.hostname,
          message: findingsHaveOcrSecrets(combinedFindings)
            ? 'OCR found private text in this visual region. It was protected locally.'
            : protectedView.detail,
          severity: 'success',
          dedupeKey: `protected:${receipt.hostname}:${metadata.requestId}`,
        });
        const targetEl = workingScene.elements.find((e) => e.id === proposal.targetId);
        const named = `${targetEl?.ariaLabel || ''} ${targetEl?.innerTextCandidate || ''}`.trim();
        const targetLabel =
          proposal.type === 'ASK_USER' || proposal.type === 'COMPLETE' || proposal.type === 'WAIT'
            ? named
            : named || String(proposal.targetId || '');
        const frameLabel = targetEl?.frameProvenance
          ? `${targetEl.frameProvenance.frameKind} · ${targetEl.frameProvenance.frameId}`
          : 'Top document';
        const actionView = mergeActionView(undefined, {
          proposalText: describeAction(proposal, targetLabel),
          targetLabel,
          risk: proposal.riskLevel,
          reasoning: proposal.reasoning,
          proposalType: proposal.type,
          targetId: String(proposal.targetId || '—'),
          frame: frameLabel,
          confirmationRequired: false,
          validation: emptyValidation(),
        });
        this.patch({
          receipt,
          receiptView: mapReceiptView(receipt, summary),
          toast: protectedToast ? toastFromEvent(protectedToast) : this.state.toast,
          action: actionView,
        });

        if (proposal.type === 'COMPLETE') {
          let liveFieldState: FieldValueState | undefined;
          const intent = parseMockGoal(rawGoal);
          if (intent.kind === 'type_text' && (verifiedCount === 0 || intent.requiresSearchSubmit)) {
            const picked = pickUniqueTypeTextTarget(workingScene.elements, intent.fieldHints);
            if (picked.ok && picked.target.fingerprint) {
              const probe = await probeFieldOnTab(
                this.ports,
                tabId,
                picked.target.fingerprint,
                intent.text,
                picked.target.frameProvenance?.frameId
              );
              liveFieldState = probe.fieldState;
            }
          }
          this.applyLocalCompletion(
            arbitratePlannerComplete({
              goal: rawGoal,
              verifiedCount,
              lastVerifiedType,
              lastFieldState,
              verifiedClick,
              liveFieldState,
              verifiedSearchOutcome,
              verifiedResourceOpen,
              outcomeEvidenceHay,
            }),
            step
          );
          break;
        }

        if (proposal.type === 'ASK_USER') {
          this.enterAskUser(proposal.reasoning || 'Planner requires the next instruction.', {
            step: { index: step, max: MAX_STEPS, summary: 'Awaiting a clearer request.' },
          });
          break;
        }

        if (proposal.type === 'WAIT') {
          this.setPipeline('ACT', 'active');
          this.applyPhase('ACTING', 'Waiting for the page to settle (bounded).');
          await this.wait(WAIT_SETTLE_MS);
          if (signal.aborted || taskGeneration !== this.taskGeneration) {
            throw new DOMException('Task cancelled by user.', 'AbortError');
          }
          this.setPipeline('ACT', 'done');
          this.setPipeline('VERIFY', 'done');
          priorOutcome = {
            actionId: proposal.actionId,
            status: 'VERIFIED',
            summary: 'Bounded settle wait completed.',
          };
          continue;
        }

        const proposalSignature = `${proposal.type}:${proposal.targetId || ''}:${proposal.tokenId || ''}`;
        if (executedProposals.filter((p) => p === proposalSignature).length >= 2) {
          throw new Error(
            `Loop safety triggered: Action ${proposalSignature} was proposed repeatedly without progress.`
          );
        }
        executedProposals.push(proposalSignature);

        const goalIntel = interpretGoal(rawGoal);
        if (goalIntel.forbidSubmit && (proposal.type === 'CLICK' || proposal.type === 'PRESS_ENTER')) {
          const submitTarget = workingScene.elements.find((e) => e.id === proposal.targetId);
          const submitish =
            proposal.type === 'PRESS_ENTER' ||
            submitTarget?.formSubmitting === true ||
            submitTarget?.inputType === 'submit' ||
            /\bsubmit\b/i.test(`${submitTarget?.innerTextCandidate || ''} ${submitTarget?.ariaLabel || ''}`);
          if (submitish) {
            this.enterAskUser('The goal forbids submitting. N-Eye will not submit this form.');
            break;
          }
        }

        const validateStart = performance.now();
        this.setPipeline('VALIDATE', 'active');
        this.applyPhase('VALIDATING');

        let validatedAction: ValidatedAction;
        try {
          validatedAction = validateActionProposal(proposal, workingScene, this.vault, taskId, origin, tabId);
        } catch (err) {
          const reasonCode: SecurityReasonCode =
            err instanceof Error && 'reasonCode' in err
              ? (err as { reasonCode: SecurityReasonCode }).reasonCode
              : 'POLICY_VIOLATION';
          this.securityLog.record({
            reasonCode,
            detail: (err as Error).message,
            actionType: proposal.type,
            targetId: String(proposal.targetId || ''),
          });
          this.setPipeline('VALIDATE', 'pending');
          this.patch({
            action: mergeActionView(this.state.action, {
              proposalText: `Rejected: ${(err as Error).message}`,
              targetLabel,
              risk: proposal.riskLevel,
              reasoning: proposal.reasoning,
              proposalType: proposal.type,
              targetId: String(proposal.targetId || '—'),
              frame: frameLabel,
              confirmationRequired: false,
              validation: {
                targetCurrent: false,
                frameCurrent: false,
                pageCurrent: true,
                tokenScopeValid: false,
                riskPolicy: (err as Error).message,
              },
              blockedReason: (err as Error).message,
              securityReason: reasonCode,
            }),
            evidence: {
              ...this.state.evidence,
              validationResult: (err as Error).message,
              securityReason: reasonCode,
            },
          });
          if (this.isMissingTargetFailure(err)) {
            this.ledger.record('TARGET_NOT_FOUND', 'TARGET MATCHING', 'INVALID_TARGET');
            this.enterAskUser(`${MISSING_TARGET_HUMAN} TARGET_NOT_FOUND`);
            break;
          }
          this.applyPhase('BLOCKED', (err as Error).message);
          this.patch({
            toast: toastFromEvent({
              kind: 'BLOCKED',
              hostname: this.state.siteHostname,
              message: `Action blocked. ${(err as Error).message}`,
              severity: 'warning',
              dedupeKey: `blocked-val:${Date.now()}`,
              timestamp: Date.now(),
            }),
          });
          throw err;
        }

        this.ledger.record('ACTION_CHECKED', 'LOCAL SAFETY CHECK', validatedAction.approvedRiskLevel);

        this.patch({
          latency: { ...this.state.latency, validate: `${(performance.now() - validateStart).toFixed(1)} ms` },
          action: {
            proposalText: describeAction(proposal, targetLabel),
            targetLabel,
            risk: validatedAction.approvedRiskLevel,
            reasoning: proposal.reasoning,
            proposalType: proposal.type,
            targetId: String(proposal.targetId || '—'),
            frame: frameLabel,
            confirmationRequired: validatedAction.approvedRiskLevel === 'HIGH',
            validation: {
              targetCurrent: true,
              frameCurrent: true,
              pageCurrent: true,
              tokenScopeValid: proposal.type !== 'TYPE_TOKEN' || Boolean(validatedAction.resolvedTokenValue),
              riskPolicy: validatedAction.approvedRiskLevel,
            },
          },
          evidence: { ...this.state.evidence, validationResult: validatedAction.approvedRiskLevel },
        });
        this.setPipeline('VALIDATE', 'done');

        // The action that will actually run. For HIGH risk it is replaced by a freshly
        // re-validated action after approval, so a stale closure can never be executed.
        let actionToExecute: ValidatedAction = validatedAction;
        let executionScene: RawScene = workingScene;

        if (validatedAction.approvedRiskLevel === 'HIGH') {
          const stayedLocal = summary?.keptLocal ?? [];
          const dataUsed = summary?.tokenized.map((t) => t.token) ?? [];
          const request = this.confirmations.issue(
            buildConfirmationBinding(validatedAction, { taskId, origin }),
            { pageEpoch: workingScene.pageEpoch }
          );
          this.securityLog.record({
            reasonCode: 'CONFIRMATION_REQUIRED',
            detail: `High-risk ${proposal.type} requires explicit approval.`,
            actionType: proposal.type,
            targetId: String(proposal.targetId || ''),
          });
          this.patch({
            confirmation: {
              confirmationId: request.confirmationId,
              actionName: describeAction(proposal, targetLabel),
              targetLabel,
              risk: request.riskLevel,
              why: 'This action can submit, upload, or change an account. N-Eye will not continue without your confirmation.',
              stayedLocal,
              dataUsed,
            },
            evidence: { ...this.state.evidence, securityReason: 'CONFIRMATION_REQUIRED' },
          });
          this.applyPhase('AWAITING_CONFIRMATION', describeAction(proposal, targetLabel));
          this.ledger.record('CONFIRMATION_REQUIRED', 'CONFIRMATION', validatedAction.approvedRiskLevel);
          this.patch({
            toast: toastFromPhase(
              'AWAITING_CONFIRMATION',
              `N-Eye needs your approval. ${describeAction(proposal, targetLabel)}`
            ),
          });

          const approvalStarted = performance.now();
          const confirmed = await new Promise<boolean>((resolve) => {
            this.confirmWait = { confirmationId: request.confirmationId, resolve };
          });
          this.patch({
            latency: {
              ...this.state.latency,
              approvalWait: `${((performance.now() - approvalStarted) / 1000).toFixed(1)} s`,
            },
          });
          if (confirmed) {
            this.ledger.record('CONFIRMATION_GRANTED', 'CONFIRMATION', 'allow-once');
          }
          if (!confirmed || signal.aborted) {
            this.confirmations.invalidate();
            this.applyPhase('CANCELLED', 'Action cancelled by user.');
            throw new DOMException('Action cancelled by user.', 'AbortError');
          }

          // Single-use consumption. An approval can authorize at most one execution.
          const consumed = this.confirmations.consume(request.confirmationId);
          if (!('grant' in consumed)) {
            this.failClosed(
              consumed.reasonCode ?? 'CONFIRMATION_REPLAY',
              consumed.reason ?? 'Approval could not be used.',
              proposal.type,
              String(proposal.targetId || '')
            );
            throw new Error(consumed.reason ?? 'Approval could not be used.');
          }

          // TOCTOU: the page may have mutated while the dialog was open. Re-observe and
          // uniquely re-ground the approved semantic identity. Opaque eN is reminted each
          // observe and must not be treated as the granted target.
          const freshScene = await this.requestObservation(tabId, false);
          if (!freshScene) {
            this.failClosed(
              'STALE_TARGET',
              'Page could not be re-observed after approval. Refusing to execute.',
              proposal.type,
              String(proposal.targetId || '')
            );
            throw new Error('Page could not be re-observed after approval.');
          }

          let revalidated: ValidatedAction;
          try {
            const liveProposal = retargetProposalToApprovedBinding(proposal, freshScene, consumed.request);
            revalidated = validateActionProposal(liveProposal, freshScene, this.vault, taskId, origin, tabId);
          } catch (err) {
            const reasonCode =
              err instanceof Error && 'reasonCode' in err
                ? (err as { reasonCode: SecurityReasonCode }).reasonCode
                : 'STALE_TARGET';
            this.failClosed(reasonCode, (err as Error).message, proposal.type, String(proposal.targetId || ''));
            throw err;
          }

          const binding = verifyConfirmationBinding(
            consumed.request,
            buildConfirmationBinding(revalidated, { taskId, origin })
          );
          if (!binding.ok) {
            this.failClosed(
              binding.reasonCode ?? 'CONFIRMATION_STALE',
              binding.reason ?? 'Approval no longer matches the live action.',
              proposal.type,
              String(proposal.targetId || '')
            );
            throw new Error(binding.reason ?? 'Approval no longer matches the live action.');
          }

          actionToExecute = revalidated;
          executionScene = freshScene;
          this.ledger.record('TARGET_RECHECKED', 'LIVE TARGET RE-CHECK', 'post-confirm');
          this.patch({
            evidence: {
              ...this.state.evidence,
              securityReason: 'CONFIRMATION_REVALIDATED',
              pageEpoch: freshScene.pageEpoch,
            },
          });
        }

        const actStart = performance.now();
        this.setPipeline('ACT', 'active');
        this.applyPhase('ACTING');
        if (signal.aborted || taskGeneration !== this.taskGeneration) {
          throw new DOMException('Task cancelled by user.', 'AbortError');
        }
        const execResult = await executeOnTab(this.ports, tabId, actionToExecute);
        if (signal.aborted || taskGeneration !== this.taskGeneration) {
          throw new DOMException('Task cancelled by user.', 'AbortError');
        }
        this.patch({
          latency: { ...this.state.latency, act: `${(performance.now() - actStart).toFixed(1)} ms` },
          evidence: {
            ...this.state.evidence,
            executionResult: execResult.success ? 'OK' : execResult.error || 'FAILED',
          },
        });
        this.setPipeline('ACT', 'done');
        if (execResult.success) {
          this.ledger.record('ACTION_EXECUTED', 'BROWSER EXECUTION', actionToExecute.proposal.type, {
            status: 'VERIFIED',
          });
        }

        if (!execResult.success) {
          if (execResult.outcome === 'ASK_USER') {
            this.enterAskUser(execResult.error || 'N-Eye needs you to complete this step.');
            break;
          }
          const blocked = execResult.error || 'Execution failed';
          this.applyPhase('BLOCKED', blocked);
          this.patch({
            action: mergeActionView(this.state.action, { blockedReason: blocked }),
            toast: {
              kind: 'BLOCKED',
              message: blocked.toLowerCase().includes('page')
                ? 'Action blocked. Page changed before execution.'
                : blocked,
            },
          });
          throw new Error(`Action execution failed: ${execResult.error}`);
        }

        const verifyStart = performance.now();
        this.setPipeline('VERIFY', 'active');
        this.applyPhase('VERIFYING');
        const searchIntent = parseMockGoal(rawGoal);
        const searchClickSettle =
          (proposal.type === 'CLICK' || proposal.type === 'PRESS_ENTER') &&
          searchIntent.kind === 'type_text' &&
          searchIntent.requiresSearchSubmit;
        await this.wait(searchClickSettle ? WAIT_SETTLE_MS : 120);
        if (signal.aborted || taskGeneration !== this.taskGeneration) {
          throw new DOMException('Task cancelled by user.', 'AbortError');
        }
        const postScene = await this.requestObservation(tabId, false);
        if (postScene) {
          this.ledger.record('PAGE_REOBSERVED', 'OUTCOME VERIFICATION', `epoch=${String(postScene.pageEpoch)}`);
          outcomeEvidenceHay = sceneOutcomeHay(postScene);
          let fieldState = execResult.fieldState;
          if (
            (actionToExecute.proposal.type === 'TYPE_TOKEN' || actionToExecute.proposal.type === 'TYPE_TEXT') &&
            actionToExecute.expectedFingerprint
          ) {
            const expectedText =
              actionToExecute.proposal.type === 'TYPE_TOKEN'
                ? actionToExecute.resolvedTokenValue || ''
                : actionToExecute.proposal.textValue || '';
            const probe = await probeFieldOnTab(
              this.ports,
              tabId,
              actionToExecute.expectedFingerprint,
              expectedText,
              actionToExecute.expectedFrameId
            );
            if (probe.fieldState) fieldState = probe.fieldState;
          }
          const verification: VerificationResult = verifyActionExecution(actionToExecute, executionScene, postScene, {
            fieldState,
            scrollMoved: execResult.scrollMoved,
            atScrollBoundary: execResult.atScrollBoundary,
            selectMatched: execResult.selectMatched,
            targetIdentityChanged: execResult.targetIdentityChanged,
          });
          this.patch({
            action: {
              ...(this.state.action as NonNullable<ProductState['action']>),
              verification: verification.status,
              verificationDelta: verification.observedDelta,
            },
            evidence: { ...this.state.evidence, verificationResult: verification.status },
          });
          if (shouldStopAfterUnverifiedHighRisk(actionToExecute.approvedRiskLevel, verification.status)) {
            this.enterAskUser(
              'This high-risk action could not be verified. N-Eye will not repeat it automatically.'
            );
            break;
          }
          if (
            (actionToExecute.proposal.type === 'TYPE_TEXT' || actionToExecute.proposal.type === 'TYPE_TOKEN') &&
            (verification.status === 'VERIFIED_FAILURE' || verification.status === 'AMBIGUOUS')
          ) {
            this.enterAskUser(
              verification.observedDelta || 'The field did not keep the intended text. This is not completion.'
            );
            break;
          }
          priorOutcome = {
            actionId: proposal.actionId,
            status: verification.status === 'VERIFIED_SUCCESS' ? 'VERIFIED' : 'FAILURE',
            summary: verification.observedDelta,
          };
          if (verification.status === 'VERIFIED_SUCCESS') {
            verifiedCount += 1;
            lastVerifiedType = proposal.type;
            if (fieldState) lastFieldState = fieldState;
            if (proposal.type === 'CLICK' || proposal.type === 'PRESS_ENTER') verifiedClick = true;
            if (verificationShowsNavigation(executionScene, postScene)) {
              verifiedSearchOutcome = true;
            }
            if (proposal.type === 'CLICK') {
              const clicked = executionScene.elements.find((e) => e.id === proposal.targetId);
              const clickLabel = `${clicked?.ariaLabel || ''} ${clicked?.innerTextCandidate || ''}`;
              const tail = interpretGoal(rawGoal);
              if (tail.tailEntity && scoreLabelAgainstHints(clickLabel, tail.labelHints) > 0) {
                verifiedResourceOpen = true;
              }
            }
            lastFailureKey = null;
            identicalFailCount = 0;
          } else {
            remainingRetryBudget -= 1;
            const nextKey = identicalFailureKey(
              proposal.type,
              String(proposal.targetId || ''),
              Number(executionScene.pageEpoch)
            );
            const verdict = shouldAbstainAfterFailure({
              previousKey: lastFailureKey,
              nextKey,
              identicalCount: identicalFailCount,
              stateChanged: executionScene.pageEpoch !== postScene.pageEpoch,
              remainingRetryBudget,
            });
            lastFailureKey = nextKey;
            identicalFailCount = verdict.identicalCount;
            if (verdict.abstain) {
              this.enterAskUser(
                verdict.reason ||
                  'The same action failed without a page-state change. N-Eye will not loop.'
              );
              break;
            }
          }
        }
        this.patch({
          latency: { ...this.state.latency, verify: `${(performance.now() - verifyStart).toFixed(1)} ms` },
        });
        this.setPipeline('VERIFY', 'done');
      }

      this.patch({
        latency: { ...this.state.latency, total: `${(performance.now() - loopStart).toFixed(1)} ms` },
      });
      if (
        this.state.phase === 'PROTECTED' ||
        this.state.phase === 'PLANNING' ||
        this.state.phase === 'VERIFYING' ||
        this.state.phase === 'ACTING' ||
        this.state.phase === 'VALIDATING'
      ) {
        this.applyLocalCompletion(
          arbitratePlannerComplete({
            goal: rawGoal,
            verifiedCount,
            lastVerifiedType,
            lastFieldState,
            verifiedClick,
            verifiedSearchOutcome,
            verifiedResourceOpen,
            outcomeEvidenceHay,
          }),
          this.state.step?.index ?? MAX_STEPS
        );
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this.ledger.record('TASK_CANCELLED', 'SYSTEM LIFECYCLE', 'user-or-abort');
        this.applyPhase('CANCELLED', 'Task cancelled by user.');
        this.clearLiveEvidence();
      } else if (this.state.phase === 'BLOCKED' || this.state.phase === 'CANCELLED') {
        // failClosed / validation already told the truth. Do not promote a security block into ERROR.
        this.patch({ step: { index: this.state.step?.index ?? 1, max: MAX_STEPS, summary: (err as Error).message } });
      } else if (isEngineExceptionText((err as Error).message || '')) {
        this.ledger.record('TASK_FAILED', 'SYSTEM LIFECYCLE', 'engine-exception');
        this.enterAskUser(`${ENGINE_FAILURE_HUMAN} ${MISSING_TARGET_HUMAN}`);
      } else {
        const message = (err as Error).message;
        const phase = classifyPlannerFailure(err);
        this.applyPhase(phase, message);
        if (
          phase === 'GATEWAY_UNREACHABLE' ||
          phase === 'RATE_LIMITED' ||
          phase === 'PROVIDER_UNAVAILABLE'
        ) {
          this.patch({ toast: toastFromPhase(phase, this.state.message) });
        }
        this.patch({ step: { index: this.state.step?.index ?? 1, max: MAX_STEPS, summary: `Error: ${message}` } });
      }
    } finally {
      this.abort = null;
      this.confirmWait = null;
      // Approval never outlives the task that requested it.
      this.confirmations.invalidate();
      this.patch({
        running: false,
        canRun: Boolean(this.tab?.isSupported && this.state.contentScriptHealth === 'READY'),
        canCancel: false,
        confirmation: undefined,
      });
      this.sealTaskReport(String(taskId));
    }
  }
}
