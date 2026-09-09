/**
 * ASK_USER clarification copy and recovery (Zone 2 product language).
 * OWNS: Mapping ASK_USER reasons to a rewrite-and-continue path.
 * TRUST: This is not confirmation. Continue starts a fresh trust loop. Dismiss returns to READY.
 * MUST NEVER: Mint Allow/Deny, execute a stale proposal, or let page/planner HTML define controls.
 */

export type AskUserReason =
  | 'UNKNOWN_GOAL'
  | 'AMBIGUOUS_TARGET'
  | 'UNSUPPORTED_CONTROL'
  | 'NO_SUPPORTED_ACTION'
  | 'VERIFICATION_AMBIGUOUS'
  | 'TYPE_UNVERIFIED'
  | 'CUSTOM_SELECT'
  | 'MULTIPLE_CANDIDATES'
  | 'COMPLETION_UNPROVEN'
  | 'HIGH_UNVERIFIED'
  | 'SEARCH_SUBMIT_MISSING'
  | 'PARTIAL_GOAL'
  | 'TARGET_NOT_FOUND'
  | 'ENGINE_FAILURE'
  | 'VISUAL_UNBOUND';

export interface AskUserView {
  reason: AskUserReason;
  headline: string;
  message: string;
  hint: string;
  continueLabel: string;
  dismissLabel: string;
  /** Original engineering/planner text. Evidence tab only. Never an approval reason. */
  technicalDetail: string;
}

const CONTINUE = 'Continue';
const DISMISS = 'Cancel';
const HINT = 'Rewrite your request below, then continue. This is not an approval.';

const RULES: Array<{ reason: AskUserReason; tests: RegExp[] }> = [
  { reason: 'VISUAL_UNBOUND', tests: [/visual_unbound/i, /could not uniquely bind/i, /found no readable text to bind/i] },
  { reason: 'TARGET_NOT_FOUND', tests: [/no unique matching target/i, /was not found in current scene/i, /target_not_found/i, /requires a targetid/i] },
  { reason: 'ENGINE_FAILURE', tests: [/cannot read propert/i, /targetcurrent/i, /stopped without changing anything/i] },
  { reason: 'AMBIGUOUS_TARGET', tests: [/multiple matching/i, /will not guess which/i] },
  { reason: 'MULTIPLE_CANDIDATES', tests: [/multiple equivalent/i] },
  { reason: 'CUSTOM_SELECT', tests: [/custom widgets/i, /unique native select/i] },
  { reason: 'SEARCH_SUBMIT_MISSING', tests: [/no unique search button/i, /multiple search\/submit/i] },
  {
    reason: 'PARTIAL_GOAL',
    tests: [
      /search was not submitted/i,
      /search actually occurred/i,
      /no longer holds the requested text/i,
      /complete this step/i,
      /enter was sent/i,
      /form was not submitted/i,
    ],
  },
  { reason: 'HIGH_UNVERIFIED', tests: [/high-risk action could not be verified/i] },
  { reason: 'TYPE_UNVERIFIED', tests: [/typed text could not/i, /did not keep the intended text/i, /field did not keep/i] },
  { reason: 'VERIFICATION_AMBIGUOUS', tests: [/verification was ambiguous/i, /could not be verified/i] },
  { reason: 'COMPLETION_UNPROVEN', tests: [/completion evidence/i, /inconsistent with VALIDATE/i] },
  { reason: 'UNSUPPORTED_CONTROL', tests: [/no supported text field/i, /can't safely use this control/i] },
  { reason: 'UNKNOWN_GOAL', tests: [/outside the .*grammar/i, /will not invent success/i, /next instruction/i] },
  { reason: 'NO_SUPPORTED_ACTION', tests: [/no unique supported control/i] },
];

const HUMAN: Record<AskUserReason, string> = {
  UNKNOWN_GOAL:
    'I cannot safely decide the next step for this request. Name a specific button or field, then continue.',
  AMBIGUOUS_TARGET:
    'N-Eye found more than one control that could match. Because it could not prove which one you intended, it stopped without changing the page.',
  UNSUPPORTED_CONTROL:
    'I cannot safely use this control yet. Try a different control, or complete this step on the page.',
  NO_SUPPORTED_ACTION:
    'No unique supported control matched this request. Rewrite it more specifically, then continue.',
  VERIFICATION_AMBIGUOUS:
    'I could not confirm that the last action worked. Check the page, then rewrite or continue.',
  TYPE_UNVERIFIED:
    'The text did not stay in the field as expected. Check the page, then rewrite or continue.',
  CUSTOM_SELECT:
    'This choice control is not a standard dropdown I can use safely. Choose the option on the page, or rewrite.',
  MULTIPLE_CANDIDATES:
    'Several similar fields matched. Name the exact field, then continue.',
  COMPLETION_UNPROVEN:
    'I will not mark this done without local proof. Rewrite the remaining step, then continue.',
  HIGH_UNVERIFIED:
    'A high-risk action could not be confirmed, so N-Eye will not repeat it automatically. Check the page, then continue if needed.',
  SEARCH_SUBMIT_MISSING:
    'The text may be entered, but I found no unique search button to click. Click search on the page, or rewrite.',
  PARTIAL_GOAL:
    'This step needs you. Finish it on the page, or rewrite the remaining request and continue.',
  TARGET_NOT_FOUND:
    "I couldn't find one safe, unique control that matches your request, so I stopped without clicking anything.",
  ENGINE_FAILURE:
    'Something went wrong while checking this page. N-Eye stopped without changing anything.',
  VISUAL_UNBOUND:
    'N-Eye read the page visually but could not uniquely bind that text to one control, so it stopped rather than guessing.',
};

export function classifyAskUser(detail: string): AskUserReason {
  const text = detail.trim();
  for (const rule of RULES) {
    if (rule.tests.some((re) => re.test(text))) return rule.reason;
  }
  return 'UNKNOWN_GOAL';
}

export function buildAskUserView(detail?: string): AskUserView {
  const technicalDetail = (detail || '').trim();
  const reason = classifyAskUser(technicalDetail);
  return {
    reason,
    headline: 'I need your help',
    message: HUMAN[reason],
    hint: HINT,
    continueLabel: CONTINUE,
    dismissLabel: DISMISS,
    technicalDetail: technicalDetail || HUMAN[reason],
  };
}

export function isAskUserApprovalCopy(text: string): boolean {
  return /allow once|don't allow|confirm this action|approval required/i.test(text);
}
