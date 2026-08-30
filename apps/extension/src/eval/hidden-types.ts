/**
 * T021 held-out template evaluation contracts (evaluation only).
 * OWNS: Outcome vocabulary. MUST NOT be imported by production Zone 1–5 modules.
 */

export const HIDDEN_CORPUS_ID = 'n-eye-t021-held-out-templates-v1';

export type HiddenSiteClass =
  | 'government'
  | 'banking'
  | 'ecommerce'
  | 'complex-form'
  | 'privacy-heavy'
  | 'visual-heavy'
  | 'image-text'
  | 'canvas'
  | 'document'
  | 'spa'
  | 'iframe'
  | 'duplicate'
  | 'ambiguous'
  | 'a11y'
  | 'dynamic-rerender'
  | 'native-select'
  | 'scroll'
  | 'controlled-input'
  | 'high-risk'
  | 'prompt-injection';

export type HiddenOutcome =
  | 'VERIFIED_COMPLETE'
  | 'ALREADY_SATISFIED'
  | 'ASK_USER'
  | 'BLOCKED'
  | 'UNSUPPORTED'
  | 'FAILED'
  | 'CANCELLED'
  | 'AMBIGUOUS';

export type HiddenMutate =
  | 'none'
  | 'move-same-label'
  | 'replace-equivalent'
  | 'semantic-swap-delete'
  | 'remove-iframe';

export interface HiddenCase {
  id: string;
  siteClass: HiddenSiteClass;
  title: string;
  origin: string;
  goal: string;
  html: string;
  /** Synthetic strings that must not appear in serialized SafeContext. */
  forbidden: string[];
  mutate: HiddenMutate;
  /** HIGH actions are not executed in this harness (confirmation is a separate Chrome/unit surface). */
  allowHighWithoutConfirm: boolean;
  expected: HiddenOutcome[];
  notes: string;
}

export interface HiddenCaseResult {
  id: string;
  siteClass: HiddenSiteClass;
  goal: string;
  outcome: HiddenOutcome;
  expected: HiddenOutcome[];
  expectedHit: boolean;
  privacyPass: boolean;
  forbiddenHits: string[];
  proposalType: string;
  actionType: string;
  risk: string;
  executed: boolean;
  verification: string;
  wrongAction: boolean;
  falseComplete: boolean;
  correctAbstention: boolean;
  perceptionEscalate: boolean;
  screenshotOutboundBytes: number;
  detail: string;
}

export interface HiddenSummary {
  corpusId: string;
  corpusHash: string;
  independence: 'HELD-OUT TEMPLATE EVALUATION';
  n: number;
  completed: number;
  correctAbstention: number;
  wrongAction: number;
  falseComplete: number;
  privacyPass: number;
  privacyFail: number;
  byClass: Array<{
    siteClass: HiddenSiteClass;
    n: number;
    completed: number;
    correctAbstention: number;
    wrongAction: number;
    falseComplete: number;
    privacyPass: number;
    expectedHit: number;
  }>;
  rows: HiddenCaseResult[];
}
