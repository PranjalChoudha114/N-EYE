import type { ExecutionEvidence, FieldValueState, ValidatedAction } from '@n-eye/protocol';
import type { ElementRegistry } from '../content/registry.js';
import { assertLiveAuthority, regroundTarget, TargetStaleError } from '../authority/regrounding.js';

export const MAX_SCROLL_EXECUTE_PX = 800;

export interface ExecutionResult extends ExecutionEvidence {
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

function clampScroll(delta: number): number {
  if (!Number.isFinite(delta)) return 0;
  return Math.max(-MAX_SCROLL_EXECUTE_PX, Math.min(MAX_SCROLL_EXECUTE_PX, delta));
}

/**
 * Compare a live control's current value to the intended string without logging either.
 * PRIVACY: expected and actual never leave this function.
 */
export function readTypedFieldState(node: HTMLElement, expected: string): FieldValueState {
  if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
    if (node.value === expected) return 'MATCHED';
    if (node.value.length === 0) return 'EMPTY';
    return 'DIVERGED';
  }
  if (node.isContentEditable) {
    const actual = node.textContent || '';
    if (actual === expected) return 'MATCHED';
    if (actual.trim().length === 0) return 'EMPTY';
    return 'DIVERGED';
  }
  return 'UNREADABLE';
}

function isScrollContainer(node: HTMLElement): boolean {
  const view = node.ownerDocument.defaultView;
  if (!view) return false;
  const style = view.getComputedStyle(node);
  const overflowY = style.overflowY;
  const overflowX = style.overflowX;
  const canY = (overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1;
  const canX = (overflowX === 'auto' || overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1;
  return canY || canX;
}

function executeViewportScroll(dx: number, dy: number): ExecutionResult {
  if (typeof window === 'undefined') {
    return { success: false, error: 'Viewport scroll requires a window.', outcome: 'BLOCK' };
  }
  const beforeX = window.scrollX;
  const beforeY = window.scrollY;
  window.scrollBy({ left: dx, top: dy, behavior: 'instant' as ScrollBehavior });
  const moved = window.scrollX !== beforeX || window.scrollY !== beforeY;
  const maxY = Math.max(0, (document.documentElement.scrollHeight || 0) - window.innerHeight);
  const maxX = Math.max(0, (document.documentElement.scrollWidth || 0) - window.innerWidth);
  const atBoundary =
    !moved &&
    ((dy < 0 && beforeY <= 0) ||
      (dy > 0 && beforeY >= maxY - 1) ||
      (dx < 0 && beforeX <= 0) ||
      (dx > 0 && beforeX >= maxX - 1) ||
      (dx === 0 && dy === 0));
  return {
    success: true,
    outcome: 'SAFE_REGROUND',
    scrollMoved: moved,
    atScrollBoundary: atBoundary,
  };
}

function executeNodeScroll(node: HTMLElement, dx: number, dy: number): ExecutionResult {
  if (isScrollContainer(node)) {
    const beforeX = node.scrollLeft;
    const beforeY = node.scrollTop;
    node.scrollBy({ left: dx, top: dy, behavior: 'instant' as ScrollBehavior });
    const moved = node.scrollLeft !== beforeX || node.scrollTop !== beforeY;
    const atBoundary =
      !moved &&
      ((dy < 0 && beforeY <= 0) ||
        (dy > 0 && beforeY + node.clientHeight >= node.scrollHeight - 1) ||
        (dx < 0 && beforeX <= 0) ||
        (dx > 0 && beforeX + node.clientWidth >= node.scrollWidth - 1));
    return {
      success: true,
      targetTag: node.tagName.toLowerCase(),
      outcome: 'SAFE_REGROUND',
      scrollMoved: moved,
      atScrollBoundary: atBoundary,
    };
  }
  const beforeX = typeof window !== 'undefined' ? window.scrollX : 0;
  const beforeY = typeof window !== 'undefined' ? window.scrollY : 0;
  node.scrollIntoView({
    block: dy < 0 ? 'start' : 'end',
    inline: 'nearest',
    behavior: 'instant' as ScrollBehavior,
  });
  const moved = typeof window !== 'undefined' && (window.scrollX !== beforeX || window.scrollY !== beforeY);
  return {
    success: true,
    targetTag: node.tagName.toLowerCase(),
    outcome: 'SAFE_REGROUND',
    scrollMoved: moved,
    atScrollBoundary: !moved,
  };
}

function executeNativeSelect(select: HTMLSelectElement, wanted: string): ExecutionResult {
  const match = Array.from(select.options).find(
    (option) => option.value === wanted || option.text.trim() === wanted || option.label === wanted
  );
  if (!match) {
    return {
      success: false,
      error: 'Requested option is not present on this native select.',
      outcome: 'ASK_USER',
      selectMatched: false,
    };
  }
  if (match.disabled) {
    return {
      success: false,
      error: 'Requested select option is disabled.',
      outcome: 'BLOCK',
      selectMatched: false,
    };
  }
  select.value = match.value;
  select.dispatchEvent(new Event('input', { bubbles: true }));
  select.dispatchEvent(new Event('change', { bubbles: true }));
  const matched = select.value === match.value;
  return {
    success: true,
    targetTag: 'select',
    outcome: 'SAFE_REGROUND',
    selectMatched: matched,
    fieldState: matched ? 'MATCHED' : 'DIVERGED',
  };
}

function liveNodeForAction(action: ValidatedAction, registry: ElementRegistry): HTMLElement | ExecutionResult {
  const { proposal, targetElementId } = action;
  if (!targetElementId) {
    return { success: false, error: 'Action missing target element ID.', outcome: 'BLOCK' };
  }
  const route = routeStillCompatible(action.observedUrl);
  if (!route.ok) {
    return { success: false, error: route.error, outcome: 'REOBSERVE' };
  }
  try {
    const reground = regroundTarget(
      targetElementId,
      registry,
      action.expectedFingerprint,
      action.expectedFrameId,
      { usesToken: proposal.type === 'TYPE_TOKEN', approvedRiskLevel: action.approvedRiskLevel }
    );
    if (action.expectedFingerprint && !reground.isFingerprintMatch) {
      return {
        success: false,
        error: `Target ${targetElementId} semantic fingerprint mismatch. Re-observation required.`,
        outcome: 'BLOCK',
      };
    }
    assertLiveAuthority(reground.node, action.expectedFingerprint, action.expectedFrameId);
    return reground.node;
  } catch (err) {
    if (err instanceof TargetStaleError) {
      return { success: false, error: err.message, outcome: err.outcome };
    }
    return { success: false, error: (err as Error).message, outcome: 'BLOCK' };
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

  const { proposal, resolvedTokenValue } = action;

  if (proposal.type === 'COMPLETE' || proposal.type === 'WAIT') {
    return { success: true };
  }

  if (proposal.type === 'SCROLL') {
    const dx = clampScroll(proposal.scrollDelta?.x ?? 0);
    const dy = clampScroll(proposal.scrollDelta?.y ?? 0);
    if (!action.targetElementId) {
      return executeViewportScroll(dx, dy);
    }
    const live = liveNodeForAction(action, registry);
    if (!(live instanceof HTMLElement)) return live;
    try {
      assertLiveAuthority(live, action.expectedFingerprint, action.expectedFrameId);
      return executeNodeScroll(live, dx, dy);
    } catch (err) {
      if (err instanceof TargetStaleError) {
        return { success: false, error: err.message, outcome: err.outcome };
      }
      return { success: false, error: (err as Error).message, outcome: 'BLOCK' };
    }
  }

  const live = liveNodeForAction(action, registry);
  if (!(live instanceof HTMLElement)) return live;
  const liveNode = live;

  try {
    if (proposal.type === 'CLICK') {
      liveNode.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
      liveNode.focus();
      assertLiveAuthority(liveNode, action.expectedFingerprint, action.expectedFrameId);
      liveNode.click();
      return { success: true, targetTag: liveNode.tagName.toLowerCase(), outcome: 'SAFE_REGROUND' };
    }

    if (proposal.type === 'SELECT') {
      liveNode.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
      liveNode.focus();
      assertLiveAuthority(liveNode, action.expectedFingerprint, action.expectedFrameId);
      if (!(liveNode instanceof HTMLSelectElement)) {
        return {
          success: false,
          error: 'Custom select widgets are not executed. Ask the user to choose the option.',
          outcome: 'ASK_USER',
          selectMatched: false,
        };
      }
      const wanted = proposal.textValue || '';
      if (!wanted) {
        return {
          success: false,
          error: 'SELECT requires a local option label or value.',
          outcome: 'ASK_USER',
          selectMatched: false,
        };
      }
      return executeNativeSelect(liveNode, wanted);
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
        return { success: false, error: `Target ${action.targetElementId} is not an input or editable element.`, outcome: 'BLOCK' };
      }

      const fieldState = readTypedFieldState(liveNode, textToType);
      return {
        success: true,
        targetTag: liveNode.tagName.toLowerCase(),
        outcome: 'SAFE_REGROUND',
        fieldState,
      };
    }

    return { success: false, error: `Unsupported action type: ${proposal.type}`, outcome: 'BLOCK' };
  } catch (err) {
    if (err instanceof TargetStaleError) {
      return { success: false, error: err.message, outcome: err.outcome };
    }
    return { success: false, error: (err as Error).message, outcome: 'BLOCK' };
  }
}
