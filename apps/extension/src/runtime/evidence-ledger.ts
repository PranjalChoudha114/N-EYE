/**
 * Per-task evidence ledger (Zone 3).
 *
 * OWNS: Append-only local events that may later become Report facts.
 * TRUST: Only this module (called from the trust loop) writes authoritative events.
 * MUST NEVER: Store vault mappings, raw secrets, screenshots, or hidden model chain-of-thought.
 * Page/model text may be recorded only as UNTRUSTED_INPUT.
 */

import type { TaskId } from '@n-eye/protocol';

export type EvidenceEventType =
  | 'TASK_RECEIVED'
  | 'TASK_UNDERSTOOD'
  | 'PAGE_OBSERVED'
  | 'VISUAL_ANALYSIS_USED'
  | 'OCR_USED'
  | 'PRIVACY_DETECTED'
  | 'DATA_MINIMIZED'
  | 'DATA_PROTECTED'
  | 'PROTECTED_CONTEXT_CREATED'
  | 'LOCAL_INTELLIGENCE_USED'
  | 'REMOTE_INTELLIGENCE_USED'
  | 'ACTION_PROPOSED'
  | 'ACTION_CHECKED'
  | 'CONFIRMATION_REQUIRED'
  | 'CONFIRMATION_GRANTED'
  | 'TARGET_RECHECKED'
  | 'ACTION_EXECUTED'
  | 'PAGE_REOBSERVED'
  | 'OUTCOME_VERIFIED'
  | 'FALLBACK_USED'
  | 'TASK_FAILED'
  | 'TASK_CANCELLED'
  | 'TARGET_NOT_FOUND'
  | 'PARTIAL_OUTCOME'
  | 'REPORT_VERIFIED'
  | 'UNTRUSTED_INPUT';

export type EvidenceProvenance = 'LOCAL_SYSTEM' | 'UNTRUSTED_PAGE' | 'UNTRUSTED_MODEL';

export type EvidenceStatus = 'RECORDED' | 'VERIFIED' | 'FAILED' | 'NOT_OBSERVED';

export type EvidenceStage =
  | 'USER INTENT'
  | 'PAGE OBSERVATION'
  | 'PRIVACY'
  | 'VISUAL PERCEPTION'
  | 'UI MEANING'
  | 'TARGET MATCHING'
  | 'TASK PLANNING'
  | 'LOCAL SAFETY CHECK'
  | 'CONFIRMATION'
  | 'LIVE TARGET RE-CHECK'
  | 'BROWSER EXECUTION'
  | 'OUTCOME VERIFICATION'
  | 'REPORT GENERATION'
  | 'SYSTEM LIFECYCLE';

export interface EvidenceEvent {
  id: string;
  taskId: string;
  eventType: EvidenceEventType;
  timestamp: number;
  stage: EvidenceStage;
  safeEvidence: string;
  provenance: EvidenceProvenance;
  status: EvidenceStatus;
  durationMs?: number;
  pageEpoch?: number;
  origin?: string;
  frameId?: string;
  actionType?: string;
  privacyClass?: string;
  targetSemanticKey?: string;
}

const SECRETISH = /password|otp|api[_-]?key|bearer\s+|eyJ[A-Za-z0-9-_]+\.|sk_live_|CANARY_/i;

function scrub(text: string): string {
  const clipped = text.slice(0, 180);
  if (!SECRETISH.test(clipped)) return clipped;
  // TRUST: Partial regex replace can leave CANARY_PASSWORD after stripping "password".
  return '[REDACTED untrusted input]';
}

export class EvidenceLedger {
  private taskId: string | null = null;
  private events: EvidenceEvent[] = [];

  public begin(taskId: TaskId | string): void {
    this.taskId = String(taskId);
    this.events = [];
  }

  public currentTaskId(): string | null {
    return this.taskId;
  }

  public record(
    eventType: EvidenceEventType,
    stage: EvidenceStage,
    safeEvidence: string,
    extras?: Partial<
      Pick<
        EvidenceEvent,
        | 'provenance'
        | 'status'
        | 'durationMs'
        | 'pageEpoch'
        | 'origin'
        | 'frameId'
        | 'actionType'
        | 'privacyClass'
        | 'targetSemanticKey'
      >
    >
  ): EvidenceEvent | null {
    if (!this.taskId) return null;
    const event: EvidenceEvent = {
      id: `e${this.events.length + 1}`,
      taskId: this.taskId,
      eventType,
      timestamp: Date.now(),
      stage,
      safeEvidence: scrub(safeEvidence),
      provenance: extras?.provenance || 'LOCAL_SYSTEM',
      status: extras?.status || 'RECORDED',
      durationMs: extras?.durationMs,
      pageEpoch: extras?.pageEpoch,
      origin: extras?.origin,
      frameId: extras?.frameId,
      actionType: extras?.actionType,
      privacyClass: extras?.privacyClass,
      targetSemanticKey: extras?.targetSemanticKey,
    };
    this.events.push(event);
    if (this.events.length > 300) this.events = this.events.slice(-300);
    return event;
  }

  public list(): EvidenceEvent[] {
    return [...this.events];
  }

  public has(type: EvidenceEventType): boolean {
    return this.events.some((e) => e.eventType === type);
  }

  public idsOf(types: EvidenceEventType[]): string[] {
    const wanted = new Set(types);
    return this.events.filter((e) => wanted.has(e.eventType)).map((e) => e.id);
  }

  public last(type: EvidenceEventType): EvidenceEvent | undefined {
    for (let i = this.events.length - 1; i >= 0; i -= 1) {
      const event = this.events[i];
      if (event?.eventType === type) return event;
    }
    return undefined;
  }

  public containsSecret(canary: string): boolean {
    if (!canary) return false;
    return this.events.some((e) => e.safeEvidence.includes(canary));
  }

  public stageTimings(): Array<{ stage: EvidenceStage; durationMs: number }> {
    return this.events
      .filter((e) => typeof e.durationMs === 'number' && Number.isFinite(e.durationMs))
      .map((e) => ({ stage: e.stage, durationMs: e.durationMs as number }));
  }
}
