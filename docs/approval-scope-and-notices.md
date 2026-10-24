# Approval scope, document validity and notice adoption

Implemented locally on 24 October 2026. All examples and decisions remain synthetic.

## Using the screens

1. Open a dossier's **Scope** tab. The institution can save its academic year and requested courses while the draft is editable. Link a prior recorded course to compare its approved intake with the current request. The server derives the previous intake from that institution's record.
2. The assigned scrutiny officer reviews the current scope revision. Editing it clears that acknowledgement. Passing scrutiny or recording approval requires the current acknowledgement when scope has been captured.
3. In **Evidence**, select a file and expand **Review validity metadata**. Record its subject, issue/expiry dates, validity mode and optional replacement lineage. Security scanning, validity review and claim/correction acceptance are separate operations. A clean file with unknown validity cannot satisfy an accepted claim or required evidence gate.
4. At approval, the authorised regional or national officer enters an explicit coverage period, academic-year coverage, approved intake for each requested course, and any continuing conditions with their own due dates. The resulting approval and course outcomes are immutable and linked to the actual decision event. No annual renewal or 90-day condition is invented automatically.
5. **Compliance** retains continuing obligations after the originating application closes. Verification checks the selected current, reviewed evidence and records the exact document versions. A reviewed dated document creates a linked expiry follow-up once; fulfilling that follow-up requires a reviewed replacement extending its validity.
6. In **Oversight → Policy notices**, the national administrator registers and reviews a source, previews all deadline changes, and explicitly adopts the preview with a reason. A changed source or target revision invalidates the preview. The source fingerprint is supplied for review and does not authenticate the source's origin.

Legacy application outcomes are not reconstructed as approval records. Legacy documents receive no fabricated validity reviewer. A case without captured course scope displays that gap explicitly.

## Deadline contract

Notices record issuer, URL, source version/fingerprint, publication/effective dates, academic year, route/institution/region filters, trigger, calendar and optional superseded notice. The supported triggers are a fixed date, recorded submission, and linked document expiry. Missing trigger dates stop preview. Weekday calculations use Monday–Friday in IST, without a claimed official holiday calendar.

Adoption uses a server-computed SHA-256 of the notice and complete impact. It locks application parents in order, rechecks the impact, preserves earlier deadline revisions, and supersedes only pending reminder intents. Sent in-app history is retained. Application deadlines survive stage changes and close at the terminal outcome; continuing-obligation deadlines remain independent. An existing notice-owned deadline requires an explicit superseding notice.

The local-only trusted processor is `npm run deadlines:process`. It reads the server worker environment (optionally `.env.server.local`) with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. These values belong only on the server. The command refuses hosted URLs, processes at most 50 due intents, checks that their deadline generation is still active, and creates in-app notifications transactionally. No email, webhook or official notice delivery is performed. No worker schedule is installed by this change.

## Database and security boundaries

Migration: `20261024105147_approval_scope_and_notices.sql`. It adds requested course scope, immutable approvals, notices/adoptions, applied deadline history, reminder intents, document-validity metadata and obligation provenance. Authenticated clients have scoped read access and use `fp_governance_command`, `fp_notice_preview` and the existing transition RPC for writes. The outbox processor is service-role-only.

All commands recheck live identity, role, region and case permissions. Mutations use revision checks and request receipts. Replacement lineage must match the case, institution and document category and cannot form a cycle. Neither automation nor an institution can record its own authority review. New events include actual server-derived scope/validity/evidence values and governance snapshots; earlier events and review bases are preserved.

When the existing local Docker stack is available, apply pending local migrations with `npx supabase migration up --local`, then run the real connected integration and browser suites. This document does not authorise resetting an existing database or applying migrations to a hosted project.

## Validation limits

The implementation has automated PostgreSQL/PGlite tests and browser journeys for the new workflows, including tenant/role boundaries, immutable decisions, stale previews, correction validity, supersession cycles, continuing obligations, reminder generations and IST calculations. Demo and connected browser bundles are built separately.

Docker Desktop's Linux engine was unavailable during this implementation. Consequently live Supabase Auth, private storage, concurrent database transactions and the running reminder worker have not been revalidated for this migration. No hosted schema change or deployment was performed. Production readiness is not claimed.

Formal hearing/appeal eligibility, hibernation, disclosure scraping and real AICTE/NSWS integrations remain outside this slice.
