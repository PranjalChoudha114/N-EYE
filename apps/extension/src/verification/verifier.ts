import type {
  ExecutionEvidence,
  RawScene,
  ValidatedAction,
  VerificationResult,
} from '@n-eye/protocol';

/**
 * ActionVerifier (Zone 3 - Trusted Verification)
 * OWNS: Empirical post-execution state-delta analysis against a fresh observation.
 * INVARIANT: Native click() returning is not success. Success requires measured evidence.
 * PRIVACY: ExecutionEvidence must never carry raw token or field values.
 */
export function verifyActionExecution(
  action: ValidatedAction,
  preScene: RawScene,
  postScene: RawScene,
  execEvidence?: ExecutionEvidence
): VerificationResult {
  const actionId = action.proposal.actionId;
  const preEpoch = preScene.pageEpoch;
  const postEpoch = postScene.pageEpoch;
  const evidence = execEvidence;

  if (action.proposal.type === 'COMPLETE') {
    return {
      actionId,
      status: 'AMBIGUOUS',
      observedDelta: 'Planner COMPLETE is not local proof of success.',
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
      evidence,
    };
  }

  if (action.proposal.type === 'WAIT') {
    return {
      actionId,
      status: 'VERIFIED_SUCCESS',
      observedDelta: 'Bounded settle wait completed.',
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
      evidence,
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
      evidence,
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
      evidence,
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
      evidence,
    };
  }

  if (action.proposal.type === 'TYPE_TOKEN' || action.proposal.type === 'TYPE_TEXT') {
    if (evidence?.fieldState === 'MATCHED') {
      return {
        actionId,
        status: 'VERIFIED_SUCCESS',
        observedDelta: `Typed value matches the live control (value not recorded).`,
        preEpoch,
        postEpoch,
        timestamp: Date.now(),
        evidence: { fieldState: 'MATCHED' },
      };
    }
    if (evidence?.fieldState === 'EMPTY' || evidence?.fieldState === 'DIVERGED') {
      return {
        actionId,
        status: 'VERIFIED_FAILURE',
        observedDelta: 'Control did not retain the intended value.',
        preEpoch,
        postEpoch,
        timestamp: Date.now(),
        evidence: { fieldState: evidence.fieldState },
      };
    }
    if (evidence?.fieldState === 'TARGET_REPLACED') {
      return {
        actionId,
        status: 'VERIFIED_FAILURE',
        observedDelta: 'The typed control was replaced and could not be uniquely re-grounded.',
        preEpoch,
        postEpoch,
        timestamp: Date.now(),
        evidence: { fieldState: 'TARGET_REPLACED' },
      };
    }
    if (evidence?.fieldState === 'AMBIGUOUS') {
      return {
        actionId,
        status: 'AMBIGUOUS',
        observedDelta: 'Multiple equivalent fields after the action. N-Eye will not guess.',
        preEpoch,
        postEpoch,
        timestamp: Date.now(),
        evidence: { fieldState: 'AMBIGUOUS' },
      };
    }
    return {
      actionId,
      status: 'AMBIGUOUS',
      observedDelta: 'Typed-field resulting state could not be confirmed. Dispatch is not treated as success.',
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
      evidence,
    };
  }

  if (action.proposal.type === 'SELECT') {
    if (evidence?.selectMatched === true) {
      return {
        actionId,
        status: 'VERIFIED_SUCCESS',
        observedDelta: `Native select matched the requested option (option text not recorded).`,
        preEpoch,
        postEpoch,
        timestamp: Date.now(),
        evidence: { selectMatched: true },
      };
    }
    if (evidence?.selectMatched === false) {
      return {
        actionId,
        status: 'VERIFIED_FAILURE',
        observedDelta: 'Native select did not match the requested option.',
        preEpoch,
        postEpoch,
        timestamp: Date.now(),
        evidence: { selectMatched: false },
      };
    }
    return {
      actionId,
      status: 'AMBIGUOUS',
      observedDelta: 'SELECT resulting state was not confirmed locally.',
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
      evidence,
    };
  }

  if (action.proposal.type === 'SCROLL') {
    if (evidence?.scrollMoved === true) {
      return {
        actionId,
        status: 'VERIFIED_SUCCESS',
        observedDelta: 'Scroll position changed.',
        preEpoch,
        postEpoch,
        timestamp: Date.now(),
        evidence: { scrollMoved: true },
      };
    }
    if (evidence?.atScrollBoundary === true) {
      return {
        actionId,
        status: 'VERIFIED_SUCCESS',
        observedDelta: 'Already at scroll boundary; no additional movement.',
        preEpoch,
        postEpoch,
        timestamp: Date.now(),
        evidence: { scrollMoved: false, atScrollBoundary: true },
      };
    }
    if (evidence?.scrollMoved === false) {
      return {
        actionId,
        status: 'VERIFIED_FAILURE',
        observedDelta: 'Scroll was dispatched but position did not change.',
        preEpoch,
        postEpoch,
        timestamp: Date.now(),
        evidence: { scrollMoved: false },
      };
    }
    return {
      actionId,
      status: 'AMBIGUOUS',
      observedDelta: 'Scroll resulting state was not confirmed locally.',
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
      evidence,
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
      evidence,
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
      evidence,
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
      evidence,
    };
  }

  return {
    actionId,
    status: 'VERIFIED_FAILURE',
    observedDelta: 'No navigation, target consumption, or action-correlated state change detected after execution.',
    preEpoch,
    postEpoch,
    timestamp: Date.now(),
    evidence,
  };
}

function semanticShift(before: string | null | undefined, after: string | null | undefined): boolean {
  return (before || '').trim().toLowerCase() !== (after || '').trim().toLowerCase();
}
