# FlowPilot demo strengthening plan

## Goal

Make the reproducible demo compelling for SIH26262: an explainable, human-in-the-loop approval operations system that reduces deadline risk without bypassing authority or auditability. The official SIH portal currently lists the idea-submission deadline as October 28, 2026; re-check the portal before final submission because dates can change.

## Constraints

- Demo mode must work with synthetic localStorage data and no Supabase credentials.
- Connected mode and server-side authorization remain separate and authoritative.
- Never claim AICTE approval, regulatory readiness, or production malware scanning.
- Do not enable the disabled n8n runtime until its dependency audit is resolved.
- Every demo differentiator needs a repeatable browser or unit test.

## Completed in this session

- Default `dev` and `build` select Vite demo mode.
- The build fails if the demo adapter is missing from the emitted bundle.
- Portable CI gates cover build, tests, root dependency audit, and demo E2E.
- Overview has a role-aware, explainable priority queue with a direct case-opening action.

## Parallel work slices

### Slice A — Evidence readiness cockpit

Owner: UI assistant.

Add a compact readiness summary to `src/ui/CaseWorkspace.tsx` using the existing `missingInputs` result: fields complete, clean evidence complete, and the exact blocker. Keep it read-only and demo-safe. Add an E2E assertion for the blocked-submit state. Avoid changing `src/domain/model.ts` or adapters.

### Slice B — Role-specific demo storyline

Owner: demo/E2E assistant.

Add one deterministic browser scenario that walks institution → scrutiny → regional decision → compliance/audit, using existing `Preview as` controls and synthetic data. Do not add external services or credentials. Touch only `e2e/` unless a small test fixture is required.

### Slice C — Explainable advisory presentation

Owner: advisory/UI assistant.

Improve the existing advisory panel so each warning is grouped as data quality, evidence, or workflow risk, and show the trace as human-readable steps. Keep the advisory read-only and do not change the automation contract. Add unit coverage for the formatter if a pure helper is introduced.

### Slice D — Demo release hygiene

Owner: CI assistant.

Add a lightweight README section describing the exact reproducible demo checks and the deliberate gaps: no connected credentials, no malware scanner, n8n disabled. Do not add deployment secrets, Vercel rewrites, or hosted integration claims.

## Integration order

1. Merge Slice A after build, unit, and E2E checks.
2. Merge Slice B after the user flow is stable.
3. Merge Slice C after the advisory payload contract is unchanged.
4. Merge Slice D last so the README reflects the final demo surface.

## Final demo narrative

1. Start at the role-aware priority queue and open the overdue case.
2. Show the case’s pinned workflow, evidence readiness, and server-enforced next action.
3. Switch to scrutiny, verify a checklist item, and return a case for deficiency.
4. Switch to the institution, fix the evidence, and resubmit.
5. Switch to a decision role, record a reasoned outcome, then show the resulting compliance obligation and audit trace.
