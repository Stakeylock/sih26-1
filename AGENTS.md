# FlowPilot — Evidence Review Demo

## Intent

A structured evidence-review demo for institutional approval workflows. The work is about organizing claims, evidence, deficiencies, and an auditable record of review. It is not a simulation of any real institution and the demo disclosures make that clear in the shell and at simulated decision points.

HTML sketches can suggest composition (whether each screen has a purpose) without implying backend behavior. They are not a substitute for verifying the actual rendered app or the actual tests.

## Context

- React 19 + TypeScript + Vite
- Supabase (Postgres + RLS) in production; PGlite harness for local/CI unit and SQL-gated tests
- Current task: evidence verification and auditability

## Recent windows

### DATES AND SPIRIT

- **WEBSITE:** https://flowpilot.cc
- **KEYWORK:** verification, audit trail, Trust Center, access ledger, claims
- **OBLIGATION:** Record evidence review decisions and their provenance so they can be followed later.
- **IMPORTANT THING:** "Spirit" = what this demo actually does, not a marketing layer. The verified build (build verified + 320/320 unit/SQL tests + 104/104 Playwright E2E, certified 2026-10-27) is the current evidence that the claims/evidence/audit stack is wired, not a claim that the demo is production.
- **HELP:** Trust Center shows access grants, Evidence Passport shows document security state, and the claims ledger records verification events and deficiency threads; the reviewer test verifies the resolve→re-check→accept loop. Corrections keep history: "Submit correction for review" links a replacement and reopens only that claim for re-check. Recent evidence scale: 10k-application benchmark in `docs/scale-results.json`, zero errors.

### PRACTICE AND REVIEW

- **RULE:** Claim behavior is covered by SQL-gated tests for mandatory-claim gating, expired-evidence blocking, unlink-blocking, resolve/re-check loop, and signal disposition; behavioral reviewer E2E verifies provenance rendering and missing-infra blocking. Sample document bytes come from `scripts/generate-sample-pdfs.mjs` (`npm run generate:samples`) with a checksum manifest in `src/data/sample-pdfs.json`; never hand-edit `public/samples/` and keep the watermarked, unofficial labels.
- **MOMENTUM:** Do not add a "dispatch / control tower / cockpit" theme layer. The identity must come from the actual review composition, not from a new formula.
- **REVIEW:** Before UI changes that touch the worklist or dossier, answer:
  1. What is the one task this screen is for?
  2. What is being removed from the current presentation layer?
  3. Does the change change backend behavior to support the layout, or only the presentation?

## Rules

### Correctness before appearance

- Do not change backend behavior to support a layout.
- Do not simulate permissions or actions the current role cannot perform.
- Do not fabricate reviewer assignments, official seals, or decision outcomes.
- Do not fabricate data not present in the current demo/connected mode.

### Integrity over speed

- Verification events and deficiency resolutions must leave a record.
- Access grants and document trust state must remain honest and traceable.
- Demo disclosures must remain accessible and explicit at decision points.

### Scope discipline

- Keep each screen focused on one primary task.
- Stop stacking summary cards around the same data.
- Remove decorative template language: eyebrows, numbered section headings, generic explanatory subtitles, repeated slogans.
- Use numbers only where sequence or reference actually matters.

### Verification discipline

- Before runtime behavior is treated as real, check:
  - The relevant tests pass
  - The behavior you read in the code is the behavior the tests cover
  - E2E coverage exists for any flow introduced or changed

## Patterns

### Evidence review screen

- Compact header: institution + application type + current stage
- Evidence surface as the visual anchor, not a readiness score
- Claims/deficiencies/findings beside the evidence, not stacked as a separate card pile
- Honest missing-evidence or preview-unavailable states
- Read-only role: explain restriction near the header, not repeated on every item

### Overview / worklist

- One worklist, not a dashboard stack
- Why a case needs attention, current stage, unresolved claims/deficiencies, permitted next action
- Scope controls only for scopes actually supported by data
- Mobile: complete case summary, no page-level overflow, next action visible

### Records and history

- Compact audit rows with visible labels
- Expand detail on request
- No decorative stamps on every entry

## Templates

### Before editing a screen

Write one sentence for each:
- What is this screen for?
- What is the one main action here?
- What supporting detail is real and needed on this screen, not decorative?

### Before adding a component

- Does an existing primitive already cover this?
- What will this component remove or replace?
- Does it introduce a dependency? If so, say why in the change description.

### Before claiming a behavior fix

Map the claim to a test or E2E step:
- What assertion covers it?
- Does the assertion fail before the fix?
- Does the assertion pass after?

## Prohibited

- Marketing slogans inside working screens
- Fake approval outcomes
- Fake reviewer identity
- Fake official documents or seals
- Making unavailable actions appear functional
- Heavy decorative themes: glassmorphism, gradients, neo-brutalism, terminal, control tower/dispatch/cockpit metaphors
- Adding a dependency without saying why

## Files

<!-- AUTOGENERATED FILES LIST -->
<!-- Run: node scripts/list-files.cjs > docs/FILES.txt -->
<!-- Then paste the output below. -->

- `src/ui/CaseWorkspace.tsx` — dossier composition: evidence index, passport, claim ledger wiring, custody record-integrity card
- `src/ui/ClaimLedger.tsx` — claim/evidence/workflow history and system-check provenance line; institution correction dialog ("Submit correction for review")
- `src/ui/PrototypeDossier.tsx` — dossier record-integrity, custody and validation surfaces used by the demo dossier
- `src/ui/DemoLab.tsx` — guided demo lab: steps, scopes, demo calendar, reset
- `src/ui/DocumentPreview.tsx` — watermarked sample preview, object-URL rendering, download gating
- `src/data/demo.ts` — demo case/claims/evidence seed built from declared form values; serves sample-byte downloads for clean documents
- `src/data/sample-pdfs.json` — generated sample manifest: properties, scenario rows, SHA-256 checksums
- `src/data/requirements.json` — review requirements, including `system_fields` for system-check provenance
- `src/domain/integrity.ts` — domain types and integrity/verification/disposition concepts
- `scripts/generate-sample-pdfs.mjs` — regenerates `public/samples/*.pdf` + manifest; output must stay deterministic
- `tasks/integrity-slice-plan.md` — plan and risk note for the claims/evidence/audit slice
- `tasks/` — one plan file per slice; add a new file for each larger change
- `e2e/demo.spec.ts` — end-to-end verifier scenarios, including samples preview/download and the correction loop
- `tests/claims.test.ts` — claim-seed and claim-state assertions
- `tests/claim-rpcs.test.ts` — SQL-gated claim/evidence/deficiency gate and loop tests
- `tests/sample-pdfs.test.ts` — sample generation determinism and watermark/checksum assertions
- `tests/sample-download.test.ts` — download bytes for clean samples, refusal for quarantined/expired
- `src/styles.css` — current global presentation layer (the part the redesign prompt targets)
- `docs/judges-walkthrough.md` — verified presentation facts and performance notes; keep claims matching shipped behavior
- `docs/scale-results.json` — committed benchmark artifact with script/migration provenance

<!-- STOP EDITING BELOW THIS LINE -->
