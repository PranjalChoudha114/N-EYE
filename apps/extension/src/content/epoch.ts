import { type PageEpoch, createPageEpoch } from '@n-eye/protocol';

export type EpochChangeCallback = (newEpoch: PageEpoch) => void;

/**
 * PageEpochManager tracks DOM freshness.
 * Meaningful DOM additions, removals, or structural modifications increment the epoch.
 * Mutations are debounced to prevent epoch churn during continuous operations.
 */
export class PageEpochManager {
  private currentEpoch: number = 1;
  private observer: MutationObserver | null = null;
  private debounceTimer: number | null = null;
  private readonly debounceMs: number;
  private onEpochChange?: EpochChangeCallback;

  constructor(debounceMs = 60, onEpochChange?: EpochChangeCallback) {
    this.debounceMs = debounceMs;
    this.onEpochChange = onEpochChange;
    this.startObserving();
  }

  public getEpoch(): PageEpoch {
    return createPageEpoch(this.currentEpoch);
  }

  public increment(): PageEpoch {
    this.currentEpoch++;
    const epoch = this.getEpoch();
    if (this.onEpochChange) {
      this.onEpochChange(epoch);
    }
    return epoch;
  }

  public reset(): PageEpoch {
    this.currentEpoch = 1;
    return this.getEpoch();
  }

  private startObserving(): void {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      // Filter out non-semantic mutations (e.g. extension internal attributes)
      const hasMeaningfulMutation = mutations.some((m) => {
        if (m.type === 'childList') {
          return m.addedNodes.length > 0 || m.removedNodes.length > 0;
        }
        if (m.type === 'attributes') {
          const name = m.attributeName?.toLowerCase();
          return (
            name === 'hidden' ||
            name === 'aria-hidden' ||
            name === 'disabled' ||
            name === 'class' ||
            name === 'style'
          );
        }
        return false;
      });

      if (!hasMeaningfulMutation) return;

      if (this.debounceTimer !== null) {
        window.clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = window.setTimeout(() => {
        this.increment();
        this.debounceTimer = null;
      }, this.debounceMs);
    });

    const targetNode = document.body || document.documentElement;
    if (targetNode) {
      this.observer.observe(targetNode, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['hidden', 'aria-hidden', 'disabled', 'class', 'style'],
      });
    }
  }

  public disconnect(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }
}
