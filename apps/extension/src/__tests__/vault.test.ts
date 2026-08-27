import { describe, it, expect } from 'vitest';
import { PrivateTokenVault, TokenResolutionError } from '../privacy/vault.js';
import { createTaskId } from '@n-eye/protocol';

describe('PrivateTokenVault Security Invariants', () => {
  const taskId = createTaskId('task-001');
  const origin = 'https://example.com';

  it('registers and resolves scoped token locally', () => {
    const vault = new PrivateTokenVault();
    const binding = vault.registerToken(
      '[EMAIL_1]',
      'PII_EMAIL',
      'secret.user@example.com',
      taskId,
      1,
      origin,
      ['email', 'text', 'textbox']
    );

    expect(binding.tokenSymbol).toBe('[EMAIL_1]');
    expect(vault.size()).toBe(1);

    const resolved = vault.resolve('[EMAIL_1]', taskId, origin, 'email');
    expect(resolved).toBe('secret.user@example.com');
  });

  it('denies resolution on cross-origin access', () => {
    const vault = new PrivateTokenVault();
    vault.registerToken(
      '[EMAIL_1]',
      'PII_EMAIL',
      'secret.user@example.com',
      taskId,
      1,
      origin,
      ['email', 'text']
    );

    expect(() => {
      vault.resolve('[EMAIL_1]', taskId, 'https://malicious-attacker.org', 'email');
    }).toThrow(TokenResolutionError);
  });

  it('denies resolution on cross-task access', () => {
    const vault = new PrivateTokenVault();
    vault.registerToken(
      '[EMAIL_1]',
      'PII_EMAIL',
      'secret.user@example.com',
      taskId,
      1,
      origin,
      ['email', 'text']
    );

    const wrongTaskId = createTaskId('task-999');
    expect(() => {
      vault.resolve('[EMAIL_1]', wrongTaskId, origin, 'email');
    }).toThrow(TokenResolutionError);
  });

  it('denies resolution on semantic target mismatch (e.g. email token into password field)', () => {
    const vault = new PrivateTokenVault();
    vault.registerToken(
      '[EMAIL_1]',
      'PII_EMAIL',
      'secret.user@example.com',
      taskId,
      1,
      origin,
      ['email', 'textbox']
    );

    expect(() => {
      vault.resolve('[EMAIL_1]', taskId, origin, 'password');
    }).toThrow(TokenResolutionError);
  });

  it('never leaks realValue in getSafeCapabilities()', () => {
    const vault = new PrivateTokenVault();
    vault.registerToken(
      '[EMAIL_1]',
      'PII_EMAIL',
      'raw.secret.never.leak@example.com',
      taskId,
      1,
      origin,
      ['email']
    );

    const caps = vault.getSafeCapabilities();
    expect(caps.length).toBe(1);
    expect(caps[0]?.tokenSymbol).toBe('[EMAIL_1]');
    expect(JSON.stringify(caps)).not.toContain('raw.secret.never.leak');
  });
});
