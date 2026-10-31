# Reliability operations

The connected application register now reads filtered cursor pages from Postgres, capped at 100 records per request (25 in the UI). Opening a case fetches its complete authorised metadata independently of the initial workspace window. Overview reports identify their loaded case window and its total visible scope. Audit history retains its separate checkpointed cursor endpoint.

## Local services

Run `npm run local:start` to start the existing local Supabase stack, configure its server-only worker credential, start the pinned ClamAV and worker containers, and open the frontend services. Existing hosted credentials are preserved. Worker logs are stored under `.runtime/` or Docker logs.

The worker polls every five seconds. It processes up to 25 delivery intents, 50 deadline reminders and five document scans per tick. Scanning, deadline processing and delivery run independently. The worker exposes `http://127.0.0.1:8791/health`; `npm run workers:health` checks it. `npm run workers:stop` stops only this app's worker. `npm run workers:start` rebuilds and resumes the service.

On the Case operations page, **Background jobs** shows actual scan and deadline state, attempt counts and errors. A current regional or national case manager can retry eligible failed jobs using a recorded reason. Retries check the case version, are idempotent, and append an audit event. Operational readiness reports the recent worker/scanner heartbeat, pending delivery age, and failures visible to the current role.

## Document scanning

Uploads go directly to the private storage bucket under the signed-in user's storage policies. The finalization RPC registers a durable scan job; recovery also finds uploaded pending documents whose finalization response was lost. A service-role worker downloads the immutable object, checks its recorded size, scans its bytes through ClamAV INSTREAM, validates the file signature against its declared type, and records SHA-256 plus the actual engine/signature version. Only a definitive clean verdict can release a document. Operational failures retain quarantine and retry with backoff, then enter `exhausted` after five attempts.

ClamAV's signature volume persists across container recreation and its normal FreshClam service updates definitions. The worker checks signature age on every tick and scan; the default maximum is 14 days. Expired signatures make the worker degraded and prevent release. The current image digests are pinned in the worker Dockerfile and Compose configuration; update them deliberately and rerun scanner integration before rollout.

In-app deadline reminder insertion and completion share one database transaction. An interruption rolls back both. Per-item failures record a bounded retry schedule and eventually become visible failures. Delivery intents use expiring tokens; a replacement worker cannot use an old lease. Uncertain local SMTP acceptance remains `ambiguous` for human reconciliation.

Configured workflow returns and decisions (`raise_deficiency`, `approve`, `reject`) register the owner's in-app notification in the same transaction as the audit event. A unique event/recipient/channel identity prevents duplicate intents.

## Deploying the worker to another Docker host

Use `deploy/compose.worker.yml` and `Dockerfile.worker`. Supply a server-only environment file using `CLAUSEWAY_WORKER_ENV_FILE`; an example is `deploy/worker.env.example`. Set `WORKER_TARGET` to `staging` or `production`, `WORKER_SUPABASE_URL` to the HTTPS project URL, and `WORKER_EXPECTED_SUPABASE_HOST` to that exact hostname. The worker rejects a mismatched remote host. Keep the service-role credential out of frontend variables, images, logs and Git.

Run the migrations on the selected environment before starting its worker. Start Compose with `up -d --build --wait`, then verify `/health`, the in-app readiness report, a synthetic clean upload, the harmless antivirus test, a pending delivery and worker restart. Ports in Compose bind only to loopback. The image runs without root, drops capabilities, uses a read-only filesystem and restarts on process failure. The service supports in-app delivery and a local SMTP test sink; no external email provider is configured.

The deployment package has been built and exercised locally. A remote production service has not been deployed by this change.

## Repeatable measurements

`npm run test:scale:local` creates a new, uniquely named database on a loopback Postgres server, applies the real application migrations, and seeds 10,000 synthetic applications, events and obligations plus 1,000 delivery intents. It runs 25, 50 and 100 virtual clients with a 25-connection pool and concurrent background delivery. Each stage runs for ten seconds by default; `FP_SCALE_SECONDS` can increase that duration up to 300 seconds. It records latency percentiles, throughput, error rate, connection/lock samples, queue age, query plans, conflicting-write results and isolation checks, then drops only the database it created. It never benchmarks a hosted database.

Results are in `docs/scale-results.json`. These are local database timings with synthetic Auth/Storage metadata. They exclude HTTP, hosted Auth and wide-area networking and establish no supported production user count.

`npm run test:reliability:local` checks actual Supabase Auth/RLS/storage, real ClamAV verdicts, byte hashes, quarantine access and recovery of one queued in-app notification across a container worker restart. It uses explicit synthetic accounts and sends no external messages. Results are in `docs/reliability-integration-results.json`.
