/**
 * Bounded viewport exploration (Zone 3 policy).
 *
 * OWNS: Whether a missing unique target may be sought by a finite SCROLL.
 * TRUST: Scrolling is an observation mechanism, not task success.
 * MUST NOT: Infinite-scroll, accumulate raw pages, or raise authority.
 */

export const MAX_EXPLORE_SCROLLS = 2;
export const EXPLORE_SCROLL_PX = 480;
export const MAX_REPEATED_SEMANTIC_STATES = 2;

export function explorationSignature(
  elements: Array<{
    id: string;
    safeLabel?: string | null;
    role?: string | null;
    bbox?: { y: number };
  }>
): string {
  return elements
    .map((el) => `${el.id}|${el.role || ''}|${(el.safeLabel || '').slice(0, 40)}|${Math.round((el.bbox?.y || 0) / 40)}`)
    .join(';');
}

/**
 * Loop detector over privacy-safe semantic identity, not raw DOM.
 * WHY: Identical viewport+subgoal+candidates after a scroll is NO_PROGRESS_LOOP.
 */
export function semanticStateHash(args: {
  origin: string;
  epoch: number;
  subgoal?: string;
  signature: string;
  viewportBand?: number;
}): string {
  let origin = args.origin;
  try {
    origin = new URL(args.origin).origin;
  } catch {
    origin = args.origin.split('/')[0] || 'unknown';
  }
  return `${origin}|e${args.epoch}|${args.subgoal || '-'}|v${args.viewportBand || 0}|${args.signature}`;
}

export function priorWasExplorationScroll(summary: string | undefined): boolean {
  if (!summary) return false;
  return /\bscroll\b/i.test(summary);
}

/**
 * Explore only when grounding found nothing unique — never to break a safe ASK_USER tie.
 */
export function shouldExploreForMissingTarget(args: {
  groundingReason: 'none' | 'ambiguous';
  exploreScrollsUsed: number;
  lastSignature: string | null;
  nextSignature: string;
  priorSummary?: string;
}): { explore: boolean; reason: string } {
  if (args.groundingReason === 'ambiguous') {
    return { explore: false, reason: 'Ambiguous targets are not resolved by scrolling.' };
  }
  if (args.exploreScrollsUsed >= MAX_EXPLORE_SCROLLS) {
    return { explore: false, reason: 'Exploration budget exhausted.' };
  }
  if (args.lastSignature && args.lastSignature === args.nextSignature && priorWasExplorationScroll(args.priorSummary)) {
    return { explore: false, reason: 'NO_PROGRESS_LOOP: page semantics did not change after the last scroll.' };
  }
  if (/already at scroll boundary/i.test(args.priorSummary || '')) {
    return { explore: false, reason: 'Already at a practical page boundary.' };
  }
  return { explore: true, reason: 'No unique target in the current observation; bounded scroll is allowed.' };
}
