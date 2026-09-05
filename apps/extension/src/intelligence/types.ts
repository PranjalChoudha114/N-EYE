/**
 * Local goal-intelligence contracts (Zone 3).
 *
 * OWNS: Interpreted user language before any planner proposes an action.
 * TRUST: This is not authority. ActionProposal remains untrusted advice.
 * MUST NOT: Grant execution, mint confirmation, or expand egress.
 */

export type IntentFamily =
  | 'SEARCH'
  | 'NAVIGATE'
  | 'CLICK'
  | 'FORM_FILL'
  | 'SELECT'
  | 'FIND'
  | 'SCROLL'
  | 'MULTI_STEP'
  | 'RECOVERY'
  | 'UNSUPPORTED';

export type SubgoalKind =
  | 'IDENTIFY_SEARCH'
  | 'ENTER_QUERY'
  | 'PROVE_QUERY'
  | 'IDENTIFY_SUBMIT'
  | 'SUBMIT'
  | 'PROVE_SEARCH_OUTCOME'
  | 'ACTIVATE_TARGET'
  | 'PROVE_ACTIVATION'
  | 'FILL_FIELD'
  | 'PROVE_FIELD'
  | 'SELECT_OPTION'
  | 'SCROLL_VIEW'
  | 'CONTINUE';

export type GoalInterpreterSource = 'DETERMINISTIC_PARSER';

/**
 * Possessive shorthand ("my repo") may consult verified local memory for ranking.
 * TRUST: Preference never changes risk, confirmation, or privacy floors.
 */
export type PreferenceHint = 'POSSESSIVE_RESOURCE';

export interface InterpretedGoal {
  family: IntentFamily;
  rawGoal: string;
  confidence: number;
  entity?: string;
  /** Resource to open after a composite SEARCH (not part of the query). */
  tailEntity?: string;
  constraints: string[];
  fieldHints: string[];
  labelHints: string[];
  queryText?: string;
  optionText?: string;
  scrollDirection?: 'up' | 'down' | 'left' | 'right';
  requiresSearchSubmit: boolean;
  /** Do not propose SUBMIT/PRESS_ENTER even if a form is present. */
  forbidSubmit?: boolean;
  preferenceHint?: PreferenceHint;
  subgoals: SubgoalKind[];
  remainingSubgoals: SubgoalKind[];
  expectedPostcondition: string;
  ambiguity?: string;
  source: GoalInterpreterSource;
}

export type ReasoningProvenance = 'DETERMINISTIC_LOCAL' | 'LOCAL_MODEL' | 'REMOTE_PROVIDER';

export type IntelligenceRoutingPolicy = 'exclusive' | 'capability';
