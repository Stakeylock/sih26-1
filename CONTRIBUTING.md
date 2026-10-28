# Contributing to Clauseway

Clauseway is a synthetic Smart India Hackathon prototype. Changes must preserve its explicit distinction between **isolated demo behavior** and **authenticated connected behavior**.

## Development

1. Create a descriptive feature/fix branch from `main`; open a PR instead of directly changing the deployment branch.
2. Install dependencies with `npm ci` using Node.js 22.
3. Start the lightweight synthetic UI with `npm run dev`; use [the local run guide](docs/LOCAL_RUN.md) for the full stack.
4. Before review, run `npm run build`, `npm test` and `npm run test:e2e`. Connected changes also need the relevant local Supabase/worker integration tests.
5. Document what was tested, the revision, and which scenarios remain unverified. A successful unit test does not prove production readiness.

## Review expectations

- Keep statutory decisions with authorized humans; never fabricate officials, approvals, legal rules, AICTE integrations or measured outcomes.
- Enforce connected-mode permissions in database/RPC boundaries, not only by hiding UI controls.
- Preserve case snapshots, review provenance, idempotency keys and append-only audit behavior when modifying workflows.
- Treat private document uploads as quarantined until a trusted server-side scan completes.
- Use synthetic data only for screenshots, examples, generated PDFs and test accounts.
- Keep credentials, `.env*.local`, `.runtime/`, logs, SQLite files, local Supabase state and browser traces out of version control.
- Do not enable the optional n8n runtime without resolving its separately documented dependency findings.
- For regulatory claims, distinguish **configured demo policy** from verified official policy and cite the applicable source.

## PR checklist

- [ ] Summary of changes and rationale
- [ ] Tests run and evidence (or explicit reason if unavailable)
- [ ] Demo and connected modes remain separate
- [ ] Security/role/evidence boundaries checked if relevant
- [ ] Documentation and screenshots updated where behavior changed
- [ ] No secrets, personal records or production access introduced
- [ ] No deployment or database migration performed as part of a review-only task

See [validation](docs/VALIDATION.md), [deployment readiness](docs/DEPLOYMENT_READINESS.md), [security](SECURITY.md) and the existing engineering conventions in `AGENTS.md`.
