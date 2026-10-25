# Clauseway local stack · 23 October 2026

**25 October 2026:** Docker has been recovered and the current local stack is running. The six new feature migrations and the preceding governance/correction changes have been applied locally. Fresh Auth/Storage/workflow, claim-remediation and recon-capability integration tests now pass. See [current implementation and validation](recon-implementation.md). Earlier Docker-unavailable notes below are historical.

**24 October update:** the correction-review slice adds a ninth migration and mandatory revision/request IDs to review RPCs. The browser demo remains available at port 5174 and the advisory at 8787. Docker is currently unavailable, so the new database migration and revised local HTTP claim test have not been exercised against the connected stack in this session. Once Docker runs, the existing launcher applies checked migrations to the isolated local database. See `ASTRA_REVIEW.md` and the latest section of `VALIDATION.md`; the older results below are historical.

Run `Start-FlowPilot.ps1` or `npm run local:start` with Docker Desktop running. The launcher verifies the local network, starts the isolated Supabase stack, applies migrations with checksums, provisions synthetic identities, and starts the frontends and advisory API.

| Service | Address |
|---|---|
| Browser demo | http://127.0.0.1:5174/ |
| Authenticated frontend | http://127.0.0.1:5173/#overview |
| Advisory API health | http://127.0.0.1:8787/api/automation/health |
| Local Supabase Auth / REST / private Storage | http://127.0.0.1:55321 |
| Local PostgreSQL | 127.0.0.1:55322 |

All published services are checked for loopback binding. The Docker project is `flowpilot-sih26-local`. Other Docker projects and the original hosted configuration are preserved. Local environment and runtime files are ignored by Git. The frontend receives only a publishable/anonymous key; service-role keys are never printed or bundled.

The connected frontend uses `.env.connected.local`. Synthetic account credentials are in the ignored `.env.integration.local` file on this computer. They are not included in documentation, screenshots, or source control. The browser demo remains usable without signing in and has an isolated role preview.

## Review fixes

- Evidence passports return duplicate references only for cases visible to the caller. Cross-case identifiers were removed from duplicate signal payloads.
- A deficiency transition rejects claim IDs belonging to another application.
- An open claim deficiency permits only its relevant replacement evidence. Unrelated uploads and form changes stay locked. Files remain quarantined until a trusted scan completion.
- Claim linking, resolution, verification, recheck, and decision gates enforce evidence category and current scan/expiry checks.
- System claims use a snapshotted deterministic demo rule: positive intake/faculty counts and a maximum ratio of 20. This is explicitly demo configuration, not an official regulatory threshold. The server stores evaluated inputs/results and invalidates verified results when their inputs change.
- Revoking or limiting the final effective administrator is blocked. Administration changes share a transaction lock.
- Unchecked helper functions are not executable by browser roles. The local backend includes all eight migrations, resolving the earlier schema mismatch without changing the hosted database.
- The connected browser test, affected-claim selector, scoped upload UI, and local launcher were updated for the current interface.

## Verification

- Both demo and connected TypeScript/Vite builds pass.
- 91 automated tests pass, including 11 added SQL regressions for the reviewed issues.
- 27 demo browser tests pass, covering responsive layouts, accessibility, claim review, audit replay, and replacement-upload permissions.
- The connected browser test also passes, verifying real local authentication, persistent draft editing, a scoped LangGraph advisory, and logout (28 browser tests total).
- 11 local integration checks cover real role-based Auth, private Storage, concurrent workflow acquisition, and retry-safe decisions/audit/obligations.
- 13 additional local HTTP integration checks cover all nine claims, seven fresh private uploads, deficiency resolution/recheck, real rule evaluation, a synthetic human decision, and an intact PostgreSQL audit chain.

The scan completions in integration tests use a known PNG fixture and explicitly record `known-png-fixture-not-antivirus`. They do not validate malware detection. Ordinary uploads remain quarantined; no browser action can mark them clean.

## Remaining release limits

n8n remains disabled because its separate dependency audit has blocking findings. No external LLM or messages are used by the local advisory. A production scanner, operational recovery validation, and domain sign-off remain required. This local run is for synthetic demonstration and testing; it does not establish production readiness. No public deployment was performed.

Docker Desktop can ignore a bridge network's default host binding. The setup verifies actual published bindings. When necessary, it retains the original task-owned containers as stopped backups while recreating them with explicit `127.0.0.1` bindings; volumes and the gateway's copied configuration are preserved. No unrelated container is modified.
