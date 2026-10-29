# Local document reading and due work

29 October 2026.

## Shipped scope

On a case's **Evidence** tab, open **Document reader** in the validity section. Read the existing watermarked PDF or choose a local PDF/PNG/JPEG. PDF.js extracts embedded text; image-only pages and raster files use the pretrained English Tesseract model. This is actual processing of bytes, not the sample's declared metadata. Model/worker assets are generated from pinned npm packages and served by the app itself. Document bytes are not uploaded to an OCR provider.

The reader supports labelled issuer, document reference, issue date and expiry date fields. Each suggestion carries a page, excerpt, extraction method and source SHA-256. OCR confidence describes recognition quality, not authenticity. Ambiguous numeric dates are left for manual interpretation. Multiple candidates remain visible rather than being silently resolved. Processing is bounded to 10 MB, three pages and capped canvas dimensions; it can be cancelled. English-only and degraded-scan accuracy remain limitations. No custom training or model-accuracy benchmark is claimed.

Permitted reviewers can copy a candidate into the existing validity form. The source hash/page are added to the review explanation. The reviewer must check file identity and the proposed value, then explicitly record a validity review through the existing repository command. Reading and copying do not persist a review or accept a claim. The reader does not introduce a new permission or API endpoint. A locally chosen file is not authenticated as the attached case document.

**Due Work** filters loaded authorized records by text, kind and open/overdue/complete status, shows responsibility, source and actual recorded escalation, and links to the case. Date-only obligations use end-of-day IST. Visit windows are labelled distinctly from report deadlines. Case-level delivery attempts do not prove delivery of an individual deadline notice. Connected pagination limits are disclosed.

**Trust Center** lists exact SHA-256 matches across loaded visible cases, with case links. It does not search outside the provided scope, detect visually similar stamps or establish fraud. The existing captured-case assistant continues to provide deterministic citations and correction drafts; no official-handbook retrieval or external LLM was added.

## Hardening and upstream repairs

- Removed browser provider-key reading and outbound email/SMS calls. The helper reports external channels as simulated; transport credentials must stay on a server. Added a build guard and tests against reintroducing provider URLs/keys in emitted bundles.
- Escaped user-derived text in notification previews and removed official-notice branding.
- Restored missing EVC demo modules/types referenced by the pulled source. The example qualifications are synthetic declarations. Connected mode explicitly rejects these demo-only panel commands and retains its existing inspection service. No connected EVC-member database role was added.
- Restored truthful dry-run behavior in the demo calendar; it does not dispatch external notices, silently escalate real records or claim an actual transport outcome. Existing explicit outbox operations remain separate.
- Kept the seed notice as a relaxation for all newly seeded applicable cases by extending its draft duration. Earlier-deadline protection remains enforced.
- Fixed policy-banner acknowledgement so remount/StrictMode does not acknowledge a newly adopted source without a user action. Added keyboard access to scrollable EVC tables and aligned stale fixture assertions with the pulled dataset.

## Sources and assets

- https://github.com/naptha/tesseract.js (Apache 2.0)
- https://github.com/naptha/tesseract.js-core (license copied into generated assets)
- https://github.com/naptha/tessdata (pinned `@tesseract.js-data/eng` package)
- https://mozilla.github.io/pdf.js/ (Apache 2.0)

`npm run prepare:ocr` copies workers, language data and licenses from node_modules into ignored `public/ocr`. `predev`, `prebuild` and `prebuild:connected` run this automatically. Build and install do not download evidence. Assets use same-origin paths; CSP allows WebAssembly compilation and local workers without enabling general unsafe JavaScript evaluation.

`node scripts/verify-production-reader.mjs` serves the built artifact with the configured production headers and verifies real PDF extraction, real image OCR and mobile Due Work. The feature browser tests use actual bytes, not mocked OCR results. Wider connected integration and deployment results are recorded separately in VALIDATION.md.
