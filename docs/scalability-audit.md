# Scalability and reliability audit

**Reviewed:** 2026-10-25

**Validation:** Demo build passed; 260 unit/SQL tests and 77 browser E2E tests passed after the merge. This is not a production load test or deployment certification.

**Scope:** Current Clauseway source, Supabase migrations, local worker scripts, and repository tests.

## Summary

The project already has several meaningful reliability controls: database-enforced role and case scope, row-locked versioned transitions, retry receipts, per-case hash-linked audit events, private object storage, bounded worker batches, and leased notification delivery. Those controls are covered by SQL-backed tests in several areas.

The project is **not yet validated for scale**. The connected workspace fetch is capped rather than cursor-paginated; background workers and the mail sink are explicitly local-only; malware scanning is a release gate; and there is no representative 10,000-case load test or measured latency/queue data. Do not claim a supported user count or production-scale capacity.

## Findings

| Area | Status | Evidence and limits |
|---|---|---|
| Modular monolith | Implemented | React app, domain modules, Supabase/Postgres RPCs and local workers are in one repository. No service split or distributed message broker is required by the current design. |
| Authorization and atomic workflow transitions | Implemented | `fp_private.transition` locks the case row, checks the expected version and authorization, then writes the state change, event, and transition receipt in one database transaction. `fp_private.transition_receipts.request_id` is a primary key; its stored actor, case, input, and result bind retries to the original request. See `supabase/migrations/20261022160724_harden_baseline.sql`, later transition definitions in `supabase/migrations/20261024105147_approval_scope_and_notices.sql` and `supabase/migrations/20261024202254_scoped_operations_delivery.sql`, plus `tests/security.test.ts` and `tests/claim-rpcs.test.ts`. |
| Transactional notification outbox | Partial | `delivery_outbox` records source-bound work; workers claim bounded batches under row locks, use expiring lease tokens, and record attempts. In-app notifications are unique by `outbox_id`. This is a separate operations command and is not automatically attached to every workflow transition. The SMTP path is a local test sink, not real production email. See `supabase/migrations/20261024202254_scoped_operations_delivery.sql`, `scripts/process-outbox.mjs`, and `tests/operations-db.test.ts`. |
| Deadline processing | Partial | `deadline_reminder_intents` are durable, unique per deadline and recipient, indexed for pending due work, and processed in bounded batches with stale-revision checks. A failed database transaction leaves work pending for a later run. There is no attempt/backoff or failed-job state for reminders, and the supplied worker is local-only. See `supabase/migrations/20261024105147_approval_scope_and_notices.sql`, `scripts/process-deadlines.mjs`, and `tests/governance.test.ts`. |
| Audit integrity | Implemented, with stated limits | Events carry per-application sequence, previous hash, and event hash; verification detects altered or incomplete chains. Event appends are serialized with the case transaction. The chain is tamper-evident under its database and hash assumptions; it does not prove the underlying evidence is true and cannot protect against every fully privileged administrator. See `supabase/migrations/20261024024009_correction_review_basis.sql`, `src/domain/integrity.ts`, `tests/audit-chain.test.ts`, and `tests/audit.test.ts`. |
| General list reads and pagination | Partial | `src/data/supabase.ts` loads workspace-wide collections with fixed limits (for example, 200 applications, 1,000 documents, and 500 events). Per-case history has a bounded cursor RPC (`fp_case_history`, 100 events per page, at most 20 pages), but the main registers do not expose cursor pagination or query only the selected page. RLS still applies to the database reads. Current list limits prevent unbounded responses but can silently omit older rows from a larger workspace. |
| Query indexes and query-plan evidence | Partial | Migrations define targeted indexes for case/status, documents, deadlines, outbox state, and event history. The repo does not include representative `EXPLAIN (ANALYZE, BUFFERS)` results or a repeatable plan review against a large synthetic dataset. Index changes should follow measured query plans. |
| Evidence storage and scanning | Partial | The client uploads bytes directly to the private `application-docs` bucket after a server-authorized metadata reservation. Uploads are size/type bounded and remain `pending` until a trusted scanner records a hash, timestamp, and engine; storage policies restrict upload and download. No malware-scanner provider is integrated, and readiness checks explicitly leave scanning as a release gate. See `src/data/supabase.ts`, `supabase/migrations/20261022160724_harden_baseline.sql`, and `tests/operations-db.test.ts`. |
| Background worker deployment | Partial | `scripts/process-deadlines.mjs` and `scripts/process-outbox.mjs` use a server-only service credential and reject non-loopback Supabase hosts. This is a safe local demonstration boundary, not a production scheduler or deployed worker service. `scripts/setup-local-worker.mjs` also targets loopback only. |
| Concurrency and idempotency tests | Implemented for core behavior | SQL-backed tests cover stale-version conflicts, duplicate request receipts, role/scope denial, outbox leases, stale source invalidation, uncertain SMTP reconciliation, and audit-chain tampering. These test database invariants; they are not a throughput test with concurrent virtual users. |
| Load and capacity testing | Missing | No 10,000-case synthetic load fixture, k6/Artillery workload, or measured p50/p95 latency, throughput, lock waits, queue age, or error rate was found. No capacity or concurrent-user claim is supported. |

## Smallest viable next steps

1. **Paginate the connected application register.** Add a role-scoped, cursor-based server query with a hard page-size ceiling. Keep the case detail RPC authoritative and preserve the current RLS boundaries. Add SQL tests for cursor order, page limits, and institution/region isolation before moving other collections.
2. **Prove worker recovery.** Keep the current bounded queues. Add a test that expires an in-app delivery lease, lets a replacement worker claim it, rejects the old lease token, and records one notification. Add equivalent deadline retry/recovery coverage before introducing new queue infrastructure.
3. **Connect scanning only after choosing an actual provider.** The integration must receive uploaded object bytes, quarantine failures, and mark `clean` only from a trusted server-side result. Keep the existing explicit release gate until then.
4. **Measure a representative database workload.** Use a disposable Postgres/Supabase environment, seed reproducible synthetic data, and record schema, machine tier, run duration, p50/p95, errors, query plans, and queue lag. Increase virtual users in steps; do not infer national production capacity from a local run.
5. **Review query plans and indexes from those measurements.** Keep the case transition and authorization paths independent from any eventually updated dashboard aggregates.

## Current demonstrated claim

The source supports saying that Clauseway has database-enforced version checks, scoped access, per-case audit verification, and bounded local workers. It does **not** support a claim that the system has been load-tested for a particular number of users or production volumes. Report those stronger claims only after the deployment environment and measurements above exist.
