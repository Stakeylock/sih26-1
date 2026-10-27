# Clauseway SIH26262 · local continuation

A locally editable React/TypeScript application continuing the existing Baseline database and design-tool design. All accounts, evidence and decisions in this workspace are synthetic. This is not an Institutional Review service and is not approved for real regulatory work.

## Run the whole demo

One-time setup (requires Docker Desktop and the Supabase CLI), then start everything:

```text
npm run local:setup   # once: provisions and migrates the local Supabase stack
npm run local:start   # starts the stack, the advisory service and both frontends
```

This brings up Supabase (http://127.0.0.1:55321), the local advisory service on 127.0.0.1:8787, the connected workspace on 5173 and the isolated demo on 5174.

Workload requirement: connected mode requires the advisory service; the demo on 5174 works standalone, but the document pre-check needs that same service.

## 25 October implementation

The app now includes source-pinned scenarios, actual-history exploration, optional 3D evidence navigation, expert reservations, reviewed workflow publication/adoption, independent recommendations and delivery attempt history. [Implementation inventory and validation](docs/implementation notes) · [Judges’ walkthrough](docs/demo walkthrough). The local Auth/Storage/REST stack and authenticated LangGraph service have been exercised with fresh synthetic fixtures. The nested n8n runtime remains disabled because of its critical dependency findings.

## Open the app

- Isolated browser demo: http://127.0.0.1:5174
- Authenticated local workspace: http://127.0.0.1:5173/#overview
- Local advisory backend: http://127.0.0.1:8787/api/automation/health
- Local Supabase Auth, Data API, and private Storage: http://127.0.0.1:55321
- With Docker Desktop running, run `npm run local:start` or `npm run local:start`. The launcher starts an isolated Clauseway stack, applies checked migrations, provisions synthetic accounts, and starts both frontends and the API. Install dependencies first with `npm ci` if needed.
- The connected app now uses the ignored `.env.connected.local`, generated from the local stack. The existing hosted `.env.local` is preserved and is not used by this local connected mode.
- The connected app requires explicitly provisioned accounts. Integration accounts have randomly generated passwords in the ignored `.env.integration.local` file. No credentials are included in this README, source archive, or reports. The connected UI has no role selector.
- In the isolated demo, use **Preview as** to explore the five roles. **Ctrl/Cmd+K** opens workspace search. Its seed documents are watermarked synthetic samples served from `public/samples/` (nothing personal or official); newly selected files add metadata only.

## Architecture

React 19 + TypeScript + Vite; self-hosted Inter and Lucide icons; Supabase Auth/PostgreSQL/Storage. Database functions validate live sessions, role and region, application state, optimistic version, required evidence, and idempotency keys. Writes and append-only audit events commit together. Client roles never authorize mutations.

`src/domain` contains types and display helpers. `src/data` contains separate connected and isolated-demo adapters. `src/ui` contains application views. `supabase/reference/baseline.sql` preserves the original Baseline migrations. Eight migrations were previously applied to the isolated local PostgreSQL database. The ninth correction-review migration is staged and SQL-tested; Docker is currently unavailable, so its connected verification remains pending. Migration checksums protect the local bootstrap path. See `docs/LOCAL_RUN.md` and `docs/review notes` for current scope and checks.

### n8n and LangGraph

The actual LangGraph JavaScript graph validates and minimizes case metadata, checks evidence completeness, and prepares an advisory summary. It uses deterministic rules with **no external model** and cannot change workflow state or release files. Connected requests validate the Supabase user and read the case under that user's RLS.

The automation service at port 8787 stores a durable SQLite outbox. The checked-in n8n workflows receive authenticated, minimal demo events, acknowledge follow-up tasks idempotently, and poll due tasks every 15 minutes. No email or external message is sent. n8n has no Supabase service-role credential or approval RPC access. Its authenticated webhook and callback were tested against a real local n8n instance.

**n8n was stopped and disconnected after its audit reported high and critical dependency findings.** Its runtime is kept separate under `automation/n8n`, out of the application bundle. Resolve and retest those findings in an isolated supported runtime before enabling it. Do not run `npm audit fix --force` or accept the suggested downgrade blindly. The LangGraph advisory remains usable without n8n.

### Evidence handling

The evidence bucket is private. Uploads require an existing reservation for an editable owned case. Objects cannot be overwritten or deleted by browser clients. Documents remain quarantined until a trusted scanner confirms uploaded-byte metadata and supplies a hash and engine provenance. Pending/rejected files cannot be read or used to submit a case.

Only a trusted server scanner may call `fp_complete_document`. A production malware-scanning provider is not configured. Integration tests used known synthetic PNG fixtures and explicitly label that provenance; this does **not** validate malware detection. Signed-link expiration and a real antivirus provider remain release gates. Browser downloads use the authenticated storage API and do not persist public URLs.

## Validate

```text
npm run build
npm test
npm run test:e2e
node node_modules/@playwright/test/cli.js test --config playwright.connected.config.ts
node scripts/release-check.mjs
```

The fast SQL security suite uses PGlite. A full local Supabase Docker stack now independently verifies Auth, PostgreSQL, RLS, private Storage, concurrency, and claim remediation through real HTTP APIs. Local published ports are checked for loopback binding. The launcher only operates on containers labelled for `clauseway-sih26-local`; other projects are left alone.

Read `docs/VALIDATION.md` and the JSON evidence files. The release gate intentionally fails. The previous Vercel deployment has not been replaced. No production readiness claim is made.

## Maintain safely

- Preserve the original Baseline history. This project was reconstructed locally from its schema and design references; it is not a clone of a discovered canonical GitHub repository.
- Keep private files named `.env*`, SQLite files, runtime state, and credentials out of Git and packages. Only publishable client configuration may enter the browser.
- Bootstrap administrators through trusted database administration. New signups always receive institution privileges, regardless of supplied metadata. Staff regions must be explicit; only national administrators have global scope.
- Published workflows are read-only in this UI. Create reviewed new workflow versions through migrations; in-flight cases retain their snapshots.
- RLS controls access to records. UI queries currently cap lists at 200 cases / 500 audit events; large installations need cursor pagination and reporting queries.
- Hardened Vercel headers are included, but the advisory service and persistent outbox need a separately validated deployment topology. The included SQLite service is for local Work mode.
- Drive is the engineering documentation vault, not the transactional database or evidence bucket.

## Design references

The original design-tool frames define the navy sidebar, teal actions, warm-white canvas, Inter typography, overview, case workspace and application wizard. external' reference entry informed quick navigation and the structured register; its mobile guidelines informed visible actions and responsive behavior. Keyboard search, focus rings, clear validation and reduced-motion support are implemented in Clauseway's own components.

The user-supplied `example/reference` repository is a reconstruction skill, not an app. Its computed-style comparison script was used against Clauseway's measured tokens: 8 assertions passed. We adapted that method to the existing app rather than claiming a pixel-for-pixel clone of an external site. design-tool's static design contained no image/SVG assets requiring export.

- design-tool: https://www.example.invalid/design/0YuF68RLR5zwXZm9RzvR5q
- external reference: https://www.example.invalid/sites/reference
- external mobile guidance: https://www.example.invalid/mobile-excellence-guidelines.pdf
- Visual QA reference: https://github.com/example/reference

No proprietary external/reference code, logos, or marketing assets were copied.

## Reliability services and measurements

The connected register uses server-filtered cursor pages and fetches case details independently. The local worker service runs deadline reminders, durable in-app delivery and actual ClamAV document scanning. Start it with `npm run workers:start`; inspect it with `npm run workers:health`. The local launcher also starts these services.

See [reliability operations](docs/reliability-operations.md) and the updated [scalability audit](docs/scalability-audit.md). Reproduce service-boundary validation with `npm run test:reliability:local` and the disposable 10,000-case database workload with `npm run test:scale:local`. Remote deployment requires its own host configuration and validation.
