import { describe, it, expect, beforeEach } from 'vitest';
import { observePage } from '../content/observer.js';
import { ElementRegistry } from '../content/registry.js';
import { createPageEpoch } from '@n-eye/protocol';
import { computeLiveFingerprint } from '../authority/regrounding.js';

describe('Page Observer & Visibility Engine', () => {
  let registry: ElementRegistry;

  beforeEach(() => {
    registry = new ElementRegistry();
    document.body.innerHTML = '';
  });

  it('observes standard interactive elements with opaque IDs and roles', () => {
    document.body.innerHTML = `
      <div>
        <button id="btn-submit">Submit Form</button>
        <a href="/dashboard" id="nav-link">Dashboard</a>
        <input type="text" id="username" placeholder="Username">
        <select id="country"><option>USA</option></select>
        <textarea id="notes" placeholder="Additional notes"></textarea>
      </div>
    `;

    const scene = observePage(registry, createPageEpoch(1));

    expect(scene.elements.length).toBe(5);
    expect(scene.elements[0]?.id).toBe('e1');
    expect(scene.elements[0]?.role).toBe('button');
    expect(scene.elements[0]?.innerTextCandidate).toBe('Submit Form');
    expect(scene.elements[1]?.role).toBe('link');
    expect(scene.elements[2]?.inputType).toBe('text');
  });

  it('strictly excludes elements with hidden attribute, aria-hidden, or display:none', () => {
    document.body.innerHTML = `
      <div>
        <button id="btn-visible">Visible Button</button>
        <button id="btn-hidden-attr" hidden>Hidden Button</button>
        <button id="btn-aria-hidden" aria-hidden="true">Aria Hidden Button</button>
        <button id="btn-display-none" style="display:none">Display None Button</button>
        <input type="hidden" id="raw-hidden" name="token" value="secret_csrf">
      </div>
    `;

    const scene = observePage(registry, createPageEpoch(1));

    expect(scene.elements.length).toBe(1);
    expect(scene.elements[0]?.id).toBe('e1');
    expect(scene.elements[0]?.innerTextCandidate).toBe('Visible Button');
  });

  it('resolves names in AccName order: aria-labelledby > aria-label > native label > contents > placeholder > title', () => {
    document.body.innerHTML = `
      <div>
        <label for="email-field">Account Email Address</label>
        <input type="email" id="email-field" placeholder="Enter email" title="Your login email" value="test@example.com">

        <button id="aria-btn" aria-label="Accessible Continue Button">Click Here</button>

        <div id="lbl-src">Referenced External Label</div>
        <input type="text" id="ref-input" aria-labelledby="lbl-src" placeholder="Fallback">
      </div>
    `;

    const scene = observePage(registry, createPageEpoch(1));

    const emailElem = scene.elements.find((e) => e.inputType === 'email');
    expect(emailElem?.innerTextCandidate).toBe('Account Email Address');

    const ariaElem = scene.elements.find((e) => e.id === 'e2');
    expect(ariaElem?.innerTextCandidate).toBe('Accessible Continue Button');

    const refElem = scene.elements.find((e) => e.id === 'e3');
    expect(refElem?.innerTextCandidate).toBe('Referenced External Label');
  });

  it('bounds excessively long labels to 120 characters', () => {
    const longText = 'A'.repeat(500);
    document.body.innerHTML = `<button id="long-btn">${longText}</button>`;

    const scene = observePage(registry, createPageEpoch(1));

    expect(scene.elements[0]?.innerTextCandidate?.length).toBe(120);
    expect(scene.elements[0]?.innerTextCandidate).toBe('A'.repeat(120));
  });

  it('detects privacy findings for password and email fields', () => {
    document.body.innerHTML = `
      <form>
        <label for="user-pass">Master Password</label>
        <input type="password" id="user-pass">
        <label for="user-email">Billing Email</label>
        <input type="email" id="user-email">
      </form>
    `;

    const scene = observePage(registry, createPageEpoch(1));

    expect(scene.privacyFindings.length).toBeGreaterThanOrEqual(2);
    const passFinding = scene.privacyFindings.find((f) => f.privacyClass === 'SECRET_PASSWORD');
    const emailFinding = scene.privacyFindings.find((f) => f.privacyClass === 'PII_EMAIL');

    expect(passFinding).toBeDefined();
    expect(passFinding?.reason).toContain('password');
    expect(emailFinding).toBeDefined();
  });

  it('does not require fixture-specific attributes to observe a button', () => {
    document.body.innerHTML = `<button id="plain-btn" type="button">Go</button>`;
    const scene = observePage(registry, createPageEpoch(1));
    expect(scene.elements.some((e) => e.tagName === 'button')).toBe(true);
    expect(JSON.stringify(scene)).not.toMatch(/data-n-eye-visual/);
  });

  it('maps HTMLButtonElement.type=submit into fingerprint inputType', () => {
    document.body.innerHTML = `<form><button id="s" type="submit">Search</button></form>`;
    const scene = observePage(registry, createPageEpoch(1));
    const btn = scene.elements.find((e) => e.tagName === 'button');
    expect(btn?.inputType).toBe('submit');
    expect(btn?.formSubmitting).toBe(true);
  });

  it('keeps observer and live-reground inputType identical for default buttons', () => {
    document.body.innerHTML = `<button id="go">Continue</button>`;
    const scene = observePage(registry, createPageEpoch(1));
    const btn = scene.elements.find((e) => e.tagName === 'button');
    const node = document.getElementById('go');
    if (!btn || !(node instanceof HTMLButtonElement)) throw new Error('button missing');
    expect(btn.inputType).toBe('submit');
    expect(computeLiveFingerprint(node).inputType).toBe(btn.inputType);
  });

  it('does not let hidden descendants define a button semantic label', () => {
    document.body.innerHTML = `<button type="button" id="real">Visible Search<span hidden>Delete account now</span></button>`;
    const scene = observePage(registry, createPageEpoch(1));
    const btn = scene.elements.find((e) => e.tagName === 'button');
    expect(btn?.innerTextCandidate).toMatch(/Visible Search/i);
    expect(btn?.innerTextCandidate).not.toMatch(/Delete account/i);
  });

  it('names a native textbox from label[for] as Text input and role textbox', () => {
    document.body.innerHTML = `
      <form>
        <label class="form-label" for="my-text-id">Text input</label>
        <input type="text" name="my-text" id="my-text-id" class="form-control">
      </form>
    `;
    const scene = observePage(registry, createPageEpoch(1));
    const box = scene.elements.find((e) => e.inputType === 'text');
    expect(box?.role).toBe('textbox');
    expect(box?.innerTextCandidate).toBe('Text input');
    expect(box?.innerTextCandidate).not.toMatch(/my-text/);
  });

  it('prefers aria-labelledby over a conflicting native label', () => {
    document.body.innerHTML = `
      <span id="acc">Accessible heading</span>
      <label for="x">Native leak</label>
      <input id="x" type="text" aria-labelledby="acc">
    `;
    const scene = observePage(registry, createPageEpoch(1));
    const box = scene.elements.find((e) => e.inputType === 'text');
    expect(box?.innerTextCandidate).toBe('Accessible heading');
  });

  it('names an icon-only submit from the SVG title', () => {
    document.body.innerHTML = `
      <form>
        <input type="search" aria-label="Search">
        <button type="submit">
          <svg viewBox="0 0 24 24"><title>Search</title></svg>
        </button>
      </form>
    `;
    const scene = observePage(registry, createPageEpoch(1));
    const submit = scene.elements.find((e) => e.formSubmitting === true);
    expect(submit?.innerTextCandidate).toMatch(/^Search$/i);
  });
});
