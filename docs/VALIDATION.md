# Validation record · 22 October 2026

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
