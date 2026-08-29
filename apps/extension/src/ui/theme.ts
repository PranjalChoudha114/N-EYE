/**
 * Theme resolver (Zone 2 UI).
 * OWNS: dark / light / system preference. Immediate, no reload.
 * PRIVACY: localStorage key holds only a theme enum — never page or vault data.
 */

export const THEME_STORAGE_KEY = 'n-eye.theme';

export type ThemePref = 'dark' | 'light' | 'system';
export type ResolvedTheme = 'dark' | 'light';

const PREFS: ThemePref[] = ['dark', 'light', 'system'];

export function isThemePref(value: string | null | undefined): value is ThemePref {
  return value === 'dark' || value === 'light' || value === 'system';
}

export function readThemePref(storage: Pick<Storage, 'getItem'> = localStorage): ThemePref {
  try {
    const raw = storage.getItem(THEME_STORAGE_KEY);
    return isThemePref(raw) ? raw : 'dark';
  } catch {
    return 'dark';
  }
}

export function persistThemePref(
  pref: ThemePref,
  storage: Pick<Storage, 'setItem'> = localStorage
): void {
  storage.setItem(THEME_STORAGE_KEY, pref);
}

export function resolveTheme(
  pref: ThemePref,
  systemIsLight: boolean
): ResolvedTheme {
  if (pref === 'system') {
    return systemIsLight ? 'light' : 'dark';
  }
  return pref;
}

export function nextThemePref(pref: ThemePref): ThemePref {
  const index = PREFS.indexOf(pref);
  return PREFS[(index + 1) % PREFS.length] ?? 'dark';
}

export function systemPrefersLight(media: { matches: boolean } | null = null): boolean {
  if (media) return media.matches;
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches;
  } catch {
    return false;
  }
}

export function applyThemeToDocument(
  pref: ThemePref,
  root: HTMLElement = document.documentElement,
  systemIsLight: boolean = systemPrefersLight()
): ResolvedTheme {
  const resolved = resolveTheme(pref, systemIsLight);
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-pref', pref);
  return resolved;
}

export function themeControlLabel(pref: ThemePref): string {
  if (pref === 'light') return 'Theme: Light. Click for system.';
  if (pref === 'system') return 'Theme: System. Click for dark.';
  return 'Theme: Dark. Click for light.';
}
