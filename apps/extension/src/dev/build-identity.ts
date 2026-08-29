/**
 * Development build identity (Zone 2 UI metadata only).
 * WHY: Chrome MV3 unpacked extensions do not hot-reload. The developer must
 * confirm chrome://extensions and the Side Panel match the bundle just built.
 * PRIVACY: Git short SHA + dirty flag only. No paths, keys, or page data.
 */

export function formatBuildIdentity(
  shortSha: string,
  dirty: boolean,
  builtAtIso: string
): { label: string; detail: string } {
  const sha = shortSha.trim() || 'unknown';
  const label = dirty ? `DEV • ${sha}*` : `DEV • ${sha}`;
  const detail = dirty
    ? `Built ${builtAtIso} (uncommitted source)`
    : `Built ${builtAtIso}`;
  return { label, detail };
}

export function applyBuildIdentityToDom(root: Document = document): void {
  const el = root.getElementById('build-identity');
  if (!el) {
    return;
  }
  let label = 'DEV • …';
  try {
    const versionName = chrome.runtime.getManifest().version_name;
    if (versionName) {
      label = versionName;
    }
  } catch {
    // Non-extension test/DOM contexts keep the placeholder.
  }
  el.textContent = label;
  el.setAttribute('title', label);
}
