/**
 * NALIS forensic trace + subsystem health (Zone 3).
 *
 * OWNS: Append-only per-task safe events and degraded-intelligence reporting.
 * PRIVACY: No secrets, vault mappings, raw OCR dumps, or hidden chain-of-thought.
 */

import { NALIS_VERSION } from './failure-taxonomy.js';
import { detectBrowserLocalAi, detectWebGpu, type ProviderHealth } from './provider.js';
import { getNalisMemory } from './memory.js';

export type ForensicEventKind =
  | 'GOAL_PARSED'
  | 'TASKGRAPH_CREATED'
  | 'MEMORY_QUERIED'
  | 'MEMORY_HINT_USED'
  | 'PAGE_OBSERVED'
  | 'REGION_IDENTIFIED'
  | 'AFFORDANCE_INFERRED'
  | 'OCR_ESCALATED'
  | 'VISUAL_ESCALATED'
  | 'EXPLORATION_PERFORMED'
  | 'CANDIDATES_RANKED'
  | 'LOCAL_MODEL_INVOKED'
  | 'LOCAL_MODEL_FALLBACK'
  | 'REMOTE_INVOKED'
  | 'ACTION_PROPOSED'
  | 'PRIVACY_CHECKED'
  | 'RISK_CHECKED'
  | 'CONFIRMATION_REQUESTED'
  | 'TARGET_REGROUNDED'
  | 'ACTION_EXECUTED'
  | 'OUTCOME_OBSERVED'
  | 'VERIFICATION_COMPLETED'
  | 'FAILURE_RECORDED'
  | 'RECOVERY_STARTED'
  | 'LEARNING_ELIGIBLE'
  | 'LEARNING_BLOCKED'
  | 'MEMORY_UPDATED'
  | 'NO_PROGRESS_LOOP'
  | 'TASK_FINALIZED';

export interface ForensicEvent {
  kind: ForensicEventKind;
  timestamp: number;
  safeDetail: string;
}

export class ForensicTrace {
  private events: ForensicEvent[] = [];

  public append(kind: ForensicEventKind, safeDetail: string): void {
    this.events.push({
      kind,
      timestamp: Date.now(),
      safeDetail: safeDetail.slice(0, 200),
    });
    if (this.events.length > 200) this.events = this.events.slice(-200);
  }

  public list(): ForensicEvent[] {
    return [...this.events];
  }

  public summary(): string {
    if (this.events.length === 0) return 'No N-Eye Intelligence events.';
    const last = this.events[this.events.length - 1];
    return `${this.events.length} events · last ${last?.kind || 'NONE'}`;
  }

  public containsSecret(canary: string): boolean {
    return this.events.some((e) => e.safeDetail.includes(canary));
  }
}

export interface NalisHealthSnapshot {
  version: string;
  goalIntelligence: ProviderHealth;
  semanticUi: ProviderHealth;
  ocr: ProviderHealth;
  visualGrounding: ProviderHealth;
  localModel: ProviderHealth;
  localMemory: ProviderHealth;
  webgpu: ProviderHealth;
  wasm: ProviderHealth;
  remote: ProviderHealth;
  verifier: ProviderHealth;
  notes: string[];
}

export function snapshotNalisHealth(args?: {
  ocr?: ProviderHealth;
  remote?: ProviderHealth;
  wasm?: ProviderHealth;
}): NalisHealthSnapshot {
  const localModel = detectBrowserLocalAi();
  const webgpu = detectWebGpu();
  const memory = getNalisMemory().isEnabled() ? 'READY' : 'DEGRADED';
  const notes: string[] = [];
  if (localModel !== 'READY') {
    notes.push('Local intelligence unavailable. Reason: no admitted on-device language model. Fallback: deterministic planner active.');
  }
  if (webgpu !== 'READY') notes.push('WebGPU unavailable. Visual neural path remains unadmitted; WASM OCR is the pixel fallback.');
  if (args?.ocr === 'FAILED') notes.push('OCR unavailable. Fallback: structural UI evidence. Impact: pixel-only text may not be understood.');
  if (args?.remote === 'UNAVAILABLE' || args?.remote === 'FAILED') {
    notes.push('Remote expert unavailable. Local mode remains active.');
  }
  return {
    version: NALIS_VERSION,
    goalIntelligence: 'READY',
    semanticUi: 'READY',
    ocr: args?.ocr || 'READY',
    visualGrounding: 'UNAVAILABLE',
    localModel,
    localMemory: memory,
    webgpu,
    wasm: args?.wasm || 'READY',
    remote: args?.remote || 'UNAVAILABLE',
    verifier: 'READY',
    notes,
  };
}

export function humanHealthLine(h: NalisHealthSnapshot): string {
  return `N-Eye Intelligence ${h.version} · local model ${h.localModel} · memory ${h.localMemory} · WebGPU ${h.webgpu}`;
}

let activeTrace: ForensicTrace | null = null;

export function beginForensicTrace(): ForensicTrace {
  activeTrace = new ForensicTrace();
  return activeTrace;
}

export function getForensicTrace(): ForensicTrace | null {
  return activeTrace;
}
