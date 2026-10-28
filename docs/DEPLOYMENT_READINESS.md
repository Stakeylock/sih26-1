# Deployment readiness — hold for approval

**Decision as of 28 October 2026: NOT READY FOR A CONNECTED PRODUCTION RELEASE. DO NOT DEPLOY.**

This file is a preparation checklist, not authorization to deploy, promote, assign domains, change Vercel project settings, apply remote migrations or expose real evidence.

## Verified project context (read-only)

- Source repository: `Stakeylock/sih26-1` (private), default branch `main`.
- Existing Vercel team: `local-team`; existing project: `clauseway-sih26262`.
- Vercel showed two earlier deployments with `READY` build state. **No new deployment was created** during this preparation.
- The Vercel connector did **not** report an active Git repository linkage to `Stakeylock/sih26-1`; confirm team/project/branch mapping before wiring Git automation.
- The current `vercel.json` runs `npm run build` and outputs `dist`, which is the **isolated synthetic demo**. It does not host the connected backend or local workers.
- Some deployment URLs may require Vercel SSO; verify intended judge access rather than assuming an external URL is public.

## Phase A — demonstrator (not production authority)

- [ ] Obtain explicit approval for the exact project, commit, target (preview vs production) and domain.
- [ ] Require a green build, unit/SQL suite and complete browser suite for the candidate commit.
- [ ] Confirm every visual/case used is synthetic; no live institution, personal or regulatory records.
- [ ] Review `vercel.json` content-security policy and frontend assets for the selected environment.
- [ ] Keep the build in **demo mode**; do not inject production Supabase or service-role secrets.
- [ ] Confirm correct access controls, SIH evaluator access and a working fallback video if the repository or deployment is protected.
- [ ] Test keyboard interaction, mobile layout, route refresh, policy notice acknowledgement and audit replay.
- [ ] Record a rollback candidate before promoting any production domain.
- [ ] Release only after an explicit separate authorization.

## Phase B — connected service (additional requirements)

- [ ] Agree on official use, permitted workflows, policy source/version, decision authority and audit retention with the actual organization.
- [ ] Decide on a safe hosting topology for **Supabase Auth/PostgreSQL/private Storage**, a server-side advisory service, and a **durable worker/ClamAV service**. A static Vercel SPA alone cannot provide these services.
- [ ] Select staging and production databases, DNS/HTTPS, session scope, encryption, secrets management, private bucket rules, service monitoring and resource limits.
- [ ] Review and apply migrations only to an authorized staging database; rehearse backup/restore and rollback. Never auto-run local bootstrap against production.
- [ ] Set connected frontend configuration only with an approved HTTPS URL and **publishable** key; service-role keys stay server-only. Update CSP and any required API proxy/rewrite paths for the approved topology.
- [ ] Validate production-grade scanning, fresh signature updates, MIME/size/hash checks, quarantine recovery, worker restarts, bounded retries and delivery history end to end.
- [ ] Establish notification providers and distinguish queued/in-app/transport-accepted/delivered states.
- [ ] Complete multitenant/RLS and adversarial authorization review, rate limits, observability, incident response and accessibility review.
- [ ] Perform sustained HTTP+Auth+Storage workload tests; the local 10k-case database numbers are **not** a production SLO.
- [ ] Resolve or continue excluding the vulnerable optional n8n runtime; never enable it implicitly.
- [ ] Require regulatory and security sign-off before using real institutional documents or decisions.

## Current blockers

1. [Release gate](release-gates.json) reports `deployAllowed: false`.
2. Latest inspected `main` CI had **one failed browser test** (policy-changes acknowledgment), though build and 343 unit/SQL tests passed. Require green CI on the candidate revision.
3. No production scanner deployment, recovery drill, formal accessibility review or regulatory authorization has been validated.
4. No approved connected backend/worker topology, Git integration strategy or judge-access plan has been established.

**Next permitted step:** review the documentation/CI preparation branch and decide whether to merge it. **Not permitted by this request:** Vercel deployment, promotion, domain edits, production environment changes or database migrations.

References: [current validation](VALIDATION.md), [local operations](reliability-operations.md), [architecture](architecture-diagram-source.md), [CI workflow](../.github/workflows/ci.yml).
