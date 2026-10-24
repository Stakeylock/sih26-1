# Implementation and verification — 25 October 2026

The local app now combines evidence review with reproducible scenario planning, an optional 3D dependency map, resource reservations, reviewed workflow publication and operational delivery tracking. All records and outcomes used for validation are synthetic.

## Open locally

| Service | Address |
|---|---|
| Browser demo / analysis | http://127.0.0.1:5174/#analysis |
| Authenticated workspace | http://127.0.0.1:5173/#overview |
| Advisory health | http://127.0.0.1:8787/api/automation/health |
| Local Auth, REST and private Storage | http://127.0.0.1:55321 |

`npm run local:start` starts the isolated local stack and verifies loopback bindings. The connected interface signs in with provisioned accounts and has no role selector. The browser demo has an explicitly labelled role preview. Test credentials and worker credentials remain in ignored local environment files; neither belongs in a report or a browser bundle.

## Feature inventory

| Capability from the reports | Implemented behavior | Verification |
|---|---|---|
| Multi-role access | Verified sessions and live, expiring role/region grants; owner and staff boundaries; no client-authorized mutations | Real local Auth plus SQL permission tests |
| Evidence correction loop | Private quarantine, category-bound links, validity review, deficiency response, recheck and current review bases | Real uploads and fresh replacement evidence |
| Course and approval scope | Requested/previous/approved capacity, explicit coverage period and human continuing conditions | Existing scope tests, SQL and browser journeys |
| Versioned workflow policies | Copy published route to draft; validate authorities, sequence, unique fields/checks and target bounds; review supplied source; publish immutable revision | SQL and real REST lifecycle tests |
| Explicit adoption | Publishing preserves existing case snapshots; draft adoption supports structure changes; active cases permit compatible calendar/target changes; closed cases retain their version | Real pinned-case comparison and browser adoption |
| Calendars | Versioned IST calendar; calendar days or weekdays with explicit holiday dates; server-derived targets | Deterministic domain and actual PostgreSQL checks |
| Deadline source review | Source notices, reviewed impact preview, explicit adoption, preserved revisions and reminder generations | Existing notice tests and browser story |
| Reproducible what-if analysis | Immutable authorized facts, source/checkpoint hash, pinned engine and explicit parameters; baseline/delta targets and explainable attention factors | Domain, SQL and real API save/read isolation |
| Scenario separation | Hypothetical acceptances/missing claims, workload and delay inputs cannot change the live workflow | Version/history invariance and stale-save tests |
| Actual history explorer | Reads real recorded event snapshots; separates current, partial historical and hypothetical facts | Snapshot and browser checks |
| Evidence map | Actual case → claims → evidence/corrections/conditions/visits/independent reviews; same facts in accessible table and optional 3D | Actual WebGL rendering, selection and no-WebGL fallback |
| Source-grounded guide | Explains recorded blockers, cites case records, searches case facts and exports a draft correction checklist | Domain and browser checks; no invented model responses |
| Inspection capacity | Expert directory, declared affiliations/conflicts, availability, ordered locks and overlapping-reservation rejection | Real concurrent requests produce exactly one booking winner |
| Inspection lifecycle | Physical/online/hybrid, revisioned reschedule, confirmation, cancellation, coordinator reassignment API and findings after the confirmed window | SQL lifecycle and actual REST findings tests |
| Independent recommendations | Assign a different scoped reviewer, bind to current evidence, require completion before decision, record evidence and disposition; stale reviews block progression | Real required-review gate and SQL staleness tests |
| Work allocation | Manager assigns a live regional scrutiny grant; previous officer cannot acquire or mutate the allocated case | SQL and browser allocation story |
| Delivery lifecycle | Source-bound generations, private worker leases, bounded retries, immutable attempt history, stale-source invalidation and ambiguous-outcome reconciliation | SQL plus actual local SMTP sink and real worker RPCs |
| Honest delivery states | Queued, in-app committed, SMTP accepted, retrying, exhausted, superseded and ambiguous are separate | Real transport acceptance; no external email |
| Operational readiness | Current database/private-bucket configuration and worker activity checks; unverified release gates shown explicitly | SQL and UI checks |
| Operational exports | Six scoped CSV registers plus scenario timeline CSV and checksummed evidence JSON; no private object paths | CSV injection tests, source checksums and live API inspection |
| Reading controls | Device-local text sizing, higher contrast and regional date/time formatting; English interface retained | Mobile overflow, persistence, keyboard and automated accessibility checks |
| Presentation | Existing design language, neutral product wording, lazy analysis/3D/views and retained landing motion/reduced-motion controls | Desktop/mobile browser suite and both builds |

Workflow publication manages supported routes and calendars. Requirement examples remain a separate preview; changing the requirement registry needs a reviewed migration. An appeal-review recommendation does not reopen or overturn a rejected case. No fixed lease duration, mandatory panel composition, automatic penalty or unverified legal rule was imported from competitor claims.

## Reference check

Separate reference checkouts were inspected without running their installation scripts or importing their credentials.

| Reference | Checked revision | Finding |
|---|---|---|
| Anumitra | `57d11e6` | Domain workflow, scoped grants, reservations, source versions and outbox mechanisms were present |
| CoduUday workflow | `99f1b81` | MERN implementation and workflow services/tests; distinguishes mocked and implemented behavior |
| kartikjograna SIH26262 | `8b53ed8` | Institution/staff interface, evidence and expiry/status features |
| ApproveDesk | `6e98ab0` | README only at the checked revision; advertised features cannot be counted as implemented code |
| PRISM | `3fbddb0` | Previously inspected complete reference; informed meaningful optional spatial navigation |

The supplied long report also mixes in an unprovided project and some of this app's files. Those sections were not treated as verified competitor code. This implementation uses original application code and the existing project components; Three.js attribution is retained separately.

## Validation

- 206 domain, database-boundary, integrity and automation tests passed.
- 61 browser checks passed, including actual 3D rendering, unavailable-graphics fallback and mobile accessibility/large text.
- The authenticated browser journey verifies actual login, draft persistence, an authenticated LangGraph response and logout.
- Fresh local integration: 5 preparation checks and 12 Auth/Storage/workflow checks; eight real synthetic accounts, concurrent reviewer acquisition, byte roundtrip, RLS isolation and audit verification.
- Fresh claim remediation: 13 checks, nine claims and seven private uploads; replacement validity is reviewed before resolution and recheck.
- New capability integration: 18 checks over real Auth/REST/PostgreSQL/Storage, competing expert bookings, source-bound recommendations, policy publication and actual loopback SMTP transport.
- Demo and connected builds pass. The main application dependency audit has zero findings. The optional graphics chunk is loaded only when enabled.
- Local database migrations were applied through the checksum-checked launcher. Public authenticated RPCs retain invoker facades over guarded private functions.

The integration runner now creates fresh fixtures before validation; it no longer relies on a previously closed test case. Test-only scan completion is explicitly labelled as a known PNG fixture, never as a validated antivirus engine.

## Repeat the checks

```powershell
npm ci
npm run local:start
npm test
npm run test:e2e
npm run test:integration
npm run test:claims:local
npm run worker:setup:local
npm run test:recon:local
npm run test:connected
npm run build
npm run build:connected
```

For a manually controlled local mail demonstration, run `npm run mail:sink` and then `npm run outbox:process`. The worker rejects non-loopback destinations. Transport acceptance is not a mailbox-delivery claim.

## Release boundaries

This is a validated local demo, not a production-readiness claim. A real malware scanning integration, recovery/restore drill, full manual accessibility review, operational deployment monitoring and reviewed organizational policy are still required before real use. No hosted backend migration or real regulatory decision was performed.

n8n integration definitions remain prepared but its runtime stays disabled: the nested production dependency audit reported 174 findings, including 12 critical and 81 high. The main app and the authenticated LangGraph service operate independently. These issues must be resolved before enabling that runtime.

Historical audit data, applied migrations and compatibility identifiers are preserved. Current product wording and synthetic display labels are neutralized without rewriting canonical audit hashes or source bytes.

## Local Docker recovery

The engine initially failed while opening stale Windows runtime sockets. Only the confirmed transient socket folders were preserved under timestamped sibling names, then recreated by Docker. Container/volume/VM data and credentials were not removed. Both runtime endpoints had to be addressed before the engine started. This enabled actual local integration validation. No factory reset, WSL unregister or disk deletion was used.

The upstream failure class is documented in [Docker's issue tracker](https://github.com/docker/desktop-feedback/issues/554). The recovery result above is specific to this machine.
