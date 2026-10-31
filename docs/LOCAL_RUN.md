# Run Clauseway locally

**Two mutually exclusive frontends:** the **isolated browser demo** has synthetic, in-memory state and preview personas; the **connected workspace** signs in with local Supabase accounts and enforces permissions in PostgreSQL. Neither is an official AICTE service.

## Prerequisites

- Node.js **22** and npm (the repository's GitHub CI uses Node 22).
- For the full local stack: Docker Desktop with Linux containers and the project's Supabase CLI dependency.
- Local TCP ports for the development services must be available.
- Use only synthetic records and loopback endpoints. Do not use production credentials.

## Option A — UI demo, no Docker

```bash
npm ci
npm run dev
```

Visit the loopback URL printed by Vite (typically `http://127.0.0.1:5173`). You can preview different roles without real sign-in. Sample PDFs are generated fixtures. This mode does **not** validate server authorization or production scanning. Document pre-check/advisory requires the separate service.

## Option B — full local connected stack

```bash
npm ci
npm run local:setup  # run once per isolated local provisioning
npm run local:start
```

On Windows, run the same npm scripts from PowerShell. The local setup handles verified migrations and provisions synthetic identities.

| Endpoint | Loopback address |
| --- | --- |
| Authenticated connected UI | `http://127.0.0.1:5173/#overview` |
| Isolated demo UI | `http://127.0.0.1:5174/` |
| Supabase Auth / REST / private Storage | `http://127.0.0.1:55321` |
| PostgreSQL | `127.0.0.1:55322` |
| Advisory health | `http://127.0.0.1:8787/api/automation/health` |
| Worker health | `http://127.0.0.1:8791/health` |

The connected workspace uses `.env.connected.local` and integration identities from ignored local files. Keep all service-role credentials out of browser variables, reports and Git. `VITE_SUPABASE_PUBLISHABLE_KEY` is for public browser configuration only, not a service-role secret.

## Useful checks

```bash
npm run build
npm run build:connected
npm test
npm run test:e2e
npm run test:connected
npm run workers:health
```

The following need the local service stack and a deliberate isolated test environment:

```bash
npm run test:reliability:local
npm run test:scale:local
```

The scale harness creates and destroys its **own uniquely named disposable PostgreSQL database**, seeds synthetic cases and records results. It is not a hosted-service benchmark. See [reliability operations](reliability-operations.md) for worker controls and scanner behavior.

## Safety and troubleshooting

- If the local stack cannot start, inspect Docker Desktop and the port bindings; do **not** reset unrelated Docker volumes/projects.
- If connected login fails, confirm the local stack is provisioned and the connected UI uses the generated ignored environment configuration. The demo does not use that login.
- Uploaded files remain quarantined until the trusted worker completes scanning; no browser action may mark them clean.
- If `npm run workers:health` fails, inspect the local worker and ClamAV service. Do not bypass quarantine to make a test pass.
- LangGraph advisory is deterministic and read-only. **n8n remains disabled** until its separate dependency findings are addressed.
- The release-check script is deliberately blocking; do not bypass it for a real deployment.

For dated test evidence, use [Validation](VALIDATION.md), not older setup notes that may describe temporary Docker failures.
