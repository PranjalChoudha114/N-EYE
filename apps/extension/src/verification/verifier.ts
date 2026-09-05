import {
  computeSemanticIdentity,
  TOP_FRAME_ID,
  type ExecutionEvidence,
  type RawElement,
  type RawScene,
  type TargetFingerprint,
  type ValidatedAction,
  type VerificationResult,
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
      observedDelta: `Origin transitioned to ${safeUrlEvidence(postScene.origin)}`,
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
      observedDelta: `Navigation detected: URL transitioned to ${safeUrlEvidence(postScene.url)}`,
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

  const liveMatch = matchLiveTargetBySemanticIdentity(action, preScene, postScene);
  if (liveMatch.kind === 'consumed') {
    return {
      actionId,
      status: 'VERIFIED_SUCCESS',
      observedDelta: 'The authorized target is no longer uniquely present after the action.',
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
      evidence,
    };
  }
  if (liveMatch.kind === 'ambiguous') {
    return {
      actionId,
      status: 'AMBIGUOUS',
      observedDelta: 'Multiple equivalent targets after the action. N-Eye will not treat reminted ids as consumption.',
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
      evidence,
    };
  }
  const preTarget = liveMatch.kind === 'present' ? liveMatch.pre : undefined;
  const postTarget = liveMatch.kind === 'present' ? liveMatch.post : undefined;

  if (action.proposal.type === 'CLICK' && evidence?.targetIdentityChanged === true) {
    return {
      actionId,
      status: 'VERIFIED_SUCCESS',
      observedDelta: 'The clicked control changed identity or explicit state after the authorized click.',
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
      evidence: { targetIdentityChanged: true },
    };
  }

  if (preTarget && postTarget && semanticShift(preTarget.innerTextCandidate, postTarget.innerTextCandidate)) {
    return {
      actionId,
      status: 'VERIFIED_SUCCESS',
      observedDelta: 'The authorized target’s visible name changed after the action.',
      preEpoch,
      postEpoch,
      timestamp: Date.now(),
      evidence,
    };
  }

  if (postScene.elements.length !== preScene.elements.length) {
    return {
      actionId,
      status: 'AMBIGUOUS',
      observedDelta: `Interactive control set changed (${preScene.elements.length} → ${postScene.elements.length}) without a target-correlated effect. Autocomplete churn is not success.`,
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

/** Search outcome proof. Epoch and control-set churn are not search success. */
export function verificationShowsNavigation(preScene: RawScene, postScene: RawScene): boolean {
  return preScene.origin !== postScene.origin || preScene.url !== postScene.url;
}

function semanticShift(before: string | null | undefined, after: string | null | undefined): boolean {
  return (before || '').trim().toLowerCase() !== (after || '').trim().toLowerCase();
}

/**
 * PRIVACY: Query/hash can carry session tokens. Evidence and priorOutcome must not republish them.
 */
export function safeUrlEvidence(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return 'url';
  }
}

function frameIdOf(element: RawElement): string {
  return element.frameProvenance?.frameId ?? TOP_FRAME_ID;
}

function semanticKeyOf(fp: TargetFingerprint | undefined, fallback?: RawElement): string {
  if (fp) {
    return computeSemanticIdentity(fp.role, fp.tagName, fp.inputType, fp.normalizedLabelCandidate);
  }
  if (!fallback) return '';
  return computeSemanticIdentity(
    fallback.role || fallback.tagName,
    fallback.tagName,
    fallback.inputType,
    fallback.innerTextCandidate || fallback.ariaLabel || ''
  );
}

/**
 * Opaque eN is reminted every observe. Consumption and label-shift must use semantic identity.
 * WHY: Matching post e3 to pre e3 after autocomplete is a first-incorrect-transition (false success).
 */
function matchLiveTargetBySemanticIdentity(
  action: ValidatedAction,
  preScene: RawScene,
  postScene: RawScene
):
  | { kind: 'none' }
  | { kind: 'consumed'; pre?: RawElement }
  | { kind: 'ambiguous'; pre?: RawElement }
  | { kind: 'present'; pre?: RawElement; post: RawElement } {
  if (!action.targetElementId && !action.expectedFingerprint) {
    return { kind: 'none' };
  }
  const frameWanted = action.expectedFrameId ?? TOP_FRAME_ID;
  const pre =
    preScene.elements.find((e) => e.id === action.targetElementId) ||
    preScene.elements.find(
      (e) =>
        Boolean(action.expectedFingerprint) &&
        semanticKeyOf(e.fingerprint, e) === semanticKeyOf(action.expectedFingerprint) &&
        frameIdOf(e) === frameWanted
    );
  const key = semanticKeyOf(action.expectedFingerprint, pre);
  if (!key) return { kind: 'none' };
  const frame = action.expectedFrameId ?? (pre ? frameIdOf(pre) : TOP_FRAME_ID);
  const matches = postScene.elements.filter((el) => frameIdOf(el) === frame && semanticKeyOf(el.fingerprint, el) === key);
  if (matches.length === 1 && matches[0]) {
    return { kind: 'present', pre, post: matches[0] };
  }
  if (matches.length === 0 && (pre || action.expectedFingerprint)) {
    return { kind: 'consumed', pre };
  }
  if (matches.length > 1) {
    return { kind: 'ambiguous', pre };
  }
  return { kind: 'none' };
}
