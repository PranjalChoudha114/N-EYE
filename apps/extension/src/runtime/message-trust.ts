/**
 * Message-boundary trust rules (Zone 2).
 *
 * OWNS: Deciding which senders may issue which privileged extension messages.
 * WHY: Chrome delivers `chrome.runtime.onMessage` to the service worker from several contexts.
 *      Without a sender check, "who asked" is unknowable, and a privileged decision becomes
 *      whatever the last message claimed. These are pure predicates so they can be tested
 *      without a live browser.
 * TRUST BOUNDARY: A page-world script cannot call `chrome.runtime.*` at all (no
 *      `externally_connectable` is declared), so the boundary defended here is between
 *      *extension contexts*: the Side Panel owner document versus page-adjacent content scripts.
 * WHAT MAY CROSS from a content script: observation results, ROI crop requests, overlay commands.
 * WHAT MUST NEVER CROSS from a content script: owner-session ownership, or injection into a tab
 *      other than its own.
 */

export interface MinimalSender {
  id?: string | undefined;
  url?: string | undefined;
  origin?: string | undefined;
  tab?: { id?: number | undefined; windowId?: number | undefined } | undefined;
}

export interface SenderVerdict {
  ok: boolean;
  reason?: string;
}

/** Rejects messages from other extensions and from anything without a runtime identity. */
export function isSameExtensionSender(sender: MinimalSender | undefined, runtimeId: string | undefined): boolean {
  if (!sender || !runtimeId) return false;
  return sender.id === runtimeId;
}

/**
 * True only for a document the extension itself serves (Side Panel, overlay iframe helper).
 * A content script always carries `sender.tab`, so it can never satisfy this.
 */
export function isExtensionPageSender(sender: MinimalSender | undefined, extensionOrigin: string): boolean {
  if (!sender) return false;
  if (sender.tab !== undefined) return false;
  const url = sender.url || '';
  return url.startsWith(`${extensionOrigin}/`) || url === extensionOrigin;
}

/**
 * Gate for the `n-eye-owner` session port.
 * WHY: The owner port receives confirmation commands and holds the trust-loop session. Only an
 *      extension-served document may claim it, so a page-adjacent context cannot become owner.
 */
export function classifyOwnerPort(
  sender: MinimalSender | undefined,
  runtimeId: string | undefined,
  extensionOrigin: string
): SenderVerdict {
  if (!isSameExtensionSender(sender, runtimeId)) {
    return { ok: false, reason: 'Owner port rejected: sender is not this extension.' };
  }
  if (!isExtensionPageSender(sender, extensionOrigin)) {
    return { ok: false, reason: 'Owner port rejected: only an extension-served document may own the session.' };
  }
  return { ok: true };
}

/**
 * Resolves which tab a content-script injection request may target.
 * A content script may only ask for its own tab. An extension page may only ask for the tab it
 * is already bound to, so a stale or forged tabId cannot reach an unrelated tab.
 */
export function resolveInjectTarget(
  sender: MinimalSender | undefined,
  requestedTabId: number | undefined,
  activeTabId: number | undefined
): number | null {
  const senderTabId = sender?.tab?.id;
  if (senderTabId !== undefined) {
    return requestedTabId === undefined || requestedTabId === senderTabId ? senderTabId : null;
  }
  if (requestedTabId === undefined) return activeTabId ?? null;
  return requestedTabId === activeTabId ? requestedTabId : null;
}

/**
 * Overlay/content-script confirmation is only a click on our closed-shadow card.
 * A bare `{ approved: true }` from a tab-adjacent sender, with no confirmationId, is dropped.
 * The owner document (no tab) may omit the id and answer the single pending request.
 */
export function overlayConfirmPermitted(sender: MinimalSender | undefined, confirmationId?: string): boolean {
  if (!sender) return false;
  if (sender.tab === undefined) return true;
  return Boolean(confirmationId);
}
