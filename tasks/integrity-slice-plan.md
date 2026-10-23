# Implementation Plan: 48-Hour Integrity Slice

## Overview

Build one complete vertical slice that turns FlowPilot from a workflow demo into a defensible approval record. The slice is built around `DEMO-2026-1001` (`demo-app-0`, Extension of Approval — Self Disclosure) and adds three foundations:

1. A claim ledger that replaces free-text review with explicit claims, evidence links, verification, and deficiencies.
2. An evidence passport that exposes hash, expiry, duplicate use, and scan provenance.
3. A tamper-evident audit chain with a real verify action and a tamper replay on a copy.

A small Trust Center makes the security posture visible without inventing production claims. The existing demo-strengthening plan in `tasks/plan.md` remains open and is not overwritten.

## Scope Contract

### Demo case

- Primary case: `demo-app-0` / `DEMO-2026-1001`, Cedar Technical Institute, South, `extension_self_disclosure`, `under_scrutiny`, assigned to `demo-scrutiny`.
- Duplicate case: `demo-app-4` / `DEMO-2026-1005`, Horizon Institute, South, `submitted`. It carries the same synthetic Fire Safety Certificate hash as `demo-app-0`.
- Closed case: `demo-app-5` / `DEMO-2026-1006`, approved, receipt `RCPT-2026-1006-01`.

### What ships

- Nine mandatory claims for the self-disclosure route.
- Claim ledger UI with evidence links, verification, deficiency raise/resolve/recheck, and pre-flight.
- Evidence passport drawer with hash, scan status, expiry, duplicate matches, and linked claims.
- Audit chain with `Verify record`, chain head, and `Simulate tamper` on a copy.
- Trust Center with record integrity, evidence integrity, access expiry, and agent boundary.
- Receipt shows the record hash and can verify the chain.
- Demo mode and connected mode use the same domain model. Connected mode enforces authorization in SQL; demo mode enforces the same rules client-side on synthetic data.

### What does not ship in this slice

- Public QR verification or a public notice-verification endpoint.
- Production malware scanning.
- Blockchain, AI approval scores, deepfake detection, or an approval chatbot.
- A full EVC evidence manifest.
- Role delegation workflows beyond expiry and revoke.
- A decision brief generator. It is a stretch item only if the core slice is green by hour 40.

## Architecture Decisions

- **Claims are authoritative for the self-disclosure route.** `checklist_items` stays for legacy templates. `fp_transition` uses claims when requirements exist and falls back to the checklist when they do not.
- **The server enforces the claim gate.** `pass_scrutiny` and `approve` require every mandatory claim to be `verified` or `not_applicable`, no open deficiencies, no confirmed integrity signals, and an intact audit chain.
- **Evidence hashes are server-authoritative in connected mode.** The browser may compute a pre-upload hash for UX, but only the scanner completion writes the trusted `sha256`. Demo mode uses seeded hashes.
- **Duplicate detection is a signal, not a verdict.** A duplicate hash creates an open signal. A human dispositions it as `explained`, `confirmed`, or `dismissed`. Only `confirmed` blocks the decision gate.
- **The audit chain is hash-linked, not blockchain.** Each event stores `sequence`, `prev_hash`, and `event_hash` over a canonical payload. `fp_verify_audit_chain` recomputes the chain. A daily signed root is phase 2.
- **Tamper replay never mutates production events.** Connected mode copies the chain into a session temp table, changes one row, and verifies the copy. Demo mode does the same in memory.
- **Access is time-bounded.** `user_roles` gains `expires_at`, `revoked_at`, `granted_by`, and `grant_reason`. `has_role` filters expired and revoked grants.
- **Agents are read-only by construction.** `agent_registry.can_approve` is constrained to `false`. No agent role is accepted by decision RPCs.
- **No new AI surface.** The deterministic advisory service remains unchanged and cannot write workflow state.

## Data Model

### New enums

```sql
create type public.claim_status as enum ('unverified','verified','deficient','not_applicable');
create type public.verification_method as enum ('document_review','cross_check','evc_physical','system_check');
create type public.deficiency_status as enum ('open','resolved','waived','escalated');
create type public.signal_type as enum ('duplicate_document','expired_document','name_mismatch','faculty_overlap','submission_velocity','access_anomaly');
create type public.signal_disposition as enum ('open','explained','confirmed','dismissed');
```

### New tables

```sql
create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  app_type public.app_type not null,
  version int not null default 1,
  code text not null,
  clause text not null,
  statement text not null,
  evidence_types text[] not null default '{}',
  verification_method public.verification_method not null default 'document_review',
  is_mandatory boolean not null default true,
  sort_order int not null default 0,
  active boolean not null default true,
  unique (app_type, version, code)
);

create table public.application_claims (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  requirement_id uuid not null references public.requirements(id),
  status public.claim_status not null default 'unverified',
  statement_snapshot text not null,
  clause_snapshot text not null,
  evidence_types_snapshot text[] not null default '{}',
  verification_method public.verification_method not null,
  verified_by uuid,
  verified_at timestamptz,
  verification_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, requirement_id)
);

create table public.claim_evidence (
  claim_id uuid not null references public.application_claims(id) on delete cascade,
  document_id uuid not null references public.application_documents(id) on delete cascade,
  linked_by uuid not null,
  linked_at timestamptz not null default now(),
  note text,
  primary key (claim_id, document_id)
);

create table public.deficiencies (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  claim_id uuid not null references public.application_claims(id) on delete cascade,
  clause text not null,
  observation text not null,
  remedy text not null,
  due_at timestamptz not null,
  status public.deficiency_status not null default 'open',
  raised_by uuid not null,
  raised_at timestamptz not null default now(),
  resolved_by uuid,
  resolved_at timestamptz,
  resolution_note text,
  evidence_id uuid references public.application_documents(id),
  rechecked_by uuid,
  rechecked_at timestamptz,
  recheck_note text
);

create table public.integrity_signals (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  document_id uuid references public.application_documents(id) on delete cascade,
  signal_type public.signal_type not null,
  severity text not null check (severity in ('info','warning','critical')),
  fingerprint text not null,
  detail jsonb not null default '{}',
  disposition public.signal_disposition not null default 'open',
  disposition_reason text,
  disposed_by uuid,
  disposed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.agent_registry (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  purpose text not null,
  scopes text[] not null default '{}',
  can_approve boolean not null default false check (not can_approve),
  enabled boolean not null default true,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
```

### Altered tables

```sql
alter table public.application_events
  add column sequence int,
  add column prev_hash text,
  add column event_hash text;

alter table public.application_events
  add constraint event_chain_shape check (
    (sequence is null and prev_hash is null and event_hash is null) or
    (sequence > 0 and event_hash ~ '^[a-f0-9]{64}$')
  );

create unique index application_event_sequence
  on public.application_events(application_id, sequence)
  where sequence is not null;

alter table public.user_roles
  add column expires_at timestamptz,
  add column revoked_at timestamptz,
  add column granted_by uuid,
  add column grant_reason text;

alter table public.application_documents
  add column issuer text,
  add column document_number text;
```

`expires_on` already exists on `application_documents`.

### Indexes

```sql
create index on public.requirements(app_type, version) where active;
create index on public.application_claims(application_id, status);
create index on public.deficiencies(application_id, status);
create index on public.integrity_signals(application_id, disposition);
create index on public.application_documents(sha256) where sha256 is not null;
create index on public.user_roles(expires_at) where active;
```

### Claim seed for `extension_self_disclosure`

| Code | Clause | Claim | Evidence | Method |
|---|---|---|---|---|
| `INSTITUTION_IDENTITY` | APH identity | Institution name and AICTE reference match the trust record | Affidavit | `cross_check` |
| `ACADEMIC_YEAR` | APH year | Academic year matches the application year | Affidavit | `cross_check` |
| `SANCTIONED_INTAKE` | APH intake | Sanctioned intake matches the previous approval | Affidavit | `cross_check` |
| `FACULTY_STRENGTH` | APH faculty | Faculty count and cadre ratio meet the declared norm | Faculty List | `document_review` |
| `STUDENT_FACULTY_RATIO` | APH ratio | Student-faculty ratio is within the declared norm | Faculty List, intake | `system_check` |
| `LAND_OWNERSHIP` | APH land | Land ownership or lease is valid for the academic year | Land Document | `document_review` |
| `BUILT_UP_AREA` | APH infrastructure | Built-up and instructional area meet the declared norm | Building Plan | `document_review` |
| `FIRE_SAFETY` | APH safety | Fire safety certificate is valid on the scrutiny date | Fire Safety Certificate | `document_review` |
| `UNDERTAKING` | APH undertaking | Institution accepts the post-approval undertakings | Undertaking | `document_review` |

### Seed state for `demo-app-0`

- Verified: `INSTITUTION_IDENTITY`, `ACADEMIC_YEAR`, `SANCTIONED_INTAKE`, `STUDENT_FACULTY_RATIO`, `LAND_OWNERSHIP`, `UNDERTAKING`.
- Unverified: `FACULTY_STRENGTH` (Faculty List present), `BUILT_UP_AREA` (Building Plan missing).
- Deficient: `FIRE_SAFETY` (certificate expired 12 days ago).
- Integrity signals:
  - `expired_document` on the expired Fire Safety Certificate.
  - `duplicate_document` on the same certificate hash used by `DEMO-2026-1005`.
- Deficiency: Fire Safety, open, due in 7 days, remedy asks for a certificate valid on the scrutiny date.
- Replacement evidence: a valid Fire Safety Certificate with a unique hash, available for the institution to link.

### Audit chain canonical payload

The SQL and demo verifier use this ordered field list:

```text
application_id, sequence, prev_hash, actor_id, actor_role, action,
from_status, to_status, reason, payload_json, created_at_utc
```

- Demo mode serializes the fields as a stable JSON array; connected mode uses `jsonb_build_array` with the same order.
- `created_at_utc` format: `YYYY-MM-DDTHH24:MI:SS.USZ`.
- `prev_hash` is the previous event's `event_hash` for the same application, or an empty string for sequence 1.
- `event_hash = sha256(canonical_payload)`.
- Appends take a transaction-scoped advisory lock on the application ID and a unique `(application_id, sequence)` constraint.

## RPC Contracts

All public RPCs are invoker facades over `fp_private` functions. Mutations remain RPC-only.

### Claim ledger

```sql
fp_link_claim_evidence(_claim uuid, _document uuid, _note text) returns void
fp_unlink_claim_evidence(_claim uuid, _document uuid) returns void
fp_verify_claim(_claim uuid, _result public.claim_status, _note text) returns void
fp_raise_deficiency(_claim uuid, _observation text, _remedy text, _due timestamptz) returns uuid
fp_resolve_deficiency(_deficiency uuid, _evidence uuid, _note text) returns void
fp_recheck_deficiency(_deficiency uuid, _result text, _note text) returns void
fp_disposition_signal(_signal uuid, _disposition public.signal_disposition, _reason text) returns void
```

Rules:

- `fp_link_claim_evidence`: institution owner while `draft` or `deficiency_raised`, or assigned scrutiny officer; document must belong to the same case and be `clean`.
- `fp_verify_claim`: assigned scrutiny officer, not the owner. `verified` requires at least one linked clean, unexpired document unless method is `system_check`. `not_applicable` requires a reason of at least 10 characters.
- `fp_raise_deficiency`: assigned scrutiny officer, not the owner. Sets the claim to `deficient`, creates the deficiency, and writes an audit event with `claim_id`.
- `fp_resolve_deficiency`: institution owner. Evidence must be clean and belong to the case. Sets the deficiency to `resolved` and the claim to `unverified`.
- `fp_recheck_deficiency`: assigned scrutiny officer. `accepted` sets the claim to `verified`; `reopened` sets it back to `deficient`.
- `fp_disposition_signal`: scrutiny officer in region, regional officer, or national admin. `confirmed` keeps the signal blocking; `explained` and `dismissed` clear the block.

### Audit

```sql
fp_verify_audit_chain(_application uuid) returns jsonb
fp_demo_tamper_replay(_application uuid) returns jsonb
```

`fp_verify_audit_chain` returns:

```json
{"intact": true, "checked": 24, "head": "…", "broken_at": null}
```

`fp_demo_tamper_replay` copies events to a session temp table, changes one reason, verifies the copy, and returns `intact:false` with `broken_at`. It requires `applications.is_demo` and a scrutiny, regional, or national-admin role. It never updates `application_events`.

### Access and agents

```sql
fp_assign_role(_user uuid, _role public.app_role, _region text, _expires timestamptz, _reason text) returns void
fp_revoke_role(_user uuid, _role public.app_role, _reason text) returns void
fp_agent_registry() returns setof public.agent_registry
```

- `fp_assign_role` requires national admin, a reason, and an expiry for non-institution roles.
- `fp_revoke_role` sets `active=false`, `revoked_at=now()`, and writes `config_audit`.
- `has_role` requires `active`, `revoked_at is null`, and `(expires_at is null or expires_at > now())`.
- `fp_agent_registry` is read-only. No RPC grants an agent an approval action.

### Transition changes

- `raise_deficiency` requires `_payload.claim_id`.
- `resubmit` requires all deficiencies for the case to be `resolved` or `waived`.
- `pass_scrutiny`:
  - If the case has requirements, every mandatory claim must be `verified` or `not_applicable`.
  - No open deficiencies.
  - No `confirmed` integrity signals.
  - Audit chain intact.
  - Otherwise, the legacy checklist rule applies.
- `approve` repeats the same integrity gate and additionally requires the audit chain to be intact at decision time.
- Every claim, deficiency, signal, and access mutation writes an audit event.

## UI Surfaces

### Dossier

- **Claim ledger** (`src/ui/ClaimLedger.tsx`) replaces `Review checks` for claim-based routes.
  - Summary: `6 of 9 verified`, `1 deficient`, `1 missing evidence`.
  - Rows show clause, claim, linked evidence, status, method, verifier, and next permitted action.
  - Scrutiny actions: Verify, Raise deficiency, Mark not applicable.
  - Institution actions: Link evidence, Resolve deficiency.
- **Pre-flight panel** in the dossier for institution and scrutiny.
  - Missing evidence, expired evidence, duplicate hash, open deficiency, unverified claims.
  - Each item links to the claim or document.
- **Evidence index** becomes an evidence table.
  - Columns: document, type, scan, expiry, hash short, linked claims, passport.
  - Clicking a row opens the **Evidence passport** drawer.
- **Evidence passport** drawer.
  - SHA-256, scan engine/time, issuer, document number, expiry.
  - Duplicate matches across cases, with case links.
  - Linked claims and verification history.
- **Deficiency drawer**.
  - Raise: observation, remedy, due date.
  - Resolve: replacement evidence, note.
  - Re-check: accept or reopen, note.
- **Integrity banner** at the top of the dossier.
  - Example: `1 expired certificate · 1 duplicate hash · 1 open deficiency`.
- **Record verification** in the dossier action rail.
  - `Verify record` calls the audit verifier and shows `Chain intact · 24 events · head …`.

### Audit

- Add a case selector and `Verify chain` action to `Audit`.
- Show chain status, checked count, head, and last verified time.
- Add `Simulate tamper` in demo mode only.
  - Result: red `Chain broken at event 12`.
  - `Reset replay` restores the green state.
- Keep the existing append-only event list.

### Receipt

- Add `Record hash` and `Verify record` to `Receipt.tsx`.
- Show `Chain intact` or `Verification failed` with the event count and head.
- Keep the synthetic disclaimer.

### Trust Center

New route `trust` and navigation item.

Panels:

1. **Record integrity**: verify `DEMO-2026-1001`; show chain head and event count.
2. **Evidence integrity**: expired documents, duplicate hashes, pending scans, open signals.
3. **Access ledger**: active grants, region, expiry, revoked state; expiring within 7 days called out.
4. **Agent boundary**: agent name, purpose, scopes, `can_approve=false`, last run, enabled state.
5. **Tamper replay**: demo-only button; result is clearly labeled as a replay on a copy.

### Navigation

- Add `trust` to `src/App.tsx` navigation and titles.
- Add `trust` to `CommandPalette`.
- Add a `Trust Center` step to `GuidedStory` if the demo script has room; otherwise link from the audit step.

## 48-Hour Schedule

This assumes one builder plus an AI agent. If two people are available, split Track A (SQL/domain) and Track B (UI) after hour 6.

### Hour 0-3: Freeze and foundation

- Confirm `pgcrypto`/`digest` works in the PGlite security harness.
- Add `src/domain/integrity.ts` types and canonical audit helper.
- Add migration skeleton and database types.
- Checkpoint: `npm run check` still passes; migration applies in the security harness.

### Hour 3-9: Claim ledger schema and seed

- Add enums, `requirements`, `application_claims`, `claim_evidence`, `deficiencies`.
- Add RLS policies and indexes.
- Seed nine requirements and the nine claims for `demo-app-0`.
- Add claim data to the demo `Workspace`.
- Checkpoint: SQL tests can read claims; direct writes are denied; demo state contains nine claims.

### Hour 9-15: Claim ledger UI and pre-flight

- Build `ClaimLedger.tsx` and `PreflightPanel`.
- Integrate into `CaseWorkspace`; hide legacy checklist for claim routes.
- Add claim status badges, counts, and empty states.
- Checkpoint: dossier renders nine claims; responsive and axe checks pass.

### Hour 15-21: Deficiency loop

- Add `fp_raise_deficiency`, `fp_resolve_deficiency`, `fp_recheck_deficiency`, and `fp_link_claim_evidence`.
- Add deficiency and re-check dialogs.
- Update `resubmit` and `pass_scrutiny` gates.
- Checkpoint: raise fire deficiency as scrutiny; resolve as institution; re-check as scrutiny; resubmit is blocked until resolved.

### Hour 21-27: Evidence passport and duplicate signals

- Add `integrity_signals` and duplicate/expired signal creation.
- Add issuer/document number to documents.
- Seed the expired fire certificate, the duplicate hash on `DEMO-2026-1005`, and the valid replacement certificate.
- Build the evidence table and passport drawer.
- Checkpoint: fire certificate shows expired and duplicate; duplicate links to the other case; linked claims update.

### Hour 27-33: Audit chain

- Add chain columns, backfill, append function, and `fp_verify_audit_chain`.
- Route all event writes through the append function.
- Add `fp_demo_tamper_replay`.
- Add demo-mode Web Crypto verification.
- Add `Verify record` to the dossier, audit, and receipt.
- Checkpoint: green chain on `DEMO-2026-1001`; tamper replay red; reset green; no production event mutation.

### Hour 33-39: Trust Center and access

- Add `expires_at`, `revoked_at`, `granted_by`, `grant_reason` to `user_roles`.
- Update `has_role`, `fp_assign_role`, and add `fp_revoke_role`.
- Add `agent_registry` and seed two agents.
- Build `TrustCenter.tsx`; add navigation and command palette entries.
- Checkpoint: expired grant loses access in SQL tests; Trust Center shows real counts; agent cannot approve.

### Hour 39-44: Gates, tests, and polish

- Add the full claim/deficiency/audit gate to `pass_scrutiny` and `approve`.
- Update `tests/security.test.ts` and `tests/database.ts`.
- Add E2E for the integrity story.
- Check responsive layouts, focus management, and print receipt.
- Checkpoint: `npm run check` passes; Playwright integrity spec passes; no horizontal overflow.

### Hour 44-47: Demo rehearsal

- Update the guided story with the claim ledger and Trust Center.
- Write a 3-minute script.
- Capture screenshots for the new surfaces.
- Checkpoint: script runs twice without manual repair.

### Hour 47-48: Buffer and cut

- Cut public QR, decision brief, and any ungreen stretch item.
- Do not cut claim ledger, evidence passport, audit verify, or Trust Center.
- Final `npm run check`, Playwright, and screenshot refresh.

## Task List

### Phase 1: Foundation

- [x] **Task 1: Add integrity domain types and canonical audit helper**
  - Acceptance: `Claim`, `Deficiency`, `IntegritySignal`, `AccessAssignment`, `AgentRecord`, and `AuditVerification` types exist; canonical event serialization is unit-tested.
  - Verification: `npm test`; build.
  - Dependencies: none.
  - Files: `src/domain/model.ts`, `src/domain/integrity.ts`, `tests/audit.test.ts`.
  - Scope: S.

- [x] **Task 2: Add claim ledger migration and RLS**
  - Acceptance: enums, four tables, indexes, and policies apply; direct authenticated writes are denied.
  - Verification: PGlite security harness applies migrations; `npm test`.
  - Dependencies: Task 1.
  - Files: `supabase/migrations/20261023100000_claim_ledger.sql`, `src/data/database.types.ts`.
  - Scope: M.

- [x] **Task 3: Seed requirements and claims**
  - Acceptance: nine requirements and nine `demo-app-0` claims; expected statuses; missing Building Plan; expired Fire Safety.
  - Verification: unit test asserts counts and statuses; demo loads.
  - Dependencies: Task 2.
  - Files: `src/data/demo.ts`, `src/data/templates.json` if claim evidence types are added.
  - Scope: M.

### Checkpoint: Foundation

- [x] Migrations apply.
- [x] `npm run check` passes.
- [x] Demo dossier data loads with claims.

### Phase 2: Claim and evidence flow

- [x] **Task 4: Add claim RPCs and transition gates**
  - Acceptance: link, verify, raise, resolve, recheck, disposition; resubmit and pass scrutiny enforce the claim gate; owner cannot review own case.
  - Verification: SQL tests for each RPC and denial path.
  - Dependencies: Task 3.
  - Files: `supabase/migrations/20261023110000_claim_rpcs.sql`, `tests/security.test.ts`, `tests/database.ts`.
  - Scope: L, split into link/verify and deficiency sub-tasks if needed.

- [x] **Task 5: Build claim ledger UI**
  - Acceptance: nine claims render with counts; scrutiny and institution actions are role-gated; mobile layout has no overflow.
  - Verification: E2E and axe; visual check.
  - Dependencies: Task 4.
  - Files: `src/ui/ClaimLedger.tsx`, `src/ui/CaseWorkspace.tsx`, `src/styles.css`.
  - Scope: M.

- [x] **Task 6: Build deficiency and pre-flight UI**
  - Acceptance: raise, resolve, recheck dialogs; pre-flight lists missing, expired, duplicate, and open deficiency; links open the right claim/document.
  - Verification: E2E deficiency loop; keyboard/focus check.
  - Dependencies: Task 5.
  - Files: `src/ui/ClaimLedger.tsx`, `src/ui/CaseWorkspace.tsx`, `src/styles.css`.
  - Scope: M.

### Checkpoint: Claim and evidence flow

- [ ] Raise, resolve, recheck, and resubmit work end-to-end.
- [x] No direct table writes.
- [x] Claim ledger is usable at 390px width.

### Phase 3: Evidence and audit

- [x] **Task 7: Add integrity signals and evidence passport**
  - Acceptance: duplicate and expired signals seeded; passport shows hash, scan, expiry, duplicate matches, linked claims.
  - Verification: E2E opens passport; SQL test confirms duplicate query and RLS.
  - Dependencies: Task 6.
  - Files: `supabase/migrations/20261023120000_evidence_integrity.sql`, `src/ui/EvidencePassport.tsx`, `src/ui/CaseWorkspace.tsx`, `src/styles.css`.
  - Scope: M.

- [x] **Task 8: Add audit chain and verifier**
  - Acceptance: chain columns backfilled; append function used by every event; verifier returns intact/checked/head/broken_at; decision gate blocks a broken chain.
  - Verification: SQL tests for append, verify, tamper replay; unit test for demo verifier.
  - Dependencies: Task 7.
  - Files: `supabase/migrations/20261023130000_audit_chain.sql`, `src/domain/integrity.ts`, `src/data/demo.ts`, `src/data/supabase.ts`.
  - Scope: L, split schema and UI if needed.

- [x] **Task 9: Add verify surfaces**
  - Acceptance: dossier, audit, and receipt can verify; tamper replay shows red and resets green; demo-only labeling is visible.
  - Verification: E2E verify/tamper/reset; receipt print check.
  - Dependencies: Task 8.
  - Files: `src/ui/CaseWorkspace.tsx`, `src/ui/WorkspaceViews.tsx`, `src/ui/Receipt.tsx`, `src/styles.css`.
  - Scope: M.

### Checkpoint: Evidence and audit

- [x] Duplicate and expired evidence are visible.
- [x] Audit chain verifies green and tamper replay verifies red.
- [x] Receipt shows a record hash.

### Phase 4: Trust Center and release

- [ ] **Task 10: Add access expiry, revoke, and agent registry**
  - Acceptance: expired grants lose access; revoke writes config audit; agent registry is read-only and cannot approve.
  - Verification: SQL tests for expiry/revoke; UI read-only check.
  - Dependencies: Task 9.
  - Files: `supabase/migrations/20261023140000_trust_access.sql`, `tests/security.test.ts`.
  - Scope: M.

- [ ] **Task 11: Build Trust Center**
  - Acceptance: four real panels plus tamper replay; counts come from the workspace, not hardcoded; no fake green checks.
  - Verification: E2E Trust Center; axe; responsive.
  - Dependencies: Task 10.
  - Files: `src/ui/TrustCenter.tsx`, `src/App.tsx`, `src/ui/CommandPalette.tsx`, `src/styles.css`.
  - Scope: M.

- [ ] **Task 12: Integrate, test, and rehearse**
  - Acceptance: `npm run check` passes; integrity E2E passes; 3-minute script runs twice; screenshots refreshed.
  - Verification: build, unit, Playwright, manual rehearsal.
  - Dependencies: Task 11.
  - Files: `e2e/integrity.spec.ts`, `e2e/demo.spec.ts`, `src/ui/GuidedStory.tsx`, `tasks/integrity-slice-todo.md`.
  - Scope: M.

### Checkpoint: Complete

- [ ] All acceptance criteria met.
- [ ] No secrets or service-role keys in the client.
- [ ] Synthetic-only disclaimers remain.
- [ ] Public QR and production scanner are explicitly out of scope.

## Acceptance Criteria

- A scrutiny officer can open `DEMO-2026-1001` and see nine claims with verified, unverified, and deficient states.
- The Fire Safety claim shows an expired certificate and a duplicate hash shared with `DEMO-2026-1005`.
- The scrutiny officer can raise a deficiency tied to the claim and clause.
- The institution can link a valid replacement certificate and resolve the deficiency.
- The scrutiny officer can re-check and verify the claim.
- `pass_scrutiny` is blocked while any mandatory claim is unverified, a deficiency is open, a signal is confirmed, or the audit chain is broken.
- The audit verifier returns intact with a head hash; tamper replay returns broken at a specific event without mutating stored events.
- The receipt can verify the same chain.
- The Trust Center shows real counts for expired evidence, duplicate hashes, expiring access, and advisory-only agents.
- `npm run check` passes; Playwright integrity and existing demo specs pass; no horizontal overflow at 390px.

## Test Plan

### Unit

- Canonical audit serialization and demo chain verification.
- Claim status and pre-flight derivation.
- Signal disposition and blocking logic.

### SQL security

- Direct writes to claims, deficiencies, signals, and agent registry are denied.
- Institution can link evidence only to its own editable case.
- Assigned scrutiny officer can verify; another officer cannot.
- Owner cannot verify or raise a deficiency on their own case.
- Expired and revoked roles lose access.
- `confirmed` signal blocks `pass_scrutiny`; `explained` does not.
- Broken chain blocks `approve`.
- Tamper replay does not change `application_events`.
- `agent_registry.can_approve` cannot be true.

### E2E

1. Open `DEMO-2026-1001` as scrutiny.
2. Assert nine claims and the integrity banner.
3. Open the Fire Safety passport; assert expired and duplicate.
4. Raise a deficiency.
5. Switch to institution; link the valid certificate; resolve.
6. Switch to scrutiny; re-check; verify.
7. Verify remaining claims; pass scrutiny.
8. Open audit; verify green; simulate tamper; assert red; reset.
9. Open receipt; verify record.
10. Open Trust Center; assert real counts and agent boundary.

### Accessibility and responsive

- Axe on dossier, Trust Center, and passport dialog.
- Keyboard reachability for claim actions and drawers.
- 390px, 768px, and 1440px screenshots; zero horizontal overflow.

## Demo Script

1. **Trust Center (20s).** “This is the record’s integrity, not a dashboard score. One chain head, one expired certificate, one duplicate hash, and an advisory agent that cannot approve.”
2. **Dossier (40s).** Open `DEMO-2026-1001`. “Nine claims, not a free-text checklist. Six verified, one deficient, two pending.”
3. **Evidence passport (30s).** Open Fire Safety. “Expired 12 days ago. The same hash appears in another case. The system flags it; a human dispositions it.”
4. **Deficiency (30s).** Raise the deficiency. “The query is tied to the claim, clause, remedy, and due date.”
5. **Institution (30s).** Link the valid certificate and resolve. “The institution sees exactly what to fix.”
6. **Re-check (30s).** Re-check and verify. “The reviewer records the method and note. The claim is now verified.”
7. **Decision gate (20s).** Attempt to pass scrutiny with one claim pending. “The server refuses. The gate is not a UI hint.”
8. **Audit (30s).** Verify chain. Simulate tamper. “Broken at event 12. The stored events were not touched; the verifier checked a copy.”
9. **Receipt (20s).** Verify the receipt. “The decision carries the same record hash.”
10. **Close (10s).** “AI drafts. Humans decide. The record proves what happened.”

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Claim ledger scope grows into a full APH model | High | Freeze at nine claims and one application type. |
| Audit chain concurrency duplicates sequence numbers | High | Advisory lock plus unique `(application_id, sequence)`; test concurrent appends. |
| PGlite lacks `pgcrypto`/`digest` | High | Test at hour 0; fallback to a pure SQL hash only if verified, otherwise move chain tests to hosted Supabase and keep demo verifier. |
| Existing tests depend on checklist-only transitions | Medium | Keep checklist fallback for templates without requirements; update fixtures for the claim route. |
| Demo Web Crypto differs from SQL canonicalization | Medium | Keep demo and connected verifiers separate; label demo as a synthetic chain fixture. Do not cross-verify. |
| UI becomes too dense | Medium | Claim ledger replaces checklist; passport is a drawer; pre-flight is a compact panel. |
| Time overrun | High | Cut public QR, decision brief, and agent kill switch first. Never cut claim ledger, evidence passport, audit verify, or Trust Center. |
| Scanner gap looks like a broken upload | Medium | Label pending scans honestly; demo uses seeded clean evidence; no fake scanner claims. |
| RLS regression | High | Every new table has RLS and direct-write denial tests; mutations remain RPC-only. |

## Open Questions

- Confirm the nine claim statements and clause labels with a domain reviewer before the demo. The wording is synthetic and should not be presented as official AICTE criteria.
- Decide whether the Trust Center is visible to all roles or national admin only. Default: visible to all authenticated demo roles, read-only for non-admins.
- Decide whether to keep the legacy checklist visible for claim routes as a secondary record. Default: hide it to avoid two competing review models.
