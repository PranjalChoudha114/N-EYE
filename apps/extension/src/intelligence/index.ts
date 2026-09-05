export type {
  GoalInterpreterSource,
  IntelligenceRoutingPolicy,
  IntentFamily,
  InterpretedGoal,
  PreferenceHint,
  ReasoningProvenance,
  SubgoalKind,
} from './types.js';
export {
  compactLabel,
  entityTokens,
  fieldIdentityHints,
  hintTokens,
  interpretGoal,
  isChromeNounQuery,
  looksLikeSearchSubmitGoal,
  scoreLabelAgainstHints,
} from './goal-interpreter.js';
export {
  createTaskGoalState,
  currentSubgoal,
  markSubgoalComplete,
  reconcileAfterVerifiedAction,
  searchStillRequiresSubmit,
  type TaskGoalState,
} from './task-state.js';
export {
  MAX_IDENTICAL_ACTION_FAILURES,
  MAX_RECOVERY_ATTEMPTS,
  beginRecoveryBudget,
  identicalFailureKey,
  remoteEscalationPermittedAfterFailure,
  shouldAbstainAfterFailure,
} from './recovery-policy.js';
export {
  decideNalisPath,
  decideReasoningSource,
  deterministicIsSufficient,
  isAmbiguousAbstention,
  isUnsupportedAbstention,
} from './router.js';
export {
  MAX_EXPLORE_SCROLLS,
  EXPLORE_SCROLL_PX,
  explorationSignature,
  priorWasExplorationScroll,
  semanticStateHash,
  shouldExploreForMissingTarget,
} from './exploration-policy.js';
export {
  decideLocalLanguageModelAdmission,
  runGoalIntelligenceBench,
  GOAL_INTELLIGENCE_CORPUS,
} from './admission-bench.js';
export { NALIS_VERSION, createFailureRecord, mapFailureToRecovery } from './failure-taxonomy.js';
export { createTaskGraph, successContractFor, compositeStillNeedsResourceOpen } from './task-graph.js';
export { buildSemanticUiGraph, inferAffordance, evidenceConfidence, isSearchField } from './semantic-ui.js';
export {
  evaluateLearningEligibility,
  getNalisMemory,
  resetNalisMemoryForTests,
  sanitizeMemoryText,
} from './memory.js';
export { parseConstrainedIntel, detectBrowserLocalAi, detectWebGpu } from './provider.js';
export { ForensicTrace, snapshotNalisHealth } from './forensic.js';
export { NALIS_CORPUS, runNalisIntelligenceBench } from './nalis-bench.js';
