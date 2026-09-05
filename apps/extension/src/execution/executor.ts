import type { ExecutionEvidence, FieldValueState, ValidatedAction } from '@n-eye/protocol';
import type { ElementRegistry } from '../content/registry.js';
import { assertLiveAuthority, findUniqueLiveTarget, regroundTarget, TargetStaleError } from '../authority/regrounding.js';
import { clickHitTest } from './hit-test.js';

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

/**
 * Set a native text control through the prototype setter, then fire bubbling input/change.
 * WHY: Isolated-world `node.value = x` can skip framework value trackers. The prototype
 *      setter plus InputEvent is the platform-compatible path. No framework internals.
 */
export function setNativeTextControlValue(node: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto = node instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  if (desc?.set) {
    desc.set.call(node, value);
  } else {
    node.value = value;
  }
  try {
    node.dispatchEvent(
      new InputEvent('input', { bubbles: true, cancelable: true, data: value, inputType: 'insertFromPaste' })
    );
  } catch {
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }
  node.dispatchEvent(new Event('change', { bubbles: true }));
}

export function setContentEditableText(node: HTMLElement, value: string): void {
  node.focus();
  const doc = node.ownerDocument;
  try {
    const range = doc.createRange();
    range.selectNodeContents(node);
    const sel = doc.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const inserted = doc.execCommand('insertText', false, value);
    if (!inserted) {
      node.textContent = value;
    }
  } catch {
    node.textContent = value;
  }
  try {
    node.dispatchEvent(
      new InputEvent('input', { bubbles: true, cancelable: true, data: value, inputType: 'insertFromPaste' })
    );
  } catch {
    node.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

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

function dispatchEnterKey(node: HTMLElement): void {
  const init: KeyboardEventInit = {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    bubbles: true,
    cancelable: true,
  };
  node.dispatchEvent(new KeyboardEvent('keydown', init));
  node.dispatchEvent(new KeyboardEvent('keypress', init));
  node.dispatchEvent(new KeyboardEvent('keyup', init));
}

function isNativeSubmitter(node: HTMLElement): node is HTMLButtonElement | HTMLInputElement {
  if (node instanceof HTMLButtonElement) return node.type === 'submit';
  if (node instanceof HTMLInputElement) return node.type === 'submit' || node.type === 'image';
  return false;
}

/**
 * Activate a control with native submitter semantics when it owns a form.
 * WHY: button.click() can skip HTML submitter/validation pairing; form.submit() skips validation.
 * MUST NOT: chrome.debugger. Custom non-form widgets keep node.click().
 */
function executePointerActivation(node: HTMLElement): void {
  if ((node as HTMLButtonElement).disabled || node.getAttribute('aria-disabled') === 'true') {
    throw new Error('Target is disabled.');
  }
  const form =
    (node instanceof HTMLButtonElement || node instanceof HTMLInputElement) && node.form
      ? node.form
      : null;
  if (form && isNativeSubmitter(node) && typeof form.requestSubmit === 'function') {
    try {
      form.requestSubmit(node);
      return;
    } catch {
      node.click();
      return;
    }
  }
  node.click();
}

/**
 * Constrained implicit submit (Zone 1).
 * WHY: Some search/forms submit on Enter rather than a unique visible button.
 * TRUST: Only Enter, only on a locally validated typeable target. Never planner-chosen keys.
 * Prefer form.requestSubmit() (HTML implicit submit) over untrusted KeyboardEvents.
 */
function executeConstrainedEnter(node: HTMLElement): ExecutionResult {
  const form =
    node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement
      ? node.form
      : node.closest('form');
  if (form instanceof HTMLFormElement && typeof form.requestSubmit === 'function') {
    try {
      form.requestSubmit();
      return { success: true, targetTag: node.tagName.toLowerCase(), outcome: 'SAFE_REGROUND' };
    } catch {
      dispatchEnterKey(node);
      return { success: true, targetTag: node.tagName.toLowerCase(), outcome: 'SAFE_REGROUND' };
    }
  }
  dispatchEnterKey(node);
  return { success: true, targetTag: node.tagName.toLowerCase(), outcome: 'SAFE_REGROUND' };
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
      const hit = clickHitTest(liveNode);
      if (!hit.ok) {
        return {
          success: false,
          error: 'Pointer target is occluded. N-Eye will not hammer-click through an overlay.',
          outcome: 'REOBSERVE',
          targetTag: liveNode.tagName.toLowerCase(),
        };
      }
      // WHY: Dynamic-id widgets keep the same label; the live node id/ARIA is the correlated effect.
      const beforeDomId = liveNode.id;
      const beforePressed = liveNode.getAttribute('aria-pressed');
      const beforeExpanded = liveNode.getAttribute('aria-expanded');
      const beforeDisabled = liveNode.hasAttribute('disabled');
      executePointerActivation(liveNode);
      const identityChanged =
        !liveNode.isConnected ||
        liveNode.id !== beforeDomId ||
        liveNode.getAttribute('aria-pressed') !== beforePressed ||
        liveNode.getAttribute('aria-expanded') !== beforeExpanded ||
        liveNode.hasAttribute('disabled') !== beforeDisabled;
      return {
        success: true,
        targetTag: liveNode.tagName.toLowerCase(),
        outcome: 'SAFE_REGROUND',
        targetIdentityChanged: identityChanged,
      };
    }

    if (proposal.type === 'PRESS_ENTER') {
      liveNode.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
      liveNode.focus();
      assertLiveAuthority(liveNode, action.expectedFingerprint, action.expectedFrameId);
      return executeConstrainedEnter(liveNode);
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
        setNativeTextControlValue(liveNode, textToType);
      } else if (liveNode.isContentEditable) {
        setContentEditableText(liveNode, textToType);
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

/**
 * Re-read typed text after a fresh observation. Uses fingerprint when the old id is gone.
 * PRIVACY: expected text never leaves this function except as MATCHED/EMPTY/DIVERGED.
 */
export function probeTypedField(action: ValidatedAction, registry: ElementRegistry): ExecutionResult {
  if (action.proposal.type !== 'TYPE_TOKEN' && action.proposal.type !== 'TYPE_TEXT') {
    return { success: false, fieldState: 'NOT_APPLICABLE', error: 'Field probe applies to typed actions only.' };
  }
  const expected =
    action.proposal.type === 'TYPE_TOKEN' ? action.resolvedTokenValue || '' : action.proposal.textValue || '';
  if (!expected) {
    return { success: false, fieldState: 'UNREADABLE', error: 'No expected text for field probe.' };
  }

  let node: HTMLElement | undefined;
  const live = liveNodeForAction(action, registry);
  if (live instanceof HTMLElement) node = live;

  if (!node && action.expectedFingerprint) {
    const found = findUniqueLiveTarget(action.expectedFingerprint, action.expectedFrameId);
    if (found.kind === 'ambiguous') {
      return {
        success: false,
        fieldState: 'AMBIGUOUS',
        outcome: 'ASK_USER',
        error: 'Multiple equivalent fields after rerender.',
      };
    }
    if (found.kind === 'unique') node = found.node;
  }

  if (!node) {
    return {
      success: false,
      fieldState: 'TARGET_REPLACED',
      outcome: 'REOBSERVE',
      error: 'Typed field is no longer uniquely grounded.',
    };
  }
  const fieldState = readTypedFieldState(node, expected);
  return {
    success: fieldState === 'MATCHED',
    fieldState,
    outcome: 'SAFE_REGROUND',
    targetTag: node.tagName.toLowerCase(),
  };
}

export function probeExpectedText(
  fingerprint: NonNullable<ValidatedAction['expectedFingerprint']>,
  expectedText: string,
  frameId?: ValidatedAction['expectedFrameId']
): ExecutionResult {
  if (!expectedText) {
    return { success: false, fieldState: 'UNREADABLE', error: 'No expected text for field probe.' };
  }
  const found = findUniqueLiveTarget(fingerprint, frameId);
  if (found.kind === 'ambiguous') {
    return { success: false, fieldState: 'AMBIGUOUS', outcome: 'ASK_USER', error: 'Multiple equivalent fields.' };
  }
  if (found.kind === 'none') {
    return { success: false, fieldState: 'TARGET_REPLACED', outcome: 'REOBSERVE', error: 'No unique live field.' };
  }
  const fieldState = readTypedFieldState(found.node, expectedText);
  return {
    success: fieldState === 'MATCHED',
    fieldState,
    outcome: 'SAFE_REGROUND',
    targetTag: found.node.tagName.toLowerCase(),
  };
}
