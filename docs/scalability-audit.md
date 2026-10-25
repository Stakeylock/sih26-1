# Scalability and reliability implementation audit

Reviewed 2026-10-25 against the implementation and local services.

The previously identified code gaps are now implemented and exercised locally. Remote production deployment and environment-specific recovery validation remain operational steps; these results establish no production user-capacity claim.

## Implemented controls

| Area | Implementation and evidence |
|---|---|
| Atomic workflow and notification intent | Row-locked expected-version transitions retain their request receipts and per-case audit events. Configured returns, claim corrections and final decisions register an in-app delivery intent in the same transaction. Event/recipient/channel uniqueness prevents duplicate intents. See migrations `20261025142712_reliable_workers_and_paged_reads.sql` and `20261025150205_complete_workflow_notification_boundary.sql`, and `tests/reliability.test.ts`. |
| Server pagination | `fp_application_page` applies role scope, search, status and region filters in Postgres with deadline/id cursors and a maximum of 100 records. The connected UI requests 25 per page. `fp_case_bundle` independently loads the selected authorised case, including cases outside the initial window. Related workspace queries are restricted to the loaded case IDs. The initial dashboard window and its total scope are explicitly identified. See `src/ui/RemoteApplications.tsx`, `src/data/supabase.ts`, and `e2e/connected-register.spec.ts`. |
| Read performance and authorization | Live role grants and session state are cached once per SQL statement using initplans, preserving owner, region, draft, expiration and revocation boundaries. The measured bottleneck was repeated per-row permission evaluation during register counts. Cursor indexes and the saved query plan support the actual filters. See migration `20261025144551_cache_read_scope_for_pagination.sql` and the before/after results. |
| Durable deadline work | Pending intents persist independently of the browser. Bounded database processing uses row locks, current deadline-revision checks, per-item exception recovery, retry backoff and an exhausted state after five attempts. In-app insertion and completion share a transaction. `tests/governance.test.ts` interrupts reminder insertion and verifies recovery without a duplicate. |
| Delivery recovery | Token leases, retries, attempt history, source invalidation and explicit ambiguous SMTP states remain enforced. The service processes durable work continuously. SQL tests reject stale tokens; real integration retains a pending update while the worker is stopped and delivers one effect after restart. |
| Actual malware scanning | Direct private-storage uploads finalize a scan job. A recovery scan finds uploaded objects whose finalize response was lost. The worker verifies size and byte type, sends actual bytes to ClamAV INSTREAM, and records the byte hash and engine/signature version. Operational failure retains quarantine; exhausted work is visible. Real integration rejects the harmless antivirus test and a MIME mismatch and accepts three clean images. |
| Worker service package | `Dockerfile.worker` and `deploy/compose.worker.yml` provide pinned images, restart policy, health checks, private ports, a persistent signature volume and an unprivileged worker with a read-only filesystem. Remote configuration requires an exact expected HTTPS Supabase host and server-only secret. This package is built and running locally; no remote production deployment has been performed. |
| Job diagnostics | Case operations lists actual scan/deadline state, attempts and errors. Scoped managers can perform idempotent, version-checked retries with an audit reason. Readiness reports current worker/scanner heartbeats, queue age and failed work. See `src/ui/WorkerJobs.tsx` and migration `20261025145530_worker_readiness_metrics.sql`. |
| Audit integrity | Per-case hash chains and append ordering remain in the case transaction. Existing SQL and browser tamper tests pass. The chain is tamper-evident under its stated database assumptions; it does not prove that an evidence claim is true. |
| Reproducible measurement | `scripts/scale-benchmark.mjs` creates and removes only a uniquely named disposable database on loopback Postgres. It applies the real migrations, seeds 10,000 applications/events/obligations and 1,000 delivery intents, then measures 25/50/100 virtual clients using a 25-connection pool with background delivery. Reports include script/schema hashes, timing, errors, connection/lock samples, queue data, query plans, conflicting-write results and isolation checks. |

## Latest measured local workload

| Virtual clients | Duration | Register p95 | Case detail p95 | Transition p95 | Error rate |
|---|---|---|---|---|---|
| 25 | 10.2s | 89.04 ms | 19.4 ms | 33.51 ms | 0% |
| 50 | 10.5s | 150.47 ms | 83.88 ms | 42.03 ms | 0% |
| 100 | 11.1s | 273.07 ms | 206.17 ms | 66.66 ms | 0% |

These timings include database connection-pool wait on the shared local machine. The benchmark uses real Postgres and application migrations with synthetic Auth/Storage metadata. It excludes HTTP, hosted authentication, storage-byte transfer and wide-area network effects. The separate real Supabase/ClamAV integration covers those local service boundaries. The conflicting-write probe records one success, one stale-version conflict and one event; the isolation probe exposes zero foreign institution cases.

## Validation and operator evidence

- Demo and connected builds passed.
- 271 unit/SQL tests, 77 demo browser tests and two connected browser tests passed.
- Supabase local security/performance advisors: no warning/error findings.
- Root application dependency audit: zero reported vulnerabilities.
- ClamAV and the worker container are running and healthy on loopback.
- `docs/scale-results.json`: latest sustained database workload with provenance.
- `docs/scale results` and `docs/scale results`: equivalent short probes before/after the policy optimization.
- `docs/reliability-integration-results.json`: actual upload, quarantine, scan and worker-restart results.
- `docs/reliability-operations.md`: startup, deployment configuration and repeatable commands.

## Environment-specific rollout

Apply the migrations and deploy the worker package on the chosen staging/production Docker host using server-only secrets, then repeat synthetic scanning, isolation, retry, restart and workload validation on that infrastructure. Restore drills and a production capacity/SLO assessment remain separate operational evidence. Reference registries retain their existing bounded reads; additional large catalogs can adopt the same cursor pattern as the case register.
