import { describe, expect, it } from 'vitest';
import {
  applyThemeToDocument,
  isThemePref,
  nextThemePref,
  persistThemePref,
  readThemePref,
  resolveTheme,
  THEME_STORAGE_KEY,
} from '../ui/theme.js';

describe('theme resolver', () => {
  it('resolves system preference without inventing a fourth theme', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('light');
    expect(resolveTheme('system', false)).toBe('dark');
  });

  it('persists only the theme enum', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };
    persistThemePref('light', storage);
    expect(store.get(THEME_STORAGE_KEY)).toBe('light');
    expect(readThemePref(storage)).toBe('light');
    expect(isThemePref('light')).toBe(true);
    expect(isThemePref('secret')).toBe(false);
    expect(nextThemePref('dark')).toBe('light');
    expect(nextThemePref('light')).toBe('system');
    expect(nextThemePref('system')).toBe('dark');
  });

  it('applies data-theme without a reload', () => {
    const root = document.createElement('html');
    expect(applyThemeToDocument('light', root, false)).toBe('light');
    expect(root.getAttribute('data-theme')).toBe('light');
    expect(root.getAttribute('data-theme-pref')).toBe('light');
  });
});
