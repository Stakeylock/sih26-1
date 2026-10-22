# FlowPilot SIH26262 · local continuation

A locally editable React/TypeScript application continuing the existing Lovable database and Figma design. All accounts, evidence and decisions in this workspace are synthetic. This is not an AICTE service and is not approved for real regulatory work.

## Open the app

- Isolated browser demo: http://127.0.0.1:5174
- Authenticated Supabase demo: http://127.0.0.1:5173
- Run `Start-FlowPilot.ps1` to restart the local app and advisory service. Install application dependencies first with `npm ci` if needed.
- The connected app requires explicitly provisioned accounts. Integration accounts have randomly generated passwords in the ignored `.env.integration.local` file. No credentials are included in this README, source archive, or reports. The connected UI has no role selector.
- In the isolated demo, use **Preview as** to explore the five roles. **Ctrl/Cmd+K** opens workspace search. Its seed documents are synthetic references without downloadable bytes; newly selected files add metadata only.

## Architecture

React 19 + TypeScript + Vite; self-hosted Inter and Lucide icons; Supabase Auth/PostgreSQL/Storage. Database functions validate live sessions, role and region, application state, optimistic version, required evidence, and idempotency keys. Writes and append-only audit events commit together. Client roles never authorize mutations.

`src/domain` contains types and display helpers. `src/data` contains separate connected and isolated-demo adapters. `src/ui` contains application views. `supabase/reference/lovable-baseline.sql` preserves the original two Lovable migrations. The two dated hardening migrations have been applied to the exact Lovable demo database, project `mbgwfamvrjulbebwsnoh`. The separately connected, unrelated Supabase project was not modified.

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

The database tests run real PostgreSQL semantics using PGlite because Docker Desktop failed to start on this computer. Docker settings and data were left intact. This verifies SQL/RLS behavior, not a full containerized Supabase installation. Hosted API tests independently cover real Auth, RLS, storage, concurrent transitions, and persistence.

Read `docs/VALIDATION.md` and the JSON evidence files. The release gate intentionally fails. The previous Vercel deployment has not been replaced. No production readiness claim is made.

## Maintain safely

- Preserve the original Lovable history. This project was reconstructed locally from its schema and design references; it is not a clone of a discovered canonical GitHub repository.
- Keep private files named `.env*`, SQLite files, runtime state, and credentials out of Git and packages. Only publishable client configuration may enter the browser.
- Bootstrap administrators through trusted database administration. New signups always receive institution privileges, regardless of supplied metadata. Staff regions must be explicit; only national administrators have global scope.
- Published workflows are read-only in this UI. Create reviewed new workflow versions through migrations; in-flight cases retain their snapshots.
- RLS controls access to records. UI queries currently cap lists at 200 cases / 500 audit events; large installations need cursor pagination and reporting queries.
- Hardened Vercel headers are included, but the advisory service and persistent outbox need a separately validated deployment topology. The included SQLite service is for local Work mode.
- Drive is the engineering documentation vault, not the transactional database or evidence bucket.

## Design references

The original Figma frames define the navy sidebar, teal actions, warm-white canvas, Inter typography, overview, case workspace and application wizard. Awwwards' Attio entry informed quick navigation and the structured register; its mobile guidelines informed visible actions and responsive behavior. Keyboard search, focus rings, clear validation and reduced-motion support are implemented in FlowPilot's own components.

The user-supplied `per-simmons/clone-app-pat-pro-public` repository is a reconstruction skill, not an app. Its computed-style comparison script was used against FlowPilot's measured tokens: 8 assertions passed. We adapted that method to the existing app rather than claiming a pixel-for-pixel clone of an Awwwards site. Figma's static design contained no image/SVG assets requiring export.

- Figma: https://www.figma.com/design/0YuF68RLR5zwXZm9RzvR5q
- Awwwards Attio: https://www.awwwards.com/sites/attio
- Awwwards mobile guidance: https://www.awwwards.com/mobile-excellence-guidelines.pdf
- Visual QA reference: https://github.com/per-simmons/clone-app-pat-pro-public

No proprietary Awwwards/Attio code, logos, or marketing assets were copied.
