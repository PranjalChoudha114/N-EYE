# N-Eye — Project Understanding

## What Is N-Eye?

N-Eye is a **privacy-preserving browser agent trust layer** built as a Chrome MV3
extension for ISRO's SIH 2026 Problem Statement 26171: "On-device Visual Perception
for Lightweight Browser Agents."

Think of N-Eye as a **security guard** between the user's private browser and AI.
It shares only what is needed for reasoning and checks every suggested action before
allowing it.

## The Core Problem

Normal cloud-first browser agents send screenshots, DOM dumps, and form values
directly to remote AI services. This is fast but **dangerous** — it exposes passwords,
emails, financial data, and personal information to third parties.

N-Eye solves this by keeping sensitive data local and sending only a minimized,
sanitized representation to the AI planner.

## The Canonical Loop

```
1. SEE LOCALLY     — Observe visible page structure (DOM, ARIA, geometry)
2. PERCEIVE        — If pixels contain info structure missed, OCR/CV locally
3. PROTECT LOCALLY — Detect PII, tokenize or remove before network
4. THINK REMOTELY  — Send SafeContext to remote planner, receive ActionProposal
5. VALIDATE LOCALLY — Check proposal against current page, policy, risk
6. ACT LOCALLY     — Execute one validated action through content script
7. VERIFY LOCALLY  — Confirm the page state actually changed
```

## What Makes N-Eye Different

1. **Adaptive perception**: Structure first, pixels only when needed
2. **Privacy-minimized context**: Scoped private tokens, not raw values
3. **SafeContext-only egress**: Strict allowlisted outbound schema
4. **Local authority**: Remote planner cannot execute directly
5. **Measurable evidence**: Canary tests, not claims

## Success Criterion

> On a normal laptop, a Chrome N-Eye extension can open a realistic controlled
> private webpage; observe task-relevant structure and pixels locally; detect
> several privacy classes; keep passwords, OTPs and equivalent secrets local;
> construct an inspectable SafeContext; prove through the actual network request
> that forbidden raw values did not leave; obtain a constrained structured proposal
> from a remote planner; locally validate and execute; verify the resulting state
> change; and report measured evidence.

## Scoring Dimensions (SIH 2026)

| Dimension | Weight |
|-----------|--------|
| Visual-context accuracy | 25% |
| Sensitive/PII precision-recall | 20% |
| Redaction precision | 20% |
| Client resource utilization | 20% |
| End-to-end latency | 15% |
