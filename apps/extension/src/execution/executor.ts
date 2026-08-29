import type { ValidatedAction } from '@n-eye/protocol';
import type { ElementRegistry } from '../content/registry.js';
import { assertLiveAuthority, regroundTarget, TargetStaleError } from '../authority/regrounding.js';

export interface ExecutionResult {
  success: boolean;
  error?: string;
  targetTag?: string;
  outcome?: 'SAFE_REGROUND' | 'REOBSERVE' | 'REPLAN' | 'ASK_USER' | 'BLOCK';
}

function routeStillCompatible(observedUrl: string | undefined): { ok: boolean; error?: string } {
  if (!observedUrl || typeof window === 'undefined') return { ok: true };
  try {
    const planned = new URL(observedUrl);
    const live = new URL(window.location.href);
    if (planned.origin !== live.origin) {
      return { ok: false, error: 'Active origin is no longer compatible with the validated action.' };
    }
    if (planned.pathname !== live.pathname || planned.search !== live.search) {
      return { ok: false, error: 'SPA route changed after planning. Old target authority is stale.' };
    }
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

/**
 * Executes a validated action against the live DOM.
 * STRICT AUTHORITY INVARIANT: Accepts ONLY ValidatedAction. ActionProposals are rejected.
 * TOCTOU: Re-grounds, then re-checks live authority immediately before native dispatch.
 */
export function executeValidatedAction(
  action: ValidatedAction,
  registry: ElementRegistry
): ExecutionResult {
  if (!action._isValidated) {
    return { success: false, error: 'Unvalidated action cannot be executed by the local authority.', outcome: 'BLOCK' };
  }

  const { proposal, targetElementId, resolvedTokenValue } = action;

  if (proposal.type === 'COMPLETE' || proposal.type === 'WAIT') {
    return { success: true };
  }

  if (!targetElementId) {
    return { success: false, error: 'Action missing target element ID.', outcome: 'BLOCK' };
  }

  const route = routeStillCompatible(action.observedUrl);
  if (!route.ok) {
    return { success: false, error: route.error, outcome: 'REOBSERVE' };
  }

  let liveNode: HTMLElement;
  try {
    const reground = regroundTarget(
      targetElementId,
      registry,
      action.expectedFingerprint,
      action.expectedFrameId
    );
    if (action.expectedFingerprint && !reground.isFingerprintMatch) {
      return {
        success: false,
        error: `Target ${targetElementId} semantic fingerprint mismatch. Re-observation required.`,
        outcome: 'BLOCK',
      };
    }
    liveNode = reground.node;
    assertLiveAuthority(liveNode, action.expectedFingerprint, action.expectedFrameId);
  } catch (err) {
    if (err instanceof TargetStaleError) {
      return { success: false, error: err.message, outcome: err.outcome };
    }
    return { success: false, error: (err as Error).message, outcome: 'BLOCK' };
  }

  try {
    if (proposal.type === 'CLICK') {
      liveNode.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
      liveNode.focus();
      assertLiveAuthority(liveNode, action.expectedFingerprint, action.expectedFrameId);
      liveNode.click();
      return { success: true, targetTag: liveNode.tagName.toLowerCase(), outcome: 'SAFE_REGROUND' };
    }

    if (proposal.type === 'TYPE_TOKEN' || proposal.type === 'TYPE_TEXT') {
      const textToType = proposal.type === 'TYPE_TOKEN' ? resolvedTokenValue || '' : proposal.textValue || '';

      liveNode.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
      liveNode.focus();
      assertLiveAuthority(liveNode, action.expectedFingerprint, action.expectedFrameId);

      if (liveNode instanceof HTMLInputElement || liveNode instanceof HTMLTextAreaElement) {
        liveNode.value = textToType;
        liveNode.dispatchEvent(new Event('input', { bubbles: true }));
        liveNode.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (liveNode.isContentEditable) {
        liveNode.textContent = textToType;
        liveNode.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        return { success: false, error: `Target ${targetElementId} is not an input or editable element.`, outcome: 'BLOCK' };
      }

      return { success: true, targetTag: liveNode.tagName.toLowerCase(), outcome: 'SAFE_REGROUND' };
    }

    return { success: false, error: `Unsupported action type: ${proposal.type}`, outcome: 'BLOCK' };
  } catch (err) {
    if (err instanceof TargetStaleError) {
      return { success: false, error: err.message, outcome: err.outcome };
    }
    return { success: false, error: (err as Error).message, outcome: 'BLOCK' };
  }
}
