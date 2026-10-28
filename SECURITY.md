# Security and scope

Clauseway is a **synthetic demonstration**, not a deployed AICTE approval system. It is not authorized for real institutional evidence, regulatory decisions or confidential personal records.

## Security boundaries

- The browser demo uses synthetic in-memory records. Its role preview and audit replay are demonstrations, **not an authenticated security boundary**.
- Connected mode relies on Supabase Auth, PostgreSQL row-level security and database-side commands that recheck identity, scope, state and version.
- The evidence bucket is private. Uploaded bytes remain quarantined until a trusted worker records a definitive clean scan. Local ClamAV testing does **not** establish a production malware-scanning service.
- Audit chains detect mismatched records **within their trust assumptions**; a privileged database administrator is inside that trust boundary. Do not call the audit system tamper-proof.
- Advisory outputs are read-only and cannot grant statutory authority. The optional n8n runtime is disabled pending its separate security review.
- Treat the service-role key, SMTP credentials, worker tokens, local identities, fixtures and all operational logs as sensitive. Never put server credentials in `VITE_*` variables.

## Reporting a vulnerability

Contact repository maintainers privately through GitHub or an enabled private vulnerability-reporting channel. **Do not** publish a working exploit, sensitive record, token or database access instructions in a public issue. No public security-contact email is supplied by this repository.

Include the affected code path, expected/observed behavior, a minimal synthetic reproduction and the tested revision. Do not test against third-party AICTE systems, real institutions or production accounts without written authorization.

See [deployment readiness](docs/DEPLOYMENT_READINESS.md) for release prerequisites and [current validation](docs/VALIDATION.md) for dated, limited evidence.
