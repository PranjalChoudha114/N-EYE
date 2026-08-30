/**
 * Isolated overlay stylesheet (inlined into Shadow DOM).
 * WHY: Content-script IIFE cannot import a Vite CSS file. Page CSS must not style N-Eye.
 * Visual tokens mirror ui/tokens.css (no remote fonts, no CDN).
 */

export const OVERLAY_CSS = `
:host {
  all: initial;
  position: fixed !important;
  top: 20px !important;
  right: 20px !important;
  z-index: 2147483646 !important;
  width: min(360px, calc(100vw - 40px)) !important;
  max-width: 380px !important;
  max-height: min(460px, calc(100vh - 40px)) !important;
  margin: 0 !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  pointer-events: none !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}
.nq-wrap {
  pointer-events: auto;
  max-height: min(460px, calc(100vh - 40px));
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(160, 236, 228, 0.28) transparent;
}
.nq-wrap::-webkit-scrollbar { width: 8px; }
.nq-wrap::-webkit-scrollbar-thumb {
  background: rgba(160, 236, 228, 0.28);
  border-radius: 999px;
}
.nq-card {
  --nq-font: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Roboto, Helvetica, Arial, sans-serif;
  --nq-font-display: Orbitron, 'Avenir Next', 'Century Gothic', Futura, 'Trebuchet MS', var(--nq-font);
  --nq-ease: cubic-bezier(0.22, 0.8, 0.28, 1);
  --nq-in: 180ms;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 12px;
  border-radius: 16px;
  border: 1px solid var(--nq-border);
  background: var(--nq-glass);
  color: var(--nq-text);
  box-shadow: 0 18px 44px -20px rgba(0, 0, 0, 0.55), 0 0 0 1px color-mix(in srgb, var(--nq-accent) 22%, transparent);
  backdrop-filter: blur(12px) saturate(1.15);
  -webkit-backdrop-filter: blur(12px) saturate(1.15);
  /* WHY: Clipping this surface (hidden overflow + radius + backdrop-filter) steals iframe/button hits in Chrome. */
  overflow: visible;
  animation: nq-in var(--nq-in) var(--nq-ease);
}
@keyframes nq-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.nq-card[data-theme='dark'] {
  --nq-glass: rgba(11, 14, 20, 0.92);
  --nq-elev: rgba(24, 30, 42, 0.88);
  --nq-border: rgba(120, 230, 220, 0.14);
  --nq-text: #f2f5f8;
  --nq-muted: #93a0b0;
  --nq-accent: #3ad8d0;
  --nq-danger: #e15b5b;
  --nq-focus: #7ee7dc;
  --nq-ok: #3dbe8c;
  --nq-warn: #e0b04a;
  --nq-info: #6ea8d8;
  --nq-protect: #5ee0c8;
  --nq-ink: #062322;
  color-scheme: dark;
}
.nq-card[data-theme='light'] {
  --nq-glass: rgba(247, 249, 251, 0.94);
  --nq-elev: rgba(255, 255, 255, 0.96);
  --nq-border: rgba(16, 28, 36, 0.12);
  --nq-text: #12141a;
  --nq-muted: #4e5968;
  --nq-accent: #0d8a84;
  --nq-danger: #c0392b;
  --nq-focus: #0d8a84;
  --nq-ok: #187a4e;
  --nq-warn: #9a6b12;
  --nq-info: #2f6f9e;
  --nq-protect: #0f7f7c;
  --nq-ink: #f4fffe;
  color-scheme: light;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .nq-card[data-theme='dark'] { --nq-glass: rgba(11, 14, 20, 0.98); }
  .nq-card[data-theme='light'] { --nq-glass: rgba(247, 249, 251, 0.98); }
}
.nq-card[data-tone='ok'] { box-shadow: 0 18px 44px -20px rgba(0, 0, 0, 0.55), 0 0 0 1px color-mix(in srgb, var(--nq-ok) 40%, transparent); }
.nq-card[data-tone='warning'] { box-shadow: 0 18px 44px -20px rgba(0, 0, 0, 0.55), 0 0 0 1px color-mix(in srgb, var(--nq-warn) 45%, transparent); }
.nq-card[data-tone='danger'] { box-shadow: 0 18px 44px -20px rgba(0, 0, 0, 0.55), 0 0 0 1px color-mix(in srgb, var(--nq-danger) 45%, transparent); }
.nq-card[data-phase='PROTECTING'] { box-shadow: 0 18px 44px -20px rgba(0, 0, 0, 0.55), 0 0 0 1px color-mix(in srgb, var(--nq-protect) 45%, transparent); }
.nq-card[data-running='1']::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 2px;
  z-index: 0;
  background: linear-gradient(90deg, transparent, var(--nq-accent), transparent);
  animation: nq-sweep 1.6s var(--nq-ease) infinite;
  pointer-events: none !important;
}
@keyframes nq-sweep {
  from { transform: translateX(-35%); opacity: 0.4; }
  50% { opacity: 1; }
  to { transform: translateX(35%); opacity: 0.4; }
}
@keyframes nq-breathe {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.86); }
}
* { box-sizing: border-box; }
button, input { font: inherit; color: inherit; }
.nq-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.nq-brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
.nq-brand-text { min-width: 0; }
.nq-mark {
  width: 32px; height: 16px; object-fit: contain; flex: 0 0 auto;
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--nq-accent) 40%, transparent));
}
.nq-card[data-theme='light'] .nq-mark { filter: drop-shadow(0 1px 1px rgba(12, 24, 28, 0.18)); }
.nq-name {
  margin: 0;
  font: 600 14px/1.15 var(--nq-font-display);
  letter-spacing: 0.08em;
}
.nq-status-pill {
  display: inline-flex; align-items: center; gap: 6px;
  margin-top: 3px; max-width: 100%;
  padding: 1px 8px 1px 6px;
  border-radius: 999px;
  border: 1px solid var(--nq-border);
  background: color-mix(in srgb, var(--nq-accent) 12%, transparent);
}
.nq-status-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--nq-accent);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--nq-accent) 18%, transparent);
  flex: 0 0 auto;
}
.nq-card[data-tone='ok'] .nq-status-dot { background: var(--nq-ok); }
.nq-card[data-phase='READY'] .nq-status-dot,
.nq-card[data-phase='IDLE'] .nq-status-dot {
  background: var(--nq-accent);
  animation: nq-breathe 2.4s var(--nq-ease) infinite;
}
.nq-card[data-tone='info'] .nq-status-dot,
.nq-card[data-running='1'] .nq-status-dot {
  background: var(--nq-info);
  animation: nq-breathe 1.8s var(--nq-ease) infinite;
}
.nq-card[data-tone='warning'] .nq-status-dot { background: var(--nq-warn); animation: nq-breathe 1.5s var(--nq-ease) infinite; }
.nq-card[data-tone='danger'] .nq-status-dot { background: var(--nq-danger); }
.nq-card[data-phase='PROTECTING'] .nq-status-dot { background: var(--nq-protect); }
.nq-card[data-phase='COMPLETED'] .nq-status-dot { animation: none; background: var(--nq-ok); }
.nq-kicker {
  margin: 0; color: var(--nq-text);
  font: 600 10px/1.2 var(--nq-font-display);
  letter-spacing: 0.06em;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nq-actions-h { display: flex; align-items: center; gap: 4px; }
.nq-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 999px;
  border: 1px solid var(--nq-border); background: transparent; cursor: pointer;
  color: var(--nq-muted);
  transition: background-color 140ms var(--nq-ease), border-color 140ms var(--nq-ease), transform 90ms var(--nq-ease);
}
.nq-icon:hover { background: color-mix(in srgb, var(--nq-accent) 12%, transparent); border-color: var(--nq-accent); color: var(--nq-text); }
.nq-icon:focus-visible, .nq-btn:focus-visible, .nq-chip:focus-visible, .nq-input:focus-visible, .nq-more:focus-visible {
  outline: 2px solid var(--nq-focus); outline-offset: 2px;
}
.nq-context, .nq-task { display: flex; flex-direction: column; gap: 6px; }
.nq-site {
  margin: 0; font: 600 11px/1.3 var(--nq-font);
  letter-spacing: 0.04em; color: var(--nq-muted);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.nq-headline {
  margin: 0;
  font: 600 20px/1.2 var(--nq-font-display);
  letter-spacing: 0.02em;
}
.nq-card[data-tone='ok'] .nq-headline { color: var(--nq-ok); }
.nq-card[data-tone='warning'] .nq-headline { color: var(--nq-warn); }
.nq-card[data-tone='danger'] .nq-headline { color: var(--nq-danger); }
.nq-message { margin: 0; color: var(--nq-muted); font: 400 12px/1.45 var(--nq-font); }
.nq-facts { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 4px; }
.nq-row { display: flex; justify-content: space-between; gap: 8px; font: 400 11px/1.3 var(--nq-font); }
.nq-row span:first-child { color: var(--nq-muted); }
.nq-row.is-shot-zero span:last-child { color: var(--nq-protect); font-weight: 700; }
.nq-input {
  width: 100%; min-height: 36px; padding: 0 10px; border-radius: 10px;
  border: 1px solid var(--nq-border); background: var(--nq-elev); color: var(--nq-text);
  transition: border-color 140ms var(--nq-ease), box-shadow 140ms var(--nq-ease);
}
.nq-input:hover:not(:disabled) { border-color: color-mix(in srgb, var(--nq-accent) 35%, var(--nq-border)); }
.nq-input:focus-visible { box-shadow: 0 0 0 3px color-mix(in srgb, var(--nq-accent) 18%, transparent); }
.nq-row-btns { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 2px; }
.nq-btn, .nq-input, .nq-icon, .nq-chip, .nq-more {
  position: relative;
  z-index: 1;
  pointer-events: auto;
}
.nq-btn {
  min-height: 32px; padding: 0 12px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--nq-border); background: var(--nq-elev);
  font: 600 11px/1 var(--nq-font);
  transition: background-color 140ms var(--nq-ease), border-color 140ms var(--nq-ease);
}
.nq-btn:hover:not(:disabled) { background: color-mix(in srgb, var(--nq-accent) 22%, var(--nq-elev)); }
.nq-btn-primary {
  background: var(--nq-accent); color: var(--nq-ink); border-color: transparent;
  box-shadow: 0 0 16px -8px color-mix(in srgb, var(--nq-accent) 80%, transparent);
}
.nq-btn-danger { background: var(--nq-danger); color: #fff; border-color: transparent; }
.nq-btn:disabled, .nq-chip:disabled, .nq-input:disabled { opacity: 0.5; cursor: not-allowed; }
.nq-hidden { display: none !important; }
.nq-mode { display: flex; gap: 6px; }
.nq-chip {
  min-height: 26px; padding: 0 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--nq-border); background: transparent;
  font: 600 11px/1 var(--nq-font);
  transition: background-color 140ms var(--nq-ease);
}
.nq-chip:hover:not(:disabled) { background: color-mix(in srgb, var(--nq-accent) 10%, transparent); }
.nq-chip.is-active {
  background: color-mix(in srgb, var(--nq-accent) 18%, transparent);
  border-color: color-mix(in srgb, var(--nq-accent) 40%, transparent);
}
.nq-more {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; min-height: 32px; padding: 0 4px 0 2px;
  border: 0; background: transparent; color: var(--nq-accent); cursor: pointer;
  font: 600 12px/1 var(--nq-font);
  transition: color 140ms var(--nq-ease);
}
.nq-more:hover { color: var(--nq-focus); }
.nq-more-slot {
  position: relative;
  z-index: 2;
  isolation: isolate;
  min-height: 32px;
}
.nq-more-frame {
  position: absolute; inset: 0; width: 100%; height: 100%; max-width: 100%; max-height: 100%;
  border: 0; opacity: 0; pointer-events: none; z-index: 1;
}
.nq-more-frame.is-ready { pointer-events: auto; }
.nq-alert {
  margin: 0; padding: 8px 10px; border-radius: 10px;
  color: var(--nq-danger); font: 400 12px/1.4 var(--nq-font);
  background: color-mix(in srgb, var(--nq-danger) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--nq-danger) 30%, transparent);
}
.nq-hint {
  margin: 0; padding: 8px 10px; border-radius: 10px;
  color: var(--nq-text); font: 400 11px/1.4 var(--nq-font);
  background: color-mix(in srgb, var(--nq-warn) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--nq-warn) 40%, transparent);
}
.nq-card[data-phase='ASK_USER'] .nq-btn-primary { box-shadow: none; }
.nq-confirm {
  display: grid; gap: 6px; padding: 10px;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--nq-warn) 45%, var(--nq-border));
  background: color-mix(in srgb, var(--nq-warn) 10%, var(--nq-elev));
}
.nq-confirm-line { margin: 0; color: var(--nq-muted); font: 400 12px/1.4 var(--nq-font); }
.nq-confirm .nq-row-btns { margin-top: 4px; justify-content: flex-end; }
@media (prefers-reduced-motion: reduce) {
  .nq-card, .nq-status-dot { animation: none; }
  .nq-card[data-running='1']::after { animation: none; opacity: 0.85; transform: none; }
  .nq-icon, .nq-btn, .nq-chip, .nq-more, .nq-input { transition: none; }
}
`;
