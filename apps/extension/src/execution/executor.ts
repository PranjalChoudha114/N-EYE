import type { ValidatedAction } from '@n-eye/protocol';
import type { ElementRegistry } from '../content/registry.js';

export interface ExecutionResult {
  success: boolean;
  error?: string;
  targetTag?: string;
}

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

  const node = registry.getLiveNode(targetElementId);
  if (!node || !node.isConnected) {
    return {
      success: false,
      error: `Target node ${targetElementId} is detached or no longer in DOM. Live re-grounding failed.`,
    };
  }

  try {
    if (proposal.type === 'CLICK') {
      node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
      node.focus();
      node.click();
      return { success: true, targetTag: node.tagName.toLowerCase() };
    }

    if (proposal.type === 'TYPE_TOKEN' || proposal.type === 'TYPE_TEXT') {
      const textToType = proposal.type === 'TYPE_TOKEN' ? resolvedTokenValue || '' : proposal.textValue || '';

      node.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' as ScrollBehavior });
      node.focus();

      if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) {
        node.value = textToType;
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (node.isContentEditable) {
        node.textContent = textToType;
        node.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        return { success: false, error: `Target ${targetElementId} is not an input or editable element.` };
      }

      return { success: true, targetTag: node.tagName.toLowerCase() };
    }

    return { success: false, error: `Unsupported action type: ${proposal.type}` };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
