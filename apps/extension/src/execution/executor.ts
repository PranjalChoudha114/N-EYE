import type { ValidatedAction } from '@n-eye/protocol';
import type { ElementRegistry } from '../content/registry.js';
import { regroundTarget, TargetStaleError } from '../authority/regrounding.js';

export interface ExecutionResult {
  success: boolean;
  error?: string;
  targetTag?: string;
}

/**
 * Executes a validated action against the live DOM.
 * STRICT AUTHORITY INVARIANT: Accepts ONLY ValidatedAction. ActionProposals are rejected.
 */
export function executeValidatedAction(
  action: ValidatedAction,
  registry: ElementRegistry
): ExecutionResult {
  if (!action._isValidated) {
    return { success: false, error: 'Unvalidated action cannot be executed by the local authority.' };
  }

  const { proposal, targetElementId, resolvedTokenValue } = action;

  if (proposal.type === 'COMPLETE' || proposal.type === 'WAIT') {
    return { success: true };
  }

  if (!targetElementId) {
    return { success: false, error: 'Action missing target element ID.' };
  }

  let liveNode: HTMLElement;
  try {
    const reground = regroundTarget(targetElementId, registry);
    liveNode = reground.node;
  } catch (err) {
    if (err instanceof TargetStaleError) {
      return { success: false, error: err.message };
    }
    return { success: false, error: (err as Error).message };
  }

  try {
    if (proposal.type === 'CLICK') {
      liveNode.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
      liveNode.focus();
      liveNode.click();
      return { success: true, targetTag: liveNode.tagName.toLowerCase() };
    }

    if (proposal.type === 'TYPE_TOKEN' || proposal.type === 'TYPE_TEXT') {
      const textToType = proposal.type === 'TYPE_TOKEN' ? resolvedTokenValue || '' : proposal.textValue || '';

      liveNode.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
      liveNode.focus();

      if (liveNode instanceof HTMLInputElement || liveNode instanceof HTMLTextAreaElement) {
        liveNode.value = textToType;
        liveNode.dispatchEvent(new Event('input', { bubbles: true }));
        liveNode.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (liveNode.isContentEditable) {
        liveNode.textContent = textToType;
        liveNode.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        return { success: false, error: `Target ${targetElementId} is not an input or editable element.` };
      }

      return { success: true, targetTag: liveNode.tagName.toLowerCase() };
    }

    return { success: false, error: `Unsupported action type: ${proposal.type}` };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
