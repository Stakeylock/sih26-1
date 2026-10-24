# Astra review and first implementation

24 October 2026. At the user's request, `gpt-6-astra` reviewed this direction with `xhigh` reasoning. Astra was read-only and made no implementation or service changes. The primary agent implemented the changes.

Astra recommended completing one repeated correction journey before expanding the product: recorded evidence basis, targeted reconsideration, immutable snapshots, reliable second responses and honest historical coverage. Signed exports, independent checkpoints, general dependency graphs, OCR and policy adoption remain deferred.

## Implemented scope

- Reviews capture exact eligible document IDs/hashes/metadata and configured declared inputs. Not-applicable reviews also capture their applicability inputs.
- Actual evidence-link changes invalidate only the linked claim. Configured input changes invalidate affected current reviews. A no-op relink does not invalidate a review.
- Stage gates validate the recorded basis and pinned requirement version/mandatory flag; a new clean file cannot silently revive an old review.
- Review writes use a case revision and request identity. The server serializes correction commands through the application row, rechecks live permission, and commits the projection, event and retry receipt together.
- Existing hash-linked audit events carry schema-versioned, server-built post-review snapshots. They contain scoped metadata, not storage paths or signed download URLs.
- Repeated responses retain their own snapshots. A rejected recheck clears the current response; the next response clears stale recheck fields and can be reviewed again. Acceptance checks that response's evidence itself.
- History is loaded per case with ordered pagination through a captured head. Legacy events are preserved; baseline and incomplete/unsupported history are explicit.
- Delay attribution uses recorded response windows in a synthetic IST weekday calendar. Overlapping intervals are unioned and closed cases stop accruing time. Incomplete reads do not produce claimed full attribution.
- Dossier section navigation, atomic wizard intake saving, unsupported connected appeal affordances, notification assertions, contrast, and the synthetic correction summary are corrected.

This is linked-evidence and configured-input scope, not general semantic change propagation. Browser-demo hashes are simulated on read. The SQL audit chain remains append-only through authorized application interfaces, with privileged database operators inside the trust boundary.

## Validation boundary

See `VALIDATION.md` for the latest executed checks. New SQL checks run under explicit authenticated roles in PGlite. They cover two response cycles, review preservation, stale/duplicate requests, rollback on event failure, response expiry, scoped invalidation, pinned requirements, private history and history beyond 500 events.

Real multi-session PostgreSQL races and the new connected Auth/REST/Storage flow require the local Docker stack to be available. Neither PGlite nor browser-demo tests establish those results. No hosted migration or manual deployment is part of this change.
