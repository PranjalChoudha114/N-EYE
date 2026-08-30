import {
  type ElementId,
  type FrameId,
  type PageEpoch,
  type TargetFingerprint,
  createElementId,
  TOP_FRAME_ID,
} from '@n-eye/protocol';

export interface RegistryEntry {
  readonly id: ElementId;
  readonly liveNode: HTMLElement;
  readonly observedEpoch: PageEpoch;
  readonly fingerprint: TargetFingerprint;
  readonly observedAt: number;
  readonly frameId: FrameId;
}

/**
 * ElementRegistry maintains session-local mappings between opaque ElementIds (e1, f1e1, ...)
 * and live DOM HTMLElement references.
 *
 * IMMUTABLE PRIVACY INVARIANTS:
 * 1. Live DOM node references NEVER cross the network boundary.
 * 2. ElementIds are opaque session-scoped strings and contain no private data.
 * 3. Frame-prefixed IDs make cross-frame collisions impossible at authority time.
 */
export class ElementRegistry {
  private entries = new Map<string, RegistryEntry>();
  private counters = new Map<string, number>();

  public register(
    el: HTMLElement,
    epoch: PageEpoch,
    fingerprint: TargetFingerprint,
    options?: { idPrefix?: string; frameId?: FrameId }
  ): ElementId {
    const prefix = options?.idPrefix ?? 'e';
    const next = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, next);
    const idStr = `${prefix}${next}`;
    const id = createElementId(idStr);

    const entry: RegistryEntry = {
      id,
      liveNode: el,
      observedEpoch: epoch,
      fingerprint,
      observedAt: Date.now(),
      frameId: options?.frameId ?? TOP_FRAME_ID,
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

  public entriesInFrame(frameId: FrameId): RegistryEntry[] {
    return Array.from(this.entries.values()).filter((entry) => entry.frameId === frameId);
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

  /**
   * WHY: Every observation is a new census. Opaque ids are reminted from e1 in document
   * order; they are not stable node identity across autocomplete/re-render.
   */
  public clear(): void {
    this.entries.clear();
    this.counters.clear();
  }

  public size(): number {
    return this.entries.size;
  }

  public getEntries(): RegistryEntry[] {
    return Array.from(this.entries.values());
  }
}
