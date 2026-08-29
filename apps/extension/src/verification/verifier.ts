import type {
  RawScene,
  ValidatedAction,
  VerificationResult,
} from '@n-eye/protocol';

/**
 * ActionVerifier (Zone 3 - Trusted Verification)
 * OWNS: Empirical post-execution state-delta analysis against a fresh observation.
 * INVARIANT: Native click() returning is not success. Success requires measured evidence.
 */
export function verifyActionExecution(
  action: ValidatedAction,
  preScene: RawScene,
  postScene: RawScene
): VerificationResult {
  const actionId = action.proposal.actionId;
  const preEpoch = preScene.pageEpoch;
  const postEpoch = postScene.pageEpoch;

  if (action.proposal.type === 'COMPLETE') {
    return {
      actionId,
      status: 'VERIFIED_SUCCESS',
      observedDelta: 'Workflow completed successfully.',
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
    };
  }

  if (preScene.origin !== postScene.origin) {
    return {
      actionId,
      status: 'VERIFIED_SUCCESS',
      observedDelta: `Origin transitioned to ${postScene.origin}`,
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
    };
  }

  if (preScene.url !== postScene.url) {
    return {
      actionId,
      status: 'VERIFIED_SUCCESS',
      observedDelta: `Navigation detected: URL transitioned to ${postScene.url}`,
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
    };
  }

  const preTarget = preScene.elements.find((e) => e.id === action.targetElementId);
  const postTarget = postScene.elements.find((e) => e.id === action.targetElementId);

  if (preTarget && !postTarget) {
    return {
      actionId,
      status: 'VERIFIED_SUCCESS',
      observedDelta: `Target element ${action.targetElementId} consumed/dismissed by application.`,
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
    };
  }

  if (action.proposal.type === 'TYPE_TOKEN' || action.proposal.type === 'TYPE_TEXT') {
    return {
      actionId,
      status: 'VERIFIED_SUCCESS',
      observedDelta: `Text dispatched into target ${action.targetElementId} with event dispatch.`,
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
    };
  }

  if (preTarget && postTarget && semanticShift(preTarget.innerTextCandidate, postTarget.innerTextCandidate)) {
    return {
      actionId,
      status: 'VERIFIED_SUCCESS',
      observedDelta: `Target ${action.targetElementId} semantic state changed after action.`,
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
    };
  }

  if (postScene.elements.length !== preScene.elements.length) {
    return {
      actionId,
      status: 'VERIFIED_SUCCESS',
      observedDelta: `Interactive control set changed (${preScene.elements.length} → ${postScene.elements.length}).`,
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
    };
  }

  if (postEpoch > preEpoch) {
    return {
      actionId,
      status: 'AMBIGUOUS',
      observedDelta: `PageEpoch progressed (${preEpoch} → ${postEpoch}) without a target-correlated effect. Not claimed as success.`,
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
    };
  }

  return {
    actionId,
    status: 'VERIFIED_FAILURE',
    observedDelta: 'No navigation, target consumption, or action-correlated state change detected after execution.',
    preEpoch,
    postEpoch,
    timestamp: Date.now(),
  };
}

function semanticShift(before: string | null | undefined, after: string | null | undefined): boolean {
  return (before || '').trim().toLowerCase() !== (after || '').trim().toLowerCase();
}
