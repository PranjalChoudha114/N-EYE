import { describe, expect, it } from 'vitest';
import { formatBuildIdentity } from '../dev/build-identity.js';

describe('formatBuildIdentity', () => {
  it('labels a clean git SHA without leaking paths', () => {
    const id = formatBuildIdentity('a1b2c3d', false, '2026-08-29T09:00:00Z');
    expect(id.label).toBe('DEV • a1b2c3d');
    expect(id.detail).toBe('Built 2026-08-29T09:00:00Z');
    expect(id.label).not.toMatch(/Users|GEMINI|api.key/i);
  });

  it('marks a dirty working tree with a trailing asterisk', () => {
    const id = formatBuildIdentity('a1b2c3d', true, '2026-08-29T09:00:00Z');
    expect(id.label).toBe('DEV • a1b2c3d*');
    expect(id.detail).toContain('uncommitted');
  });
});
