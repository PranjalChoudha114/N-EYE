import {
  classChangeAffectsInteractability,
  isInsideHiddenSubtree,
  isInteractiveElement,
  isLabelLike,
  SEMANTIC_ATTRIBUTE_NAMES,
  styleChangeAffectsInteractability,
} from './selectors.js';

export type MutationRelevance = 'SEMANTIC' | 'IGNORED';

/**
 * PageEpoch mutation policy (Zone 1).
 * OWNS: Classifying DOM mutations as security/semantically relevant vs cosmetic noise.
 * MUST increment epoch when actionable identity or interactability can change.
 * MUST NOT increment on animation, timestamp, or hidden-subtree churn that would loop the agent.
 */
export function classifyMutation(mutation: MutationRecord): MutationRelevance {
  if (mutation.type === 'childList') {
    if (mutation.addedNodes.length === 0 && mutation.removedNodes.length === 0) {
      return 'IGNORED';
    }
    if (isInsideHiddenSubtree(mutation.target) && !isHidingTarget(mutation.target)) {
      return 'IGNORED';
    }
    if (childListTouchesActionableTree(mutation)) {
      return 'SEMANTIC';
    }
    return 'IGNORED';
  }

  if (mutation.type === 'characterData') {
    const textParent = mutation.target.parentElement;
    if (!textParent) return 'IGNORED';
    if (isInsideHiddenSubtree(textParent)) return 'IGNORED';
    if (isInteractiveElement(textParent) || isLabelLike(textParent) || textParent.closest(interactiveClosest())) {
      return 'SEMANTIC';
    }
    return 'IGNORED';
  }

  if (mutation.type === 'attributes') {
    const name = mutation.attributeName?.toLowerCase();
    if (!name) return 'IGNORED';
    const el = mutation.target instanceof Element ? mutation.target : null;
    if (!el) return 'IGNORED';

    if (name === 'hidden' || name === 'aria-hidden' || name === 'disabled' || name === 'aria-disabled' || name === 'inert') {
      return 'SEMANTIC';
    }

    if (isUnderHiddenAncestor(el) && name !== 'hidden' && name !== 'aria-hidden') {
      return 'IGNORED';
    }

    if (SEMANTIC_ATTRIBUTE_NAMES.has(name)) {
      return 'SEMANTIC';
    }

    if (name === 'class') {
      if (!isInteractiveElement(el) && !el.querySelector(interactiveClosest())) {
        return 'IGNORED';
      }
      return classChangeAffectsInteractability(mutation.oldValue, el.getAttribute('class'))
        ? 'SEMANTIC'
        : 'IGNORED';
    }

    if (name === 'style') {
      if (!isInteractiveElement(el) && !el.querySelector(interactiveClosest())) {
        return 'IGNORED';
      }
      return styleChangeAffectsInteractability(mutation.oldValue, el.getAttribute('style'))
        ? 'SEMANTIC'
        : 'IGNORED';
    }

    return 'IGNORED';
  }

  return 'IGNORED';
}

function interactiveClosest(): string {
  return 'button, input, select, textarea, a[href], [role="button"], [role="link"], label';
}

function isUnderHiddenAncestor(node: Node): boolean {
  return isInsideHiddenSubtree(node.parentNode);
}

function isHidingTarget(node: Node): boolean {
  return node instanceof HTMLElement && (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true');
}

function childListTouchesActionableTree(mutation: MutationRecord): boolean {
  const nodes = [...mutation.addedNodes, ...mutation.removedNodes];
  for (const node of nodes) {
    if (node instanceof Text) {
      const parent = node.parentElement || (mutation.target instanceof Element ? mutation.target : null);
      if (parent && (isInteractiveElement(parent) || isLabelLike(parent))) return true;
      continue;
    }
    if (!(node instanceof Element)) continue;
    if (isInteractiveElement(node) || isLabelLike(node) || node.querySelector(interactiveClosest())) {
      return true;
    }
  }
  const container = mutation.target instanceof Element ? mutation.target : null;
  if (container && (isInteractiveElement(container) || isLabelLike(container))) {
    return true;
  }
  return false;
}

export function mutationsRequireEpochAdvance(mutations: MutationRecord[]): boolean {
  return mutations.some((mutation) => classifyMutation(mutation) === 'SEMANTIC');
}
