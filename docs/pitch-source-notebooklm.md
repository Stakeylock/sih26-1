# Clauseway — SIH 2026 pitch source (single-source for slide generation)

Product: Clauseway (repo `clauseway-sih26262`, package version 0.4.0)
Problem statement: Smart India Hackathon 2026, PS 26262 — AICTE regulatory approval workflows (institution approval, scrutiny, expert visits/EVC, deadlines, compliance for a cycle)
Tagline: "Evidence changes. Accountability remains."
One-line for the title slide: Clauseway is an accountable AICTE approval-and-compliance prototype: every case carries recorded evidence, claims, deficiencies, reviewer findings and decisions in one tamper-evident audit chain — corrections reopen only what they affect, and every screen answers "what is blocked, who must act, what proves it happened".

## How to use this document
Everything below is verified product behavior (implemented in code and covered by tests) unless a line is explicitly labeled "roadmap" or "do not claim". Compose slides strictly from the verified sections. Suggested 10-slide outline sits at the end.

## The four-minute demo story (the arc to present on slides 2–4)
1. A fire-safety certificate expires. The old document stays on record; it is marked expired and its claim is flagged — nothing is deleted or silently replaced.
2. The institution submits a corrected replacement. The response dialog states plainly: the affected claim returns to "Awaiting verification" for re-check; all other verified claims stay verified.
3. The assigned scrutiny officer re-checks the replacement and records the finding (accept, or reopen with a reason). Acceptance is a recorded human review, not the file upload itself.
4. The dossier shows the case advancing along its pinned route — Submission → Scrutiny → (Expert visit/EVC when required) → Final decision — with the audit event written before state persists.
5. The regional officer decides with a decision receipt: who decided, under which role, why, which workflow version. The case closes but a continuing obligation (e.g., a valid certificate must remain on file) stays open in the obligation register.
6. The obligation later goes overdue: the deadline engine raises an alert and an escalation toward the responsible role — accountable follow-through after approval.
7. At any point: open Case → History → choose a recorded checkpoint and inspect exactly what the claim/evidence state said at that moment (recorded replay is history, not a plan).
8. Finish on Trust Center: verify the hash chain on demand, then run the tamper simulation on a temporary copy — the mismatch is detected and named, and the stored record is untouched.

## Core pillars to structure the deck around
1. **Recorded evidence with provenance.** Documents carry origin (synthetic sample or private upload), scan state (clean/quarantined/rejected), expiry dates, and an Evidence Passport (document security state). Seeded samples are watermarked "SYNTHETIC SAMPLE — NOT AN OFFICIAL DOCUMENT".
2. **Claims, not checkbox theater.** A claim ledger per case: each claim states what it asserts, which document types back it, its verification method (human review / system check / not applicable), who verified it and when, and a recorded review basis. System checks show their exact inputs and say "evaluated against demo rule v1 … not an official regulatory threshold".
3. **Corrections that reopen one thing, not everything.** Raising a claim deficiency is targeted: the deficiency carries observation, remedy, due date, raised-by clause. The institution's "Submit correction for review" keeps history, links the replacement, and reopens only that claim for re-check.
4. **Server-enforced transitions.** `transition()` validates allowed actions, record version, reviewer identity and region, document validity, mandatory claims and open deficiencies before mutating — then writes the audit event before persisting state. (Connected mode: backed by RLS; demo mode replays the same guard layer.)
5. **Tamper-evident audit chain.** Every event stores prev_hash + event_hash; `verifyAuditChain()` recomputes every link and fails closed on any altered event; `tamperReplay()` demonstrates detection on a temporary copy. Honest boundary shown on every verification: this covers the stored event history only; it does not confirm underlying claims or document validity.
6. **One recorded clock.** Dual-clock attribution splits officer-held vs institution-held days from open-deficiency windows; working-day counting excludes weekends and recorded holidays (boundary-tested); deadlines derive from the case's own dates, never hardcoded; demo calendar advances write a SYSTEM audit row per affected case — the simulation itself is auditable.
7. **Human authority where it matters.** Expert visit planning (recommended panel) checks recorded conflicts, assignments and availability for the exact window and lists excluded experts with reasons — tick only, decide nowhere; a required independent review gates any decision; decision receipts name the human, the role and the version.
8. **Access that is claimed and visible.** Role grants (institution, scrutiny officer, EVC coordinator, regional officer, national admin), a "holds this case" custody disclosure derived from recorded status, and server-side role records in connected mode.
9. **Delivery you can prove.** The operations view distinguishes queued, delivered in-app, accepted by a loopback SMTP sink, and ambiguous outcomes, with attempt counts and immutable attempt history — notification receipts, not just alerts.
10. **Scale, measured.** See the verified numbers section.

## Verified numbers (cite exactly, all from committed result files)
- Tests at the time of this note: 320 unit tests (42 files) and 104 Playwright e2e scenarios pass; build verifies across 32 chunks; seeded documents are watermarked synthetic PDF samples that preview in the workspace and download only while clean.
- `docs/scale-results.json` (with per-file SHA-256 provenance for script + migrations): dataset 10,000 applications / 10,000 events / 10,000 obligations / 1,000 pending notifications.
  - 25 virtual read+write clients: 553.7 requests/s, p95 page read 89.04 ms, zero errors.
  - 50 clients: 528.5 r/s, p95 150.47 ms, zero errors.
  - 100 clients: 522.6 r/s, p95 273.07 ms, zero errors; max 25 DB connections; zero observed lock waiters; overall result: passed.
  - Honest boundary (state it on the slide as we do): single-machine synthetic-data benchmark, not a production benchmark.

## What a judge can step through (screens to name on slides)
- Overview worklist (one worklist, next action visible), Case dossier (route, custody, evidence index, claim ledger, history, approval scope, policy impact), Case analysis (what-if comparison with the five-day delay preset — scenario, not live), Verification visits (panel planning, reservations, conflicts), Trust Center (trust state, access grants, audit verification), Demo lab (guided steps per role, demo calendar, reset), Operations (delivery intents/attempts, worker jobs), Decision receipts / Audit logs.
- Demo discipline: role switching is a preview inside the demo; in connected mode the same actions are rejected server-side when the role lacks access.

## Differentiators to pose neutrally (one line each)
- "We don't advertise verification — we demonstrate it": on-demand recomputation of the audit chain, with a demonstrated tamper failure on a temporary copy.
- Cross-document conflicts (declared values vs roster fields) are flagged side by side for human review, never auto-resolved.
- Corrected evidence reopens exactly the claim it touched; everything else keeps its recorded verification.
- What-if planning never mutates the live record and the comparison is saved and reloadable.
- Assistant determinism: the review assistant is a deterministic guide that cites actual case records; it says what it does not know rather than inventing policy.
- Honest-unavailable states everywhere (no silent fakes): missing bytes, missing infra, missing reviews all say so.

## Do-not-claim list (integrity rules for every slide and speaker note)
- Never present the hash as a document signature, a synthetic panel as verified certification, or a deterministic score as an approval probability.
- Do not claim "tamper-proof"; claim "tamper-evident, verified on demand, failed closed in our demo".
- Do not imply deployment readiness; the prototype's evidence is its test/build/verification gates, not a production posture.
- Avoid "every team" superlatives; other teams legitimately implement parts of this — our strength is the recorded-evidence posture, corrections without erasure, and the demonstrated verification loop.
- The demo role selector is an in-demo preview, not demonstration of server-enforced authorization on the judge's own request; said only as honest as that.

## Suggested 10-slide outline
1. Title — Clauseway + one-line above + PS 26262.
2. The everyday problem — copyright of the example: an expired certificate quietly breaks a review (show expired-document row + open claim).
3. The record, not a pile of documents — Evidence Passport + claim ledger (verification method, reviewer, basis).
4. Corrections without erasure — expired original vs eligible replacement; "Submit correction for review" reopens one claim.
5. Channels of authority — server-enforced transitions, custody disclosure, decision receipts (human + role + version).
6. One recorded clock — dual-clock attribution, working days + holidays, demo calendar with SYSTEM audit rows.
7. Verification you can run — verify chain on demand, tamper replay on a temp copy, honest boundary footnote.
8. Proven aftermath — continuing obligations, overdue escalation, delivery receipts (queued → in-app → SMTP-sink-accepted → escalation).
9. Measured, not claimed — scale numbers table (10k applications; 25/50/100 clients; 553.7→522.6 r/s; p95 89–273 ms; 0 errors) + the testing gates (320 unit / 104 e2e).
10. The close — "Evidence changes. Accountability remains." + what we would build with SIH support (roadmap: real document bytes behind the passport, connected-mode hardening, policy coverage matrix).

## Facts and routes for speaker notes
- Example routes: one route includes Submission → Scrutiny → EVC → Regional decision; SAC/SHC appeal handling exists as a recorded in-demo synthetic request behind a 15-character minimum grounds gate. Safer slide phrasing: "route and appeals are modeled; the evidence packet relies on the committee gate, not an invented hearing."
- The demo includes a synthetic outbox/loopback mail sink; nothing external is sent from the demo.
- Trust boundaries repeat that chain verification covers stored event history only.
- Workspace identity and "holds this case" derive from recorded status transitions, not free text claims.
- Assistant answers stick to case facts; policy interpretation is out of its claimed scope.
