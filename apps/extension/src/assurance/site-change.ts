import type { AssuranceEvent } from '@n-eye/protocol';
import { AssuranceBus, safeHostname } from './notifications.js';

/**
 * Site-change awareness (Zone 2).
 * WHY: Reassure the user that N-Eye followed the browsing context.
 * MUST NOT: Notify on DOM mutations, leak query parameters, or repeat the same origin.
 */
export function maybeSiteChangeEvent(
  bus: AssuranceBus,
  prevHostname: string | null,
  url: string,
  origin: string,
  isSupported: boolean
): AssuranceEvent | null {
  const hostname = safeHostname(url, origin, isSupported);
  if (prevHostname === hostname) {
    return null;
  }
  const message = isSupported
    ? `N-Eye active on ${hostname}`
    : `N-Eye cannot protect ${hostname}`;
  return bus.emit({
    kind: 'SITE_CHANGE',
    hostname,
    message,
    severity: 'info',
    dedupeKey: `site:${hostname}`,
  });
}

export function siteChangeHostname(url: string, origin: string, isSupported: boolean): string {
  return safeHostname(url, origin, isSupported);
}
