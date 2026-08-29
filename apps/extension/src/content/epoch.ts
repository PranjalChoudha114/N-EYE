import { type PageEpoch, createPageEpoch } from '@n-eye/protocol';
import { mutationsRequireEpochAdvance } from './mutation-policy.js';

export type EpochChangeCallback = (newEpoch: PageEpoch) => void;

/**
 * PageEpochManager tracks meaningful page-state invalidation.
 * Cosmetic animation, hidden-subtree churn, and non-interactive text clocks do not advance the epoch.
 * Security-relevant mutations (actionable tree, labels, interactability) do.
 */
export class PageEpochManager {
  private currentEpoch: number = 1;
  private observer: MutationObserver | null = null;
  private debounceTimer: number | null = null;
  private readonly debounceMs: number;
  private onEpochChange?: EpochChangeCallback;
  private pendingSemantic = false;
  private stormCount = 0;
  private stormWindowStarted = 0;

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

  /** DEVELOPMENT MEASUREMENT helper: mutations coalesced into the current debounce window. */
  public getStormCount(): number {
    return this.stormCount;
  }

  private startObserving(): void {
    if (typeof window === 'undefined' || typeof MutationObserver === 'undefined') {
      return;
    }

    this.observer = new MutationObserver((mutations) => {
      if (!mutationsRequireEpochAdvance(mutations)) return;

      this.pendingSemantic = true;
      const now = Date.now();
      if (now - this.stormWindowStarted > 1000) {
        this.stormWindowStarted = now;
        this.stormCount = 0;
      }
      this.stormCount += 1;

      if (this.debounceTimer !== null) {
        window.clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = window.setTimeout(() => {
        if (this.pendingSemantic) {
          this.increment();
          this.pendingSemantic = false;
        }
        this.debounceTimer = null;
      }, this.debounceMs);
    });

    const targetNode = document.body || document.documentElement;
    if (targetNode) {
      this.observer.observe(targetNode, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeOldValue: true,
        attributeFilter: [
          'hidden',
          'aria-hidden',
          'disabled',
          'aria-disabled',
          'aria-label',
          'aria-labelledby',
          'aria-checked',
          'aria-selected',
          'role',
          'type',
          'href',
          'contenteditable',
          'inert',
          'class',
          'style',
        ],
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
