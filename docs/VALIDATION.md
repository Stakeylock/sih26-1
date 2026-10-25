# Validation record

**25 October 2026:** Docker has been recovered and the current local stack is running. The six new feature migrations and the preceding governance/correction changes have been applied locally. Fresh Auth/Storage/workflow, claim-remediation and review-capability integration tests now pass. See [current implementation and validation](implementation notes). Earlier Docker-unavailable notes below are historical.

Correction-review slice, **24 October 2026**: both demo and connected builds pass; 151 automated unit/SQL/domain tests and 31 demo browser checks, including the merged dark-mode history and policy views cover the revised source. The main application dependency audit previously reported zero findings and no dependencies were added in this slice. The ninth migration records review bases and immutable snapshots; its SQL is exercised in PGlite with explicit authenticated roles. Read [review notes](review notes) for the exact scope and remaining boundary.

The latest upstream top navigation, dark mode and specimen previews were pulled at `f63a8fe` before reapplying this slice. The Docker engine is unavailable in this session. The ninth migration has **not** been applied to the previously provisioned local PostgreSQL stack or any hosted project. New real Auth/REST/Storage and concurrent-session checks remain unverified. Earlier connected results below are historical. The isolated demo and deterministic advisory can run independently; n8n remains disabled.

Latest local run: **23 October 2026**. See [LOCAL_RUN.md](LOCAL_RUN.md) for the corrected stack and reproducible commands. Both builds, 91 unit/security tests, 28 browser tests, 11 core local integration checks, and 13 claim-remediation checks passed. All eight migrations are applied to the isolated local Supabase database. The review fixes are local changes; no hosted database or public deployment was modified. n8n and unvalidated production malware scanning remain release limits.

The record below is retained as historical evidence from 22 October 2026 and does not describe the current local stack.

Environment: local Work mode, connected only to the exact Clauseway Baseline demo database. Synthetic identities and fixtures only.

| Check | Evidence / result |
|---|---|
| TypeScript and optimized connected build | Passed |
| PostgreSQL/RLS and automation unit tests | 26 passed |
| Demo browser flows and mobile accessibility | 5 passed, including keyboard command search and reduced motion |
| Measured style assertions | 8/8 passed using the supplied repository's comparator |
| Hosted Supabase integration | 11 passed; 8 real synthetic accounts, private upload/download, tenant/region denials, concurrency, audited transitions and retry-safe decisions |
| Actual LangGraph → n8n → callback smoke | 8 passed; no external messages or LLM calls |
| Connected browser flow | 1 passed: real login, draft creation/editing, persistence after reload, scoped advisory, logout |
| Application production dependency audit | No vulnerabilities reported |
| Separate n8n dependency audit | 12 critical, 43 high, 94 moderate, 3 low; runtime stopped and webhook disconnected |
| Production malware scanning | Not validated; fixtures used a clearly labelled trusted test completion |
| Full local Supabase container stack | Unavailable: Docker Desktop startup error |
| Public deployment | Withheld; existing Vercel demo retained |

The hosted test revealed implicit write grants from the managed database's defaults. A second migration now explicitly revokes direct table/sequence writes in addition to RLS. The rerun passed.

The automated accessibility check covers serious/critical axe findings in the tested mobile register. It is not a WCAG certification. A formal keyboard/screen-reader audit, all screen states, backups and restore, operational monitoring, scanner integration, signed-link expiry tests, and domain approval remain required before a production release.

The n8n integration is implemented and was exercised locally, but it is deliberately disabled because its upstream runtime dependency tree did not pass the security gate. The main application and LangGraph advisory remain separate from those dependencies.

The connected browser flow passed against the hosted Supabase demo with the local advisory service. n8n was then left disabled; connected advisories remain available independently.

## 2026-10-25 reliability implementation

Demo/connected builds passed. The unit/SQL suite passed 271 tests; demo E2E passed 77 and connected E2E passed two. The actual local Supabase/ClamAV integration passed quarantine, file hash, antivirus test, MIME mismatch, isolation and worker-restart checks. Local database advisors reported no warning/error findings, and the application dependency audit reported zero vulnerabilities. The sustained disposable Postgres workload and its limitations are recorded in `scale-results.json`; service results are in `reliability-integration-results.json`. See `reliability-operations.md` for reproduction and deployment configuration.
