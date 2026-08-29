/**
 * Progressive-disclosure rules.
 * OWNS: What belongs on the compact card vs Details vs Evidence.
 */

export type DisclosureLevel = 'compact' | 'details' | 'evidence';

export type EvidenceField =
  | 'hostname'
  | 'phase'
  | 'privacySummary'
  | 'receipt'
  | 'pipeline'
  | 'pageEpoch'
  | 'roiCount'
  | 'observedControls'
  | 'requestId'
  | 'safeContextJson'
  | 'vaultTokenCount'
  | 'ocrInvoked'
  | 'perceptionSource'
  | 'screenshotBytes'
  | 'contentScriptHealth'
  | 'egressResult'
  | 'plannerLatency'
  | 'frameProvenance';

const LEVEL: Record<EvidenceField, DisclosureLevel> = {
  hostname: 'compact',
  phase: 'compact',
  privacySummary: 'compact',
  receipt: 'compact',
  pipeline: 'details',
  pageEpoch: 'evidence',
  roiCount: 'evidence',
  observedControls: 'evidence',
  requestId: 'evidence',
  safeContextJson: 'evidence',
  vaultTokenCount: 'evidence',
  ocrInvoked: 'evidence',
  perceptionSource: 'evidence',
  screenshotBytes: 'compact',
  contentScriptHealth: 'evidence',
  egressResult: 'evidence',
  plannerLatency: 'evidence',
  frameProvenance: 'evidence',
};

export function fieldLevel(field: EvidenceField): DisclosureLevel {
  return LEVEL[field];
}

export function isVisibleAt(field: EvidenceField, level: DisclosureLevel): boolean {
  const owned = fieldLevel(field);
  if (level === 'evidence') return true;
  if (level === 'details') return owned === 'compact' || owned === 'details';
  return owned === 'compact';
}
