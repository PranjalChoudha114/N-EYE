/**
 * Supported-URL classifier (Zone 2).
 * OWNS: Which pages N-Eye may observe or inject into.
 * MUST NOT: Inject into Chrome-restricted schemes. Failure stays unsupported, never escalates.
 */

export function classifySupportedUrl(url?: string): { isSupported: boolean; reason?: string } {
  if (!url) {
    return { isSupported: false, reason: 'No active webpage URL detected.' };
  }
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('devtools://')) {
    return { isSupported: false, reason: 'Chrome internal pages cannot be observed by extensions.' };
  }
  if (url.includes('chromewebstore.google.com') || url.includes('chrome.google.com/webstore')) {
    return { isSupported: false, reason: 'Chrome Web Store is protected by browser policy.' };
  }
  if (url.startsWith('about:') || url.startsWith('data:') || url.startsWith('javascript:')) {
    return { isSupported: false, reason: 'Unsupported browser URI scheme.' };
  }
  return { isSupported: true };
}
