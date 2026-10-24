# Approval scope and source-linked deadlines

Synthetic data only. No official rule, deadline, committee power or external integration is inferred from the research attachment.

## Screen purposes

- The dossier Scope view compares prior recorded approval scope with the current course/intake request. Its primary action is saving or reviewing the requested scope. It uses actual stored scope and decision records; it does not add summary dashboards.
- The notice registry is for reviewing a source and explicitly adopting its deadline impact. Its primary action progresses draft -> reviewed -> preview -> adoption. It replaces the working compliance screen's unsupported statutory/dispatch claims with recorded provenance.
- The evidence validity form records the document's subject, dates, validity mode and supersession. Its primary action is an authorised metadata review. Upload, scan, metadata review and acceptance remain distinct.

## Implementation

- [x] Scoped course requests, previous/current comparison and versioned scope review.
- [x] Immutable approval records and course scope tied to the actual authority decision.
- [x] Continuing obligation provenance retained after an application closes.
- [x] Source-rich notices, review, hashed impact preview and atomic/idempotent adoption.
- [x] Applied deadline history, calendar basis and supersession of pending in-app reminder intents.
- [x] Explicit document validity modes, same-subject supersession and authoritative eligibility checks.
- [x] Demo and Supabase adapters and accessible light/dark UI.
- [x] SQL permissions/history/stale-state tests and browser journeys.

Validation: 171 unit/PostgreSQL-PGlite tests; 38 Playwright browser checks; separate demo and connected builds. Docker's Linux engine is unavailable, so live Supabase Auth/storage/concurrency and a running outbox processor remain unverified. See `docs/approval-scope-and-notices.md`.

General hearing/appeal eligibility, hibernation, disclosure scraping and live AICTE/NSWS integrations remain outside this implementation. Real connected validation and concurrency remain separately reported when Docker is unavailable.
