/**
 * Canonical N-Eye brand asset resolver.
 * OWNS: The single path surface for the supplied eye+N mark.
 * MUST NOT: Generate a substitute logo. Replacement later = swap files here.
 */

export const BRAND_FILES = {
  mark: 'brand/n-eye-mark.png',
  icon16: 'brand/icon-16.png',
  icon32: 'brand/icon-32.png',
  icon48: 'brand/icon-48.png',
  icon128: 'brand/icon-128.png',
} as const;

export type BrandAssetId = keyof typeof BRAND_FILES;

export function brandPath(id: BrandAssetId): string {
  return BRAND_FILES[id];
}

export function brandUrl(id: BrandAssetId): string {
  const path = BRAND_FILES[id];
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
      return chrome.runtime.getURL(path);
    }
  } catch {
    // Tests and non-extension pages fall back to a root-relative path.
  }
  return `/${path}`;
}
