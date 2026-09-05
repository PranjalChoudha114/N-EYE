/**
 * Controlled primary-demo rehearsal (existing test portal scenario-15 semantics).
 * WHY: Demo reliability must be repeatable from a known reset state. Not a live Chrome proof.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createPageEpoch, createTaskId } from '@n-eye/protocol';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';
import { DeterministicPlanner } from '../planner/deterministic-planner.js';
import { buildSafeContext } from '../privacy/safe-context-builder.js';
import { evaluatePrivacyPolicy, resetTokenCounters } from '../privacy/policy.js';
import { PrivateTokenVault } from '../privacy/vault.js';
import { validateSafeContextEgress } from '../privacy/egress-guard.js';

function mountPrimaryDemo(): void {
  document.body.innerHTML = `
    <main>
      <form>
        <input type="search" aria-label="Search" />
        <button type="submit" aria-label="Search">
          <svg width="16" height="16"><title>Search</title></svg>
        </button>
      </form>
      <section>
        <h3>Dynamic ID Button</h3>
        <p>Nearby contact: canary.applicant@example.com</p>
        <p hidden>CANARY_SECRET_DEMO_T026R1</p>
        <button id="dyn-1" type="button">Click me</button>
      </section>
      <p id="result" hidden>Dynamic control activated</p>
    </main>
  `;
  document.querySelector('button[id^="dyn"]')?.addEventListener('click', () => {
    const result = document.getElementById('result');
    if (result) result.hidden = false;
  });
}

describe('Primary controlled demo rehearsal', () => {
  beforeEach(() => {
    resetTokenCounters();
    document.body.innerHTML = '';
  });

  it('runs the Dynamic ID primary path 10 consecutive times from reset', async () => {
    const failures: string[] = [];
    for (let run = 1; run <= 10; run += 1) {
      mountPrimaryDemo();
      const registry = new ElementRegistry();
      const scene = observePage(registry, createPageEpoch(run));
      const vault = new PrivateTokenVault();
      const safe = buildSafeContext(
        scene,
        'Click the Dynamic ID Button',
        evaluatePrivacyPolicy(scene.privacyFindings),
        vault,
        createTaskId(`demo-${run}`),
        scene.privacyFindings
      );
      const serialized = validateSafeContextEgress(safe);
      if (serialized.includes('canary.applicant@example.com') || serialized.includes('CANARY_SECRET_DEMO_T026R1')) {
        failures.push(`run ${run}: canary leaked`);
        continue;
      }
      const planner = new DeterministicPlanner();
      const proposal = await planner.proposeAction(safe);
      const clickMe = scene.elements.find((el) => el.innerTextCandidate === 'Click me');
      if (proposal.proposal.type !== 'CLICK' || proposal.proposal.targetId !== clickMe?.id) {
        failures.push(`run ${run}: ${proposal.proposal.type} ${proposal.proposal.targetId || ''}`);
      }
    }
    expect(failures).toEqual([]);
  });
});
