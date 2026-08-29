/**
 * Branded nominal types for N-Eye domain identifiers.
 * Prevents accidental cross-assignment between different identifier types.
 */

declare const BrandSymbol: unique symbol;

export type Branded<T, B> = T & { readonly [BrandSymbol]: B };

/** Unique identifier for a top-level user task */
export type TaskId = Branded<string, 'TaskId'>;

/** Ephemeral session-local identifier for a DOM or visual interactable element (e.g. "e1", "e17", "f1e1") */
export type ElementId = Branded<string, 'ElementId'>;

/**
 * Opaque local frame token. `top` is the browsing-context document.
 * Nested same-origin frames use `f1`, `f2`, ... Never a URL or query string.
 */
export type FrameId = Branded<string, 'FrameId'>;

/** Monotonically increasing counter incremented on significant page mutations */
export type PageEpoch = Branded<number, 'PageEpoch'>;

/** Unique identifier for an action proposal / execution attempt */
export type ActionId = Branded<string, 'ActionId'>;

/** Opaque scoped identifier for a vaulted private value (e.g. "TOKEN_EMAIL_1") */
export type TokenId = Branded<string, 'TokenId'>;

// Factory / Constructor functions
export function createTaskId(id: string): TaskId {
  return id as TaskId;
}

export function createElementId(id: string): ElementId {
  return id as ElementId;
}

export function createFrameId(id: string): FrameId {
  return id as FrameId;
}

export function createPageEpoch(epoch: number): PageEpoch {
  return epoch as PageEpoch;
}

export function createActionId(id: string): ActionId {
  return id as ActionId;
}

export function createTokenId(id: string): TokenId {
  return id as TokenId;
}
