# Validation and evidence

**Status reviewed: 28 October 2026.** The latest inspected `main` revision is `a155635da4f5ae5c4ab60b17d6ea0ad1c33a3932` (27 October). This document separates **GitHub CI**, **recorded local integrations** and **deployment blockers**. It does not claim a production deployment or a full security certification.

## GitHub CI — 27 October baseline

[CI run 40566142578](https://github.com/Stakeylock/sih26-1/actions/runs/40566142578) for the above commit completed with a **failure**:

| Stage | Recorded result |
| --- | --- |
| Dependency installation and demo build | Passed |
| Vitest unit/SQL tests | **343 passed** across 46 test files |
| Root application dependency audit | Zero reported vulnerabilities |
| Playwright demo browser checks | **107 passed, 1 failed** |

The remaining browser failure was `e2e/governance.spec.ts` on the policy-changes banner: after navigating to policy notices, the alert stayed visible when the test expected it to be acknowledged. The proposed fix is reviewed in the repository-readiness PR; **a green rerun must be observed before claiming the issue is resolved**. CI checks only the scopes actually configured in `.github/workflows/ci.yml`.

## Recorded local integration — 25 October

The following are **stored test records**, not services being live at the time you read this:

| Check | Recorded outcome | Evidence |
| --- | --- | --- |
| Local Supabase, authenticated claims and workflow | Synthetic Auth/Storage/RPC checks completed | Local test record; raw output intentionally not committed |
| Private upload and real local ClamAV | Three clean fixtures accepted; antivirus-test and MIME mismatch rejected; quarantine read blocked | [Service results](reliability-integration-results.json) |
| Worker restart recovery | One pending in-app effect recovered after worker restart | [Service results](reliability-integration-results.json) |
| Local PostgreSQL workload | 10,000 synthetic applications, 100 virtual clients, ~523 operations/s, 273.07 ms p95 register read | [Scalability audit](scalability-audit.md), [raw results](scale-results.json) |
| Previous comprehensive local suite | 275 unit/SQL, 77 demo browser and two connected browser tests passed | [Reliability audit](scalability-audit.md) |

The workload used **PostgreSQL on a local machine**, a **25-connection pool**, and roughly **11 seconds** for the 100-client stage. It excludes HTTP, hosted authentication, storage-byte transfer and WAN. A successful local test does not establish sustained production concurrency.

The local worker scanned actual synthetic bytes with ClamAV, but **no remote production scanner service is configured or validated**. Local SMTP testing establishes transport acceptance by a test sink, **not external email delivery**.

## Release gates — not satisfied

- `docs/release-gates.json` currently records `deployAllowed: false`.
- The optional n8n runtime remains disabled after dependency-audit findings; do not enable it as part of a frontend release.
- Remote scanning, secret handling, host configuration, migrations, backups/restores, monitoring and access controls require staging validation.
- Formal accessibility testing, institutional policy/authority review and official integration permissions remain outstanding.
- The current Vercel `npm run build` creates a **demo frontend**, not a deployed authenticated backend.
- The GitHub repository is public; protected Vercel links may still require authorization before SIH evaluators can open them.

## Reproduce (only in a safe local environment)

```bash
npm ci
npm run build
npm test
npm run test:e2e
```

With an intentionally provisioned local Supabase/worker stack, use `npm run test:connected`, `npm run test:reliability:local` and `npm run test:scale:local`. Inspect `docs/reliability-operations.md` before starting workers.

`node scripts/release-check.mjs` writes `docs/release-gates.json` and currently **fails intentionally**. A failed release gate must never be interpreted as a successful deploy authorization.

## Historical records

Earlier 22–24 October partial integration runs, Docker-unavailable incidents and initial schema validation remain available in the repository's Git history. They must not override the newer 25 October local evidence or the 27 October CI outcome.

## 29 October 2026 — local reading and Due Work
Demo and connected builds passed. 389 unit/SQL tests and 112 browser tests passed. The built artifact passed actual PDF extraction and pretrained English image OCR under production CSP; mobile Due Work passed. Production dependency audit: zero findings. Connected service integration was not rerun; no remote migrations applied. See [document-reading.md](document-reading.md).


## 29 October 2026 — combined main and document-reading merge
Merged origin/main a72e78d with feature/local-document-reading cd0ff87. Demo and connected builds passed; 398 unit/SQL tests passed. Full browser run: 117 passed and one stale advisory-copy assertion failed. The revised advisory non-mutation test then passed, alongside six focused reader/live-feature checks. Actual PDF and OCR processing passed again with production CSP. No remote migrations or connected production integration were performed.

## 29 October 2026 — reason contract, current EVC dates and shared review reader

Built on `71ae43b82860d1ec75ceeb0614a519d4e78c7e94` after pulling current main. Both demo and connected builds passed. **404 unit/SQL tests in 59 files and all 121 demo browser tests passed**. The browser suite was rerun after the mobile file-picker and review-form layout repair. Actual PDF extraction and image OCR passed against the built demo with production CSP and same-origin workers/model assets; desktop and 390px document review were visually checked, with no page-level overflow or browser errors in that journey.

The new repository regressions verify top-level reason persistence in signal and audit, invalid/nested-only reason rejection without mutation, conflicting nested-reason replacement and rejection of a document from another case. Due Work regressions verify the actual reschedule/cancel commands, current date/version, matching explicit report deadlines and unrelated legacy fallback. Browser checks assert a real document finding and audit event after reload, advisory recording, current EVC dates after reload, source-switch cancellation, unrelated-file write blocking and mobile review layout.

No dependency or database-schema change was made. Connected services, hosted RLS/Storage, production scanning and remote migrations were not exercised in this slice; connected document-finding writes remain unavailable. These local results do not replace the separate release gates above or establish production readiness.

