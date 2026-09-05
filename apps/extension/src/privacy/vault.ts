import {
  type PrivacyClass,
  type TaskId,
  type TokenBinding,
  type TokenCapability,
  type TokenId,
  createTokenId,
} from '@n-eye/protocol';

export class TokenResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenResolutionError';
  }
}

/**
 * PrivateTokenVault (Zone 3 - Trusted Local Memory)
 * OWNS: Ephemeral, in-memory mapping between scoped token symbols (e.g. [EMAIL_1]) and real secrets.
 * TRUST BOUNDARY: Strictly memory-local. Never writes to disk, cookies, or extension storage.
 * GUARANTEE: Real secret values are NEVER serialized into outbound SafeContext or network payloads.
 */
export class PrivateTokenVault {
  private bindings = new Map<string, TokenBinding>();

  /**
   * Stores a real sensitive value in local memory bound to a scoped token.
   */
  public registerToken(
    tokenSymbol: string,
    privacyClass: PrivacyClass,
    realValue: string,
    taskId: TaskId,
    tabId: number,
    origin: string,
    allowedTargetSemantics: string[] = ['text', 'textbox', 'email'],
    ttlMs: number = 10 * 60 * 1000 // 10 minutes default TTL
  ): TokenBinding {
    const tokenId = createTokenId(`tok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    const now = Date.now();

    const binding: TokenBinding = {
      tokenId,
      tokenSymbol,
      privacyClass,
      realValue,
      taskId,
      tabId,
      origin,
      allowedTargetSemantics: allowedTargetSemantics.map((s) => s.toLowerCase()),
      createdAt: now,
      expiresAt: now + ttlMs,
      status: 'ACTIVE',
    };

    this.bindings.set(tokenId, binding);
    return binding;
  }

  /**
   * Resolves a token symbol or tokenId back to its real value LOCALLY immediately before execution.
   * Enforces origin binding, task binding, target semantic checks, and expiry.
   */
  public resolve(
    tokenIdentifier: TokenId | string,
    taskId: TaskId,
    origin: string,
    targetSemantic: string,
    tabId?: number
  ): string {
    // Lookup by tokenId or tokenSymbol
    let binding: TokenBinding | undefined;
    for (const b of this.bindings.values()) {
      if (b.tokenId === tokenIdentifier || b.tokenSymbol === tokenIdentifier) {
        binding = b;
        break;
      }
    }

    if (!binding) {
      throw new TokenResolutionError(`Unknown or unregistered token: ${tokenIdentifier}`);
    }

    if (binding.status === 'DESTROYED') {
      throw new TokenResolutionError(`Token ${binding.tokenSymbol} has been destroyed.`);
    }

    if (Date.now() > binding.expiresAt) {
      binding.status = 'EXPIRED';
      throw new TokenResolutionError(`Token ${binding.tokenSymbol} has expired.`);
    }

    if (binding.taskId !== taskId) {
      throw new TokenResolutionError(
        `Token ${binding.tokenSymbol} belongs to task ${binding.taskId}, not ${taskId}. Cross-task access denied.`
      );
    }

    if (binding.origin !== origin) {
      throw new TokenResolutionError(
        `Token ${binding.tokenSymbol} is bound to origin ${binding.origin}, not ${origin}. Cross-origin replay denied.`
      );
    }

    if (tabId !== undefined && binding.tabId !== tabId) {
      throw new TokenResolutionError(
        `Token ${binding.tokenSymbol} is bound to tab ${binding.tabId}, not ${tabId}. Cross-tab access denied.`
      );
    }

    const normTarget = targetSemantic.toLowerCase();
    const isAllowed = binding.allowedTargetSemantics.some(
      (allowed) => allowed !== '*' && (normTarget.includes(allowed))
    );

    if (!isAllowed) {
      throw new TokenResolutionError(
        `Token ${binding.tokenSymbol} of type ${binding.privacyClass} is not permitted on target with semantics "${targetSemantic}". Target semantic mismatch.`
      );
    }

    return binding.realValue;
  }

  /**
   * Generates safe capabilities metadata for outbound SafeContext.
   * PRIVACY GUARANTEE: realValue is NEVER returned here.
   */
  public getSafeCapabilities(): TokenCapability[] {
    const capabilities: TokenCapability[] = [];
    const now = Date.now();

    for (const binding of this.bindings.values()) {
      if (binding.status === 'ACTIVE' && now <= binding.expiresAt) {
        capabilities.push({
          tokenId: binding.tokenId,
          tokenSymbol: binding.tokenSymbol,
          privacyClass: binding.privacyClass,
          descriptionRole: `Scoped ${binding.privacyClass} credential`,
        });
      }
    }

    return capabilities;
  }

  /**
   * Destroys all bindings for a given task or origin.
   */
  public destroyTaskTokens(taskId: TaskId): void {
    for (const [id, binding] of this.bindings.entries()) {
      if (binding.taskId === taskId) {
        binding.status = 'DESTROYED';
        this.bindings.delete(id);
      }
    }
  }

  /**
   * Wipes all tokens from memory.
   */
  public clear(): void {
    this.bindings.clear();
  }

  public size(): number {
    return this.bindings.size;
  }
}
