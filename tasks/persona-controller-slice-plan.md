# Persona-controller slice

Status: implemented on 2026-10-27 (no commits — the user commits). This slice makes the per-step "who holds this step, what they may do, human oversight required" explicit as a presentation surface. It is the deferred per-step persona controller noted in `tasks/dossier-two-pane-plan.md` (out of scope there, now done as its own slice).

## What it does

- New component `src/ui/PersonaController.tsx`, rendered in the dossier rail (`src/ui/CaseWorkspace.tsx`) as a section of its own (class `.persona-controller`, NOT `.dossier-action-card` — the e2e spec at `e2e/demo.spec.ts:469` asserts `.dossier-action-card` does not contain 'National administrator').
- For a non-closed step it names the holder (`caseNextStep.owner`, falling back to `nextAuthority(app.status)`), renders the single permitted action (`actionLabels[actions[0]]`) as text — never a cloned button — and, when the viewer holds no action, states that honestly with the holder named.
- For statutory steps (`decision`, and `obligation` when the holder is the 'Authorised reviewer') it adds the human-oversight disclosure adopted from Pravah's StepUpModal wording, computed only (no fabricated identities, no fabricated outcomes): "Statutory decisions can never be taken by automated system actors. A human <holder> must record this decision."
- Closed steps render nothing (movement-contract already covers the closed state).

## What it deliberately does NOT do

- No new fetch, transition, or status entitlement — `allowedActions` and `nextStep` are read from exactly as before; the component only presents computed state.
- No denied-action enumeration (that would require a parallel status→action mapping and risks inconsistent role logic); the honest "your role holds no action at this gate" line covers the empty case.
- No new dependencies — the unit test renders with `react-dom/server` renderToString in happy-dom.
- No rewrite of the movement-contract wording (dossier-plan rule: stage gate / correction state split stays as-is).

## Gates after implementation

- `npx tsc --noEmit -p tsconfig.json` clean.
- `npm run build` 32 chunks.
- Full e2e 106/106 (the one `judge-audit-fixes.spec.ts` failure seen in a full run is a pre-existing browser-teardown flake; the spec passes 9/9 in isolation).
- `tests/persona-controller.test.tsx` 5/5 (new); `tests/next-step.test.ts`, `tests/claims.test.ts`, `tests/correction-review.test.ts` pass.

## Test notes

- The persona-controller is presentational only, so there is no pre-existing build to fail-first against; its behavior is pinned by `tests/persona-controller.test.tsx` instead.
- Existing e2e assertions (`Next authority:`, `Viewing as`, `.dossier-action-card` not containing 'National administrator', 'Current authority' count 0) all still pass unchanged.
