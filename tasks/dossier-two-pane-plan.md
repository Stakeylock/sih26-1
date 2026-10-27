# Two-pane, task-first dossier — plan (no code yet)

Status: proposed for review. Nothing here is speculative: each row states what is removed from the current composition instead of what is added. Re-ask the AGENTS.md template questions before any edit; the answers are below.

## Template answers before editing

- What is this screen for? One task at the center: the single permitted next action for the viewer and the evidence that supports/rejects it; secondary record sections read from one rail instead of stacked around the action.
- What is removed (you're losing the current layout's redundancy, not features): the duplicate custody/status line; the panel-footnote copy paste; decorative section titles; the rail repeating shift-instructions every tab; readiness cards that repeat "Submission/Claims" twice on the dossier.
- Presentation-only? Yes: no new fetch, transition, or status entitlement; only composition and copy conflicts.

## Proposed two-pane composition

### Pane A (left, sticky, narrow) — "Task and proof of owner"
Rows, top-first:
1. Case identity: institution, type, ref_no, current stage (routeStage).
2. Task block: allowedActions-driven single next action with its dialog trigger; denied actions listed as honest-unavailable with reason (not hidden). When custody changes (deficiency window), one line separating stage gate from correction state — we already split this wording; do not rewrite here.
3. Evidence anchors: linked claims for the selected document; missing required documents from missingInputs(); each anchor focuses the right pane section instead of cloning content.
4. No numbers, no clocks, no chained scorecards in pane A beyond the recorded SLA target line.

### Pane B (right, wide) — "The work surface"
Tabs collapse from six (evidence/review/history/scope/policy) into the same six with fewer repeated summaries inside each; each tab removes its twin summary row. History/trust integrity card stays exclusive to pane A footer (one instance), not both header and rail.

### Explicit removals (composition, not features)
- Status/custody duplicate headers; custody stays only once.
- Repeated per-tab pre-click dependency note strings; the demo-lab note stays demo-lab-only.
- Readiness "Submission/Claim" scorecard tiles in pane B footer — pane A carries one readiness line.

## Discipline checks

- No new components without one sentence each; no dependency additions.
- No mutation of domain/validation functions; repository untouched.
- The existing 104 e2e and a11y tests must all pass unchanged in meaning; where tab labels/assertions shift, tests are updated rather than weakened (no assertion removal; only legible updates with new copy).
- Mobile: pane A becomes a top summary; pane B follows; no overlapped landmarks, no horizontal overflow (existing 390px tests guard).

## Honest follow-through plan (3 checkpoints)

1. First checkpoint: two-pane skeleton + removal of duplicates only. Test: full e2e + assert the removed duplicate copies are absent (new assertions, generated with finding failing first on the current build where duplicates actually exist).
2. Second: evidence anchors focus pane B sections on click; deep-link hashes keep working (dossier tab route test).
3. Third: prune per-tab repeated summaries; re-run vitest+e2e+axe; screenshots at 390px/768px/1450px.

## Risks

- Row hardest to keep honest: denied actions list could leak role-based logic labels inconsistently. Mitigation: pane A parses allowedActions() exactly as the action rail already does; no parallel fallback.
- Scope creep risk: pane B pre-check components keep their data sources; only order of sections may change.
- Anti-goal: this is not a "dock" or control panel redesign; no dispatch or cockpit composition language.

## Out of scope (defer on purpose)

- Single-case chart redesigns; evidence map; decision flows; clamp tests; Supabase/connected-mode behavioral changes; any new claim terminology beyond existing "Submit correction for review".

## Checkpoint 1 — done (2026-10-27)

- CaseWorkspace.tsx DOM reordered: .dossier-review-grid children are now [aside.dossier-action-rail (pane A), div.dossier-workbench (pane B: .dossier-tabbar + .dossier-review-main)]. Rail is first in DOM, so mobile stacks pane A on top with no CSS order tricks.
- Removals shipped: rail preamble (YOUR ACCESS label + roleName strong + duplicated read-only status paragraph) deleted; rail keeps its decision-receipt/record-integrity cards and a conditional Claim corrections remain available. note. Evidence-tab "Record summary" readiness aside deleted; its unique submission numbers moved into the Evidence index heading mono line ({documents} DOCUMENTS · x of y fields · n of m required documents).
- Plan item (b) confirmed already single-copy: the pre-click dependency note exists only in the policy tab (CaseWorkspace.tsx advisory section) and demo-lab-scope-note only in DemoLab.tsx — nothing removed.
- PrototypeDossier.tsx untouched (separate surface, prototype-dom.test.tsx coverage stands).
- CSS: .dossier-review-grid columns swapped to 250px minmax(0,1fr); .dossier-workbench{min-width:0;width:100%} (the width:100% is required because the base lign-items:start otherwise gives the wrapper content width and causes 644px horizontal overflow at 390px — caught by governance.spec.ts narrow-screen test).
- Unit: 	ests/case-renewal.test.tsx updated — the closed-case expired-document line-27 assertion (An expired document needs renewal.) targeted the removed rail duplicate; now asserts the unified header sentence plus 
ot.toContain('>YOUR ACCESS<'). 46/46 across the 8 dossier/UI suites green; full-suite OOM worker crashes on PGlite files are the pre-existing harness flake (5 reran individually, 31/31).
- Fail-first honored: rail role-absence and evidence-strip assertions failed pre-edit (demo.spec 439 line 453 "YOUR ACCESSNational administrator…"), pass post-edit; 
ext-step.spec.ts not-contains stop. Gates: tsc clean, build 32 chunks, e2e 105/105 (2026-10-27).

## Checkpoint 2 — done (2026-10-27)

- Evidence anchors added to pane A rail (`CaseWorkspace.tsx`, section `#dossier-evidence-anchors`):
  - Linked claims for the selected document (`selectedClaims`), each an anchor that switches to the review tab and focuses `#claim-<id>` in ClaimLedger (existing focus/raf pattern from `focusUnresolved`).
  - Missing required documents from `missingInputs()` (`src/domain/model.ts:137`), each an anchor that switches to the evidence tab and focuses `#doc-group-<slug>` (new stable ids on each `prototype-nav-group`).
  - Anchors carry names only (claim clause, document type) — they focus the right pane section instead of cloning content, per the plan.
- No backend, fetch, transition, or entitlement changes; `App.tsx` route handling (`#case/…`) untouched, so deep-link hashes keep working — existing route test `demo.spec.ts:251` passes unchanged.
- CSS: `.dossier-action-anchors` + `.dossier-anchor-card` in `src/styles.css`; dark-mode contrast override for the ink background; anchors rendered only when a document is selected or required documents are missing.
- A11y fixed during check: axe color-contrast on the dark card (`--ink` is light in dark theme) and strict-mode `.dossier-action-card` uniqueness (section uses its own class, not `.dossier-action-card`).
- Gates: tsc clean, build 32 chunks, demo.spec 39/39, full e2e 106/106, vitest batches green.

## Checkpoint 3 — pending

- Prune per-tab repeated summaries (each tab removes its twin summary row); history/trust integrity card stays pane-A-footer only.
- Re-run vitest + full e2e + axe; screenshots at 390px/768px/1450px.

