# T009/T010 manual Chrome verification

Cursor cannot operate your personal Chrome profile. Perform these steps exactly. Capture a screenshot of any failure.

**Canonical unpacked path:** `apps/extension/dist/`  
**Identity:** Side Panel and `chrome://extensions` must show the same `DEV • <git-short-sha>` as `cat apps/extension/dist/build-identity.txt` and `git rev-parse --short HEAD`. After the T009/T010 commit, rebuild: `pnpm build:extension`, then Reload.

Do **not** treat a website login as an N-Eye AI event. Idle browsing must remain LOCAL_MONITORING.

---

## 0. Setup

1. `pnpm build:extension`
2. Open `chrome://extensions` → Developer mode → Load unpacked → `apps/extension/dist/` (or Reload if already loaded)
3. Confirm identity `DEV • <sha>` with no unexpected extra `*` unless you have local tracked edits
4. Start gateway if testing Case E: `PYTHONPATH=apps/planner-api .venv/bin/uvicorn src.main:app --port 8000 --host 127.0.0.1`
5. Serve portal: `python3 -m http.server 5173 --directory apps/test-portal`

---

## 1. CASE D — Content script recovery (the human defect)

**Exact reproduction class:** page open → extension Reload → Side Panel on that page.

1. Open `http://localhost:5173/scenario-06-trust-loop.html` (or any https page)
2. `chrome://extensions` → N-Eye → **Reload**
3. Do **not** refresh the page yet
4. Open / reopen the N-Eye Side Panel on that tab
5. **Pass:** pill becomes `RECOVERING CONTENT SCRIPT` then `TRUST LAYER READY`; Forensic Evidence → Content Script = `READY`; protection strip does **not** claim a Privacy Receipt; visualizer caption is the empty-task sentence
6. **Fail (capture):** pill stays `CONTENT SCRIPT DISCONNECTED` while SEE shows ACTIVE, or visualizer shows `user@example.com` / `[EMAIL_1]` without running a loop
7. If still disconnected: refresh the page once. **Pass after refresh:** `TRUST LAYER READY`. If still disconnected on a normal http(s) page, capture Network + the pill text.

---

## 2. CASE A — Normal DOM page

1. Open `http://localhost:5173/scenario-06-trust-loop.html`
2. Open Side Panel (after recovery/ready)
3. **Pass:** Content Script READY; PERCEIVE = SKIP; OCR Invoked = NO; protection = LOCAL / “No N-Eye AI request occurred”; visualizer empty until you click Run Loop
4. Do **not** click Run Loop yet

---

## 3. CASE F — Idle browsing

1. Stay on the page without clicking Run Loop
2. Optionally log in/out of a real site in another moment — still do not click Run Loop
3. **Pass:** LOCAL_MONITORING (or “N-Eye active” + no AI request copy). Receipt card stays hidden. No PROTECTED badge.

---

## 4. CASE B — Scenario 07 pixel email

1. Open `http://localhost:5173/scenario-07-visual.html`
2. Side Panel READY
3. Goal: `Read the pixel email on this page`
4. Click **Run Loop** (Mock is enough)
5. **Pass:** PERCEIVE not SKIP; OCR Invoked YES; Raw Screenshot Out `0 B`; SafeContext dump has no `OCR_EMAIL_T007@example.com`; may contain `[EMAIL_1]`; visualizer `data-evidence=live` only after this step

---

## 5. CASE C — Visual-only (Scenario 08)

1. Open `http://localhost:5173/scenario-08-visual-only.html`
2. Confirm the CONTINUE canvas has **no** button label / aria-label / `data-n-eye-visual`
3. Run Loop with goal `Click continue`
4. **Pass:** OCR/FUSED evidence appears; no fabricated element id in a rejected-proposal error for a made-up id; Raw Screenshot Out `0 B`
5. Optional: click the canvas yourself — page shows `Canvas control activated` (page handler, not N-Eye)

---

## 6. CASE E — Real protected remote request

1. Side Panel → REMOTE
2. Gateway pill: `Online (gemini: gemini-2.5-flash)` (or your configured model)
3. Open Scenario 06, goal containing `alice@example.com`
4. Run Loop
5. **Pass:** Egress canary PASS; Network Proof SafeContext has `[EMAIL_1]` not `alice@example.com`; Privacy Receipt appears with Event PROTECTED; protection strip PROTECTED only after that request
6. **Fail:** receipt while idle; raw email in the dump; PROTECTED without a request

---

## 7. Restricted page

1. Open `chrome://extensions` as the active tab
2. Open Side Panel
3. **Pass:** RESTRICTED PAGE / UNSUPPORTED. No inject. Visualizer empty.

---

## Failure evidence to capture

- Side Panel screenshot (pill, protection strip, visualizer, build identity)
- `apps/extension/dist/build-identity.txt`
- `git rev-parse --short HEAD`
- If Case E: Network Proof dump (redact nothing that is already a token; never paste real passwords)
