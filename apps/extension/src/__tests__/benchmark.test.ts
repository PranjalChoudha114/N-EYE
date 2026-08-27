import { describe, it } from 'vitest';
import { ElementRegistry } from '../content/registry.js';
import { observePage } from '../content/observer.js';
import { createPageEpoch } from '@n-eye/protocol';

describe('Observer Performance Benchmark', () => {
  it('measures local observation latency across 100 iterations on 100 elements', () => {
    document.body.innerHTML = `
      <div id="container">
        ${Array.from({ length: 50 }, (_, i) => `
          <div class="row">
            <label for="inp-${i}">Label for Field ${i}</label>
            <input type="${i % 5 === 0 ? 'password' : i % 3 === 0 ? 'email' : 'text'}" id="inp-${i}" placeholder="Placeholder ${i}">
            <button id="btn-${i}">Action Button ${i}</button>
          </div>
        `).join('')}
      </div>
    `;

    const registry = new ElementRegistry();
    const epoch = createPageEpoch(1);
    const iterations = 100;
    const durations: number[] = [];

    // Warmup
    for (let i = 0; i < 10; i++) {
      observePage(registry, epoch);
    }

    // Benchmark
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      observePage(registry, epoch);
      const dur = performance.now() - start;
      durations.push(dur);
    }

    durations.sort((a, b) => a - b);
    const min = durations[0] ?? 0;
    const max = durations[durations.length - 1] ?? 0;
    const median = durations[Math.floor(durations.length / 2)] ?? 0;
    const p95 = durations[Math.floor(durations.length * 0.95)] ?? 0;

    console.log('\n--- OBSERVER BENCHMARK (100 ELEMENTS) ---');
    console.log(`Iterations: ${iterations}`);
    console.log(`Elements observed per run: ${registry.size()}`);
    console.log(`Min latency: ${min.toFixed(2)} ms`);
    console.log(`Median latency: ${median.toFixed(2)} ms`);
    console.log(`P95 latency: ${p95.toFixed(2)} ms`);
    console.log(`Max latency: ${max.toFixed(2)} ms`);
    console.log('-----------------------------------------\n');
  });
});
