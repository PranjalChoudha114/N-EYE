import { describe, it, expect, beforeEach } from 'vitest';
import { observePage } from '../content/observer.js';
import { ElementRegistry } from '../content/registry.js';
import { createPageEpoch } from '@n-eye/protocol';

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
    expect(scene.elements[1]?.role).toBe('a');
    expect(scene.elements[2]?.inputType).toBe('text');
  });

  it('strictly excludes elements with hidden attribute, aria-hidden, or display:none', () => {
    document.body.innerHTML = `
      <div>
        <button id="btn-visible">Visible Button</button>
        <button id="btn-hidden-attr" hidden>Hidden Button</button>
        <button id="btn-aria-hidden" aria-hidden="true">Aria Hidden Button</button>
        <input type="hidden" id="raw-hidden" name="token" value="secret_csrf">
      </div>
    `;

    const scene = observePage(registry, createPageEpoch(1));

    expect(scene.elements.length).toBe(1);
    expect(scene.elements[0]?.id).toBe('e1');
    expect(scene.elements[0]?.innerTextCandidate).toBe('Visible Button');
  });

  it('resolves labels according to precedence: label[for] > aria-label > textContent > placeholder > title', () => {
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
});
