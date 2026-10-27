# Teammate-repo adoption slice

Status: **implemented on 2026-10-27** (no commits — the user commits).

Status: proposed for review. Source: recon of D:\sc sibling repos (ApproveDesk, SIH26262-Ao-chuba, Pravah, Kartik's SIH26262, AICTE-Workflow-Automation, PRISM, Anumitra, SIH-demo-source-code) on 2026-10-27. Rule: adopt a *pattern* or a *test invariant*, never a teammate's fabrications. Direct copy is allowed only where our contract is byte-identical to theirs.

## Template answers before editing

- What is this screen for? Unchanged everywhere. Each item below tightens an existing surface (evidence upload, demo calendar, trust/scope claims) rather than adding one.
- What is removed? Nothing removed. One added affordance (drag-and-drop) replaces no keyboard path; the click input stays.
- Does the backend behavior change? No schema, no RPC, no policy change. Checkpoint 3 is a *verification* of existing RLS, not a change.

## Checkpoint 1 - Drag-and-drop evidence upload (adapt UX only)

Source: Kartik's `CompliancePage.jsx` dragover/drop handlers + inline "not a valid PDF" rejection (`frontend/src/pages/CompliancePage.jsx:96-114,36-46`). We adapt, we do not import their backend (it never stores bytes and writes fabricated `aicte-india.org/vault/...` URLs into the DB).

- Anchor: `src/ui/CaseWorkspace.tsx:142` evidence index; the upload entry is the `<label className="upload-button">` with `<input type="file" accept="application/pdf,image/png,image/jpeg">` inside the per-document row.
- Judgment on scope: Kartik accepts PDF only; our surface is PDF/PNG/JPEG (`accept` list). The drop handler must validate against **our** accept list (note: `.pdf/.png/.jpg/.jpeg`, plus MIME check like their `file.type !== 'application/pdf'` but multi-type), not copy their single-MIME guard.
- Reuse rule (no parallel validation path): the drop handler calls the **same** code as the click input - extract the current `onChange` body into one `handleUpload(file)` used by both. Size/empty limits already exist in `src/domain/validation.ts:2-8` (`MAX_FILE_BYTES`, non-empty check) and are enforced inside `repo.upload` in both `src/data/demo.ts` and `src/data/supabase.ts` - do not duplicate them at the drop site.
- Rejection copy: inline in the evidence row context (aria-live region or toast via the existing `run` mechanism), one sentence, e.g. "Only PDF, PNG or JPEG files can be recorded as evidence." No alerts() dialogs anywhere.
- Mobile/a11y degradation: keyboard path = existing file input label (unchanged); drop zone is drag-only enhancement; global-window dragenter must not navigate (like their `window.addEventListener('dragover'/'drop')` preventDefault) - include the two-line global guard.
- Note: `e.target.value=''` reset (allows re-uploading the same file after a fix) migrates into `handleUpload`.
- Tests (fail-first):
  - e2e `demo.spec.ts` (it already covers the samples/correction loop): dispatch a synthetic DataTransfer drop for a supported file -> document recorded; drop an unsupported type -> rejection message visible, no document row added.
  - a11y unchanged: `accessibility.spec.ts` still clean; drop affordance must not create a duplicate landmark or label noise.
  - Mobile zoom suite (344-357 region) must still pass with the dnd affordance present.

## Checkpoint 2 - Demo calendar overlap disclosure (adapted dedupe, no schema)

Source: Pravah `sweeper.ts:43-53` `dedupeKey = APP:${id}:TIER_75` unique constraint + `isCatchUp` flag. We have no sweeper and no notification spawn path (notifications are in-app records; `notifications` is a static demo array at `src/data/demo.ts:126-130`, connected mode reads the table at `src/data/supabase.ts:72`). Importing their constraint would be scaffolding for code we do not have. The *honest equivalent* lives where we DO write derived data: the clock.

- Anchor: `src/data/demo.ts` `advanceClock` (uses `planClockAdvance` from `src/domain/consequences.ts`; writes one `demo_calendar_advanced` case event per affected application with `horizon_end` in the payload).
- Issue to solve: a second shift that overlaps a previously derived horizon re-reports the same consequence classes without acknowledging the overlap (each event is truthful, but the reader cannot tell new-derived from re-derived).
- Adaptation: when the planned horizon overlaps the max `horizon_end` already recorded in prior `demo_calendar_advanced` events for that case, the event detail gains one sentence naming the overlap start (and the payload gains a `catch_up_from` field, honoring Pravah's naming where it reads naturally: "partial catch-up of consequences already derived through <date>"). Cross-case overlap needs no per-consequence dedupe because we store one event per case with consequences in the payload - our structure already dedupes by construction.
- Tests (fail-first): `tests/virtualClock.test.tsx` - shift twice with overlapping horizons; assert the second event's detail discards nothing and includes the overlap sentence + `catch_up_from`; non-overlapping shift asserts its absence. Equivalence check stays in the existing spec.

## Checkpoint 3 - Cross-tenant stealth-404 verification (direct copy of the test invariant, zero product code)

Source: ApproveDesk `applications.py:38-39` (deliberate 404 for records outside the caller's scope - "so callers cannot discover another tenant's IDs").

- Our parity already exists: RLS via `fp_private.can_view(...)` (`supabase/migrations/20261022160724_harden_flowpilot.sql:94-96` and following per-table scope policies); the client window-fetches only scoped ids (`in('application_id', caseIds)`, `supabase.ts:64-79`); a raw document-id read goes `.eq('id', id).single()` whose error is surfaced as the unavailable state (`supabase.ts:124`). A stranger's document id therefore fails closed - structurally identical to stealth-404.
- What is missing is the *test that pins it*. Direct-copy their intent as a PGlite test in the existing SQL-gated harness (`tests/claim-rpcs.test.ts` pattern with `tests/database.ts`): seed two institutions with separate owners; as actor A, select by raw id a document/application of institution B -> zero rows / permission error through the same helper paths (`fp_private.can_view`), and assert theRPC surface used by `RemoteApplications` returns nothing rather than an existence hint.
- No copy-change, no test weakening; if any assertion here fails, that is a real finding to fix in migrations or the fetch path, in a separate commit.
- Out of scope: no new "404 page" UI; the existing `Empty` / unavailable states already carry the honest copy.

Already covered by prior slices (no work): upload byte cap + empty-file rejection (`validation.ts:2-8` matches ApproveDesk `MAX_UPLOAD_BYTES` and their `MAX+1` read is a server-side belt we don't need client-side); stage+audit single-transaction writes already exist in our event chain (`audit-chain.test.ts`, checklist sequence guards).

## Copy lifts (checkpoint 4 - only where a sentence is missing)

Max one sentence at one anchor each; no slogan stacking. Re-ask the template questions with the dossier copy in view before any edit.

1. Demo disclosure for notifications: we run no email/SMS gateway, so Ao-chuba's `RESEND_LIVE|SMTP_LIVE|ETHEREAL_SANDBOX|SIMULATED` states (`aicte-flow/src/lib/notify.ts:15-41`) cannot be adopted - but their honesty rule ("label the real channel state") maps to one line near the notifications read/unread UI in demo mode: notifications are in-app records only, nothing is sent externally. Add only if the surface currently implies a send (verify by reading Overview copy first).
2. Persona-controller note (for the deferred per-step controller work, parked in the dossier plan): Pravah's StepUpModal wording "statutory decisions can never be taken by automated system actors" is a strong reusable sentence for that future slice - record here, do not ship now.
3. Do NOT add the "not an official AICTE system" line if a materially equivalent disclosure already exists (check `DemoLab.tsx` / Preflight copy); duplicating it is copy inflation, which AGENTS.md discourages.

## Pitch/docs lane (own commit, no product code)

From SIH-demo-source-code (Team GeoLogics deck, 6 slides): adopt the *skeleton* into `docs/pitch-source-notebooklm.md` work - title card with team ID, solution/novelty, tech stack + registered Drive links, feasibility costs/challenges, quantified impact anchored to named assumptions, benchmarking + standards references (APH/GIGW/DPDP). The APH shared-Drive-copy reference pattern is worth reproducing. Do not import their numbers ("0.97 precision", "15,000 applications", "60->40 days") unless we re-run the equivalent on our stack; our own `docs/scale-results.json` (10k) is the citable baseline.

## Honesty-skip register (so we can say what we chose not to import)

- Kartik: fabricated vault URLs, backend that never stores bytes.
- PRISM: canned "Copilot" with one invented APPROVED_SOURCE (rule R-2025-MIT-02); simulated delivery badges ("EMAIL: DELIVERED", fake address).
- Tharun: hardcoded 128/34 metrics, fake GPS geo-locked evidence, AICTE-bureau impersonation commits, control-tower aesthetic (also prohibited by our AGENTS.md).
- Pravah: unconditional `totpVerified:true`, hardcoded 29/29 PASS / 99.9% uptime proof panel.
- AICTE-repo: mock reviewers with real-person-style names (`Justice (Retd.) V. K. Rao`) and `@aicte-india.org` emails.
- Ao-chuba seed: real institutions (`REAL_INSTITUTIONS_BY_REGION`, ~64 entries incl. JNTUH) would wrongly imply real approvals of synthetic records; the directory structure idea is noted only.
- PRISM FutureLab: our `analysis_snapshots/analysis_scenarios` (`model.ts:54`) already cover deterministic scenario replay; verify parity during checkpoint 3 test writing, no adoption.

## Risks and discipline

- DnD is the only genuinely interactive addition; it must not fork the validation path (single `handleUpload`) or we lose the "server/validate boundary unchanged" claim.
- The overlap-disclosure change touches generated event copy - update `virtualClock.spec.ts` expectations by extending assertions, never by deleting them.
- Checkpoint 3 may surface a real RLS gap; treat it as a separate fix, not folded silently into this slice.
- The 105 e2e, unit suites, and axe checks gate each checkpoint; commit order stays: 1 then 2 then 3, each independently shippable. User performs commits.


## What was adopted, checked, and left behind

Implemented checkpoints 1–4:

- Checkpoint 1 — drag-and-drop evidence upload (adapted UX only). `CaseWorkspace.tsx`: the upload label's `onChange` now routes through one shared `uploadEvidence(type, file)` used also by the per-type document group's `onDrop`; `repo.upload -> validateFile` stays the single size/empty/type guard (`MAX_FILE_BYTES`, non-empty, `application/pdf|image/png|image/jpeg` from `validation.ts:2-8`), so dropped HTML/unsupported types surface the same `role="alert"` rejection ("Choose a PDF, PNG, or JPEG document.") as the click path — one path, one message, no new copy. A window-level `dragover`/`drop` preventDefault guard blocks tab navigation on stray file drops; drag stays progressive (keyboard path = unchanged file-input label). New e2e test in `demo.spec.ts` covers a successful drop of a supported PDF and the rejection of a dropped `text/html` file via the same label locator (`page.locator('label').filter({hasText:'Upload Building Plan'})` dispatches a synthetic `DataTransfer` drop).
- Checkpoint 2 — demo calendar overlap disclosure (adapted Pravah catch-up dedupe, no schema). `src/data/demo.ts` `advanceClock`: before each shift it looks at prior `demo_calendar_advanced` events for the case; if a previous horizon end exceeds the new base date, the event detail gains "Partial catch-up: consequences through <date> were already derived by an earlier calendar shift." and the payload gains `catch_up_from`. New `tests/clock-overlap.test.ts` (happy-dom) pins: overlapping shifts disclose catch-up with the previous horizon end; a shift starting after the prior horizon does not; a first shift has no disclosure. Original sentences ("derived consequence of recorded deadlines and validity dates…No notices were dispatched…") stay intact.
- Checkpoint 3 — stealth-404 read pins (test invariant only). Added two tests to `tests/security.test.ts` using the existing PGlite harness: a foreign tenant's document row returns zero rows even when selected by exact id, and its case history is invisible; workflow notifications (bodies embed ref_nos) stay user-scoped — owner sees them after a deficiency raise, a sibling tenant sees zero. No product code changed; `fp_private.can_view` scoping already made these fail closed (migration policies at `harden_flowpilot.sql:89-95`).
- Checkpoint 4 — one honest channel sentence on Alerts (`WorkspaceViews.tsx`): "Notifications are in-app records; no external channel is contacted." No duplicate "not an official system" line was added (DemoLab/Preflight already carry the demo frame); the persona-controller copy stays parked for the deferred slice.

Honesty-skip register (unchanged judgment): Kartik fabricated `aicte-india.org` vault URLs; PRISM ships a canned Copilot with an invented APPROVED_SOURCE; Tharun hardcodes metrics, fake GPS-locked evidence and AICTE-bureau impersonation; Pravah ships an unconditional `totpVerified:true` plus a hardcoded 29/29 PASS panel; the AICTE repo styles mock reviewers with real-person-style names and `@aicte-india.org` emails; Ao-chuba's ~64 real-institution seed would wrongly imply real approvals of synthetic records (only the directory structure idea was noted).

Gate results after implementation: `npx tsc -b` clean; `npm run build` 32 chunks; e2e **106/106** (demo spec 39/39 incl. the new drop test); vitest batches green: `clock-overlap` 3/3, `security` 29/29, 57/57 sweep (clock, consequences, demoGovernance, demoGuide, case-renewal, dossierFlow, governance), governance standalone 14/14.

