/**
 * Isolated overlay stylesheet (inlined into Shadow DOM).
 * WHY: Content-script IIFE cannot import a Vite CSS file. Page CSS must not style N-Eye.
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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}
.nq-wrap {
  pointer-events: auto;
  max-height: min(460px, calc(100vh - 40px));
  overflow: auto;
}
.nq-card {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px 14px 12px;
  border-radius: 22px;
  border: 1px solid var(--nq-border);
  background: var(--nq-glass);
  color: var(--nq-text);
  box-shadow: 0 18px 40px -18px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(18px) saturate(1.25);
  -webkit-backdrop-filter: blur(18px) saturate(1.25);
  animation: nq-in 180ms cubic-bezier(0.22, 0.8, 0.28, 1);
}
@keyframes nq-in {
  from { opacity: 0; transform: translateY(-8px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.nq-card[data-theme='dark'] {
  --nq-glass: rgba(18, 21, 28, 0.78);
  --nq-elev: rgba(34, 44, 58, 0.72);
  --nq-border: rgba(255, 255, 255, 0.12);
  --nq-text: #f3f5f7;
  --nq-muted: #9aa6b4;
  --nq-accent: #3ad0c8;
  --nq-danger: #e15b5b;
  --nq-focus: #7ee7dc;
  --nq-ok: #3dbe8c;
  --nq-warn: #d6a441;
  color-scheme: dark;
}
.nq-card[data-theme='light'] {
  --nq-glass: rgba(251, 248, 243, 0.82);
  --nq-elev: rgba(255, 255, 255, 0.88);
  --nq-border: rgba(28, 24, 18, 0.12);
  --nq-text: #1c1f26;
  --nq-muted: #5c6570;
  --nq-accent: #0f7f7c;
  --nq-danger: #c0392b;
  --nq-focus: #0f7f7c;
  --nq-ok: #1f8a5a;
  --nq-warn: #9a6b12;
  color-scheme: light;
}
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .nq-card[data-theme='dark'] { --nq-glass: rgba(18, 21, 28, 0.96); }
  .nq-card[data-theme='light'] { --nq-glass: rgba(251, 248, 243, 0.96); }
}
* { box-sizing: border-box; }
button, input { font: inherit; color: inherit; }
.nq-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.nq-brand { display: flex; align-items: center; gap: 8px; min-width: 0; }
.nq-mark { width: 32px; height: 16px; object-fit: contain; flex: 0 0 auto; }
.nq-name { margin: 0; font: 600 14px/1.2 sans-serif; }
.nq-kicker { margin: 2px 0 0; color: var(--nq-muted); font: 400 11px/1.3 sans-serif; }
.nq-actions-h { display: flex; align-items: center; gap: 4px; }
.nq-icon {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; border-radius: 999px;
  border: 1px solid var(--nq-border); background: transparent; cursor: pointer;
}
.nq-icon:focus-visible, .nq-btn:focus-visible, .nq-chip:focus-visible, .nq-input:focus-visible, .nq-more:focus-visible {
  outline: 2px solid var(--nq-focus); outline-offset: 2px;
}
.nq-site { margin: 0; font: 600 11px/1.3 sans-serif; letter-spacing: 0.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nq-headline { margin: 0; font: 600 20px/1.2 sans-serif; letter-spacing: -0.03em; }
.nq-card[data-tone='ok'] .nq-headline { color: var(--nq-ok); }
.nq-card[data-tone='warning'] .nq-headline { color: var(--nq-warn); }
.nq-card[data-tone='danger'] .nq-headline { color: var(--nq-danger); }
.nq-message { margin: 6px 0 0; color: var(--nq-muted); font: 400 12px/1.45 sans-serif; }
.nq-facts { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 4px; }
.nq-row { display: flex; justify-content: space-between; gap: 8px; font: 400 11px/1.3 sans-serif; }
.nq-row span:first-child { color: var(--nq-muted); }
.nq-input {
  width: 100%; min-height: 36px; padding: 0 10px; border-radius: 10px;
  border: 1px solid var(--nq-border); background: var(--nq-elev);
}
.nq-row-btns { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.nq-btn {
  min-height: 32px; padding: 0 12px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--nq-border); background: var(--nq-elev);
}
.nq-btn-primary { background: var(--nq-accent); color: #062322; border-color: transparent; }
.nq-btn-danger { background: var(--nq-danger); color: #fff; border-color: transparent; }
.nq-btn:disabled, .nq-chip:disabled, .nq-input:disabled { opacity: 0.5; cursor: not-allowed; }
.nq-hidden { display: none !important; }
.nq-mode { display: flex; gap: 6px; }
.nq-chip {
  min-height: 26px; padding: 0 10px; border-radius: 999px; cursor: pointer;
  border: 1px solid var(--nq-border); background: transparent; font: 600 11px/1 sans-serif;
}
.nq-chip.is-active { background: color-mix(in srgb, var(--nq-accent) 18%, transparent); }
.nq-more {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; min-height: 32px; padding: 0 4px 0 2px;
  border: 0; background: transparent; color: var(--nq-accent); cursor: pointer;
  font: 600 12px/1 sans-serif;
}
.nq-more-slot { position: relative; min-height: 32px; }
.nq-more-frame {
  position: absolute; inset: 0; width: 100%; height: 100%;
  border: 0; opacity: 0; pointer-events: none;
}
.nq-more-frame.is-ready { pointer-events: auto; }
.nq-alert { margin: 0; color: var(--nq-danger); font: 400 12px/1.4 sans-serif; }
.nq-confirm { display: grid; gap: 6px; padding-top: 4px; }
.nq-confirm-line { margin: 0; color: var(--muted); font-size: 12px; }
@media (prefers-reduced-motion: reduce) {
  .nq-card { animation: none; transition: none; }
}
`;
