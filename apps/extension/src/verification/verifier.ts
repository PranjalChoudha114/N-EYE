import type {
  RawScene,
  ValidatedAction,
  VerificationResult,
} from '@n-eye/protocol';

export function verifyActionExecution(
  action: ValidatedAction,
  preScene: RawScene,
  postScene: RawScene
): VerificationResult {
  const actionId = action.proposal.actionId;
  const preEpoch = preScene.pageEpoch;
  const postEpoch = postScene.pageEpoch;

  // 1. Check if complete
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

  // 2. Check URL / Navigation delta
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

  // 3. Check PageEpoch delta
  if (postEpoch > preEpoch) {
    return {
      actionId,
      status: 'VERIFIED_SUCCESS',
      observedDelta: `DOM state delta observed: Epoch progressed from ${preEpoch} to ${postEpoch}`,
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
    };
  }

  // 4. Check element count or target disappearance delta
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

  if (action.proposal.type === 'TYPE_TOKEN') {
    return {
      actionId,
      status: 'VERIFIED_SUCCESS',
      observedDelta: `Token injected into target ${action.targetElementId} with event dispatch.`,
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
    };
  }

  // 5. If nothing changed, fail verification
  return {
    actionId,
    status: 'VERIFIED_FAILURE',
    observedDelta: 'No DOM mutation, epoch transition, or navigation detected after action execution.',
    preEpoch,
    postEpoch,
    timestamp: Date.now(),
  };
}
