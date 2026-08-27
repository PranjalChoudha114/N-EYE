import {
  type ElementId,
  type PageEpoch,
  type TargetFingerprint,
  createElementId,
} from '@n-eye/protocol';

export interface RegistryEntry {
  readonly id: ElementId;
  readonly liveNode: HTMLElement;
  readonly observedEpoch: PageEpoch;
  readonly fingerprint: TargetFingerprint;
  readonly observedAt: number;
}

/**
 * ElementRegistry maintains session-local mappings between opaque ElementIds (e1, e2, ...)
 * and live DOM HTMLElement references.
 *
 * IMMUTABLE PRIVACY INVARIANTS:
 * 1. Live DOM node references NEVER cross the network boundary.
 * 2. ElementIds are opaque session-scoped strings and contain no private data.
 * 3. Detached or mutated elements can be verified using the stored TargetFingerprint.
 */
export class ElementRegistry {
  private entries = new Map<string, RegistryEntry>();
  private idCounter = 1;

  public register(
    el: HTMLElement,
    epoch: PageEpoch,
    fingerprint: TargetFingerprint
  ): ElementId {
    const idStr = `e${this.idCounter++}`;
    const id = createElementId(idStr);

    const entry: RegistryEntry = {
      id,
      liveNode: el,
      observedEpoch: epoch,
      fingerprint,
      observedAt: Date.now(),
    };

    this.entries.set(idStr, entry);
    return id;
  }

  public get(id: ElementId): RegistryEntry | null {
    return this.entries.get(id as string) || null;
  }

  public getLiveNode(id: ElementId): HTMLElement | null {
    const entry = this.get(id);
    if (!entry) return null;
    if (!entry.liveNode.isConnected) return null;
    return entry.liveNode;
  }

  public isAttached(id: ElementId): boolean {
    const entry = this.get(id);
    return !!entry && entry.liveNode.isConnected;
  }

  /**
   * Cleans up all entries that are no longer connected to the DOM document.
   * Returns count of purged references.
   */
  public cleanupDetached(): number {
    let purged = 0;
    for (const [key, entry] of this.entries.entries()) {
      if (!entry.liveNode.isConnected) {
        this.entries.delete(key);
        purged++;
      }
    }
    return purged;
  }

  public clear(): void {
    this.entries.clear();
    this.idCounter = 1;
  }

  public size(): number {
    return this.entries.size;
  }

  public getEntries(): RegistryEntry[] {
    return Array.from(this.entries.values());
  }
}
