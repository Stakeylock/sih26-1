# Correction and review slice — 24 October 2026

The user requested Astra's extra-high design opinion, then implementation by the primary agent. Astra is read-only. Existing uncommitted local security/startup fixes are preserved.

## Screen purposes

- The dossier is for reviewing a synthetic case and resolving its claim-specific corrections. The primary action is the role-permitted correction or recheck. Keep the actual evidence, requested remedy and recorded history; replace the official-looking memorandum with a synthetic correction summary and remove guesses about past state.
- The new-application screen creates an owned synthetic draft. Its primary action saves the entered fields atomically with draft creation. Retain the actual configured form fields and remove unsupported statutory intake claims.
- Review history is for inspecting recorded review state. Its primary action selects an immutable event. Use per-case history and explicit baseline/coverage labels instead of implying that current rows reconstruct the past.

## First implementation

- [x] Repair dossier section navigation, draft intake persistence, unsupported connected appeal controls, notification assertions and contrast regressions.
- [x] Use one consistent application-first lock order for correction and transition mutations.
- [x] Enrich existing hash-linked events with server-built schema-versioned review snapshots, including system-check invalidation and repeated response cycles.
- [x] Preserve prior review events; append a labelled current-state baseline for legacy cases, without inventing earlier history.
- [x] Load bounded, ordered per-case history with explicit coverage. Display historical states and evidence references from recorded events.
- [x] Preview and enforce targeted evidence changes for the supported claim-correction flow; preserve unrelated reviews.
- [x] Correct repeat resolve/reopen/recheck behavior and derive responsibility windows from recorded cycles.
- [x] Add meaningful SQL/domain/browser regression checks; run both builds and the affected full test suites.

## Deferred

Signed export bundles, external checkpoints, general policy publication, broad OCR/RAG and new dashboard modules follow a validated correction slice. No public deployment or production-readiness claim is part of this change. Synthetic-only safeguards and human decision authority remain mandatory.

## Remaining connected validation

- [ ] Apply the ninth migration to the isolated local PostgreSQL stack when Docker is available.
- [ ] Exercise the revised real Auth/REST/Storage journey and multi-session command races.

The implementation and local unit/SQL/browser checks above are complete; these connected checks are not claimed as passing. Latest upstream top navigation, dark mode and specimen previews are preserved.
