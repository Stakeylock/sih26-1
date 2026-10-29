# Domain reference — AICTE Approval Process Handbook

Clause-level domain source adopted from `github.com/example/sih_2026` (cloned 29 October 2026).
These files are **reference material for the prototype only**. Clauseway is not an official AICTE
service and nothing here is an official AICTE citation.

| File | What it is |
| --- | --- |
| `APH_2024-27.pdf` | The handbook as published (231 pages), *AICTE Approval Process Handbook 2024-25 to 2026-27*. |
| `APH_2024-27.txt` | Full text extraction of that PDF (936 KB). Grep this before quoting anything. |
| `APH_2026-27_addendum.pdf` | *Addendum/Corrigendum 2026-27 of APH 2024-27* (20 pages, fetched 29 Oct 2026 from `aicte.gov.in/downloads/aph/Final%20Addendum%202026-27_Updated.pdf`). An **Existing → Modified** table; check this before treating any clause as final. |
| `APH_2026-27_addendum.txt` | Text extraction of the addendum (83 KB), greppable. |
| `APH_SPEC.md` | A curated 52 KB extract: actors and committees, Table 2.2/2.3 application types, Annexure-7 workflows, fees, deadlines, compliance norms §7.1–7.4, document catalogue, penal actions, and §12 ambiguities. |

## Why it is here

`src/domain/aph.ts` seeds a handful of clause references for demo document types and states plainly
that they are *"synthetic demonstration references only; not an official AICTE citation."* This
reference gives those seeds — and any future rule, deadline or requirement — a real, greppable
clause to cite instead of an invented one.

## How to use it

1. Grep `APH_2024-27.txt` (or read `APH_SPEC.md`) for the norm you are about to encode.
2. Grep `APH_2026-27_addendum.txt` for the same clause number — if the addendum amends it, the
   **Modified Clauses** column wins.
3. Take the clause number exactly as written, for example `APH 1.11a`, `APH 6.17(i)`, `Annexure-3 §3.1`.
4. If the handbook does not say it, **do not invent it**. Record the value in
   [`../open questions`](../open questions) with a status instead.
5. Anything marked ⚠ in `APH_SPEC.md` §12 is ambiguous in the source text. Implement it as an
   editable parameter, never as a hard-coded constant.

## Addendum status (checked 29 Oct 2026)

The addendum amends **34 clauses** — `1.1, 1.3.3, 1.4.2, 1.5, 1.7.1, 1.12, 2.1, 2.2, 2.3.2, 2.5,
2.6, 2.7, 2.9, 2.12, 2.14, 2.15, 2.16.1, 2.23.3, 2.24 (cross-references only), 2.25, 3.2, 4.1,
5.3.8, 6.1, 6.2, 6.7, 6.46, 6.53, 6.54, 8.1, 8.2`, plus four Definitions entries.

**None of the six clauses cited in `src/domain/aph.ts` is amended** (`6.17(i)`, `Annexure-3 §3.1`,
`1.9`, `6.14`, `6.17`, `1.8`). Note that the addendum's `3.2` is **Chapter III §3.2(m)**
(Collaboration & Twinning), *not* Annexure-3 §3.2.

Two Definitions changes are worth carrying in mind because they alter who acts:

- **Expert Visit Committee** is now constituted *by the Council* (was: by the Regional Officer), and
  verifies in *Physical / online / Hybrid* mode (was: offline/online).
- **SAC, SCSC and SHC** are now constituted *by the Council* (was: by the Chairman).

The EVC **composition** in Annexure-16 §16.5 is unchanged, and the 7-day appeal window in §2.24a is
untouched — the addendum only re-points cross-references around it.

## Open edition question — read before citing

`src/domain/aph.ts` currently declares:

```ts
export const APH_EDITION = '2026-27';
export const APH_TITLE = 'AICTE Approval Process Handbook (APH) 2026-2027';
export const APH_SOURCE_URL = 'https://www.aicte-india.org/sites/default/files/approval/APH_2026-27.pdf';
```

The handbook in this folder is the **triennial 2024-25 to 2026-27** edition, which does cover
AY 2026-27. It is not byte-identical to a standalone `APH_2026-27.pdf`, and `tests/aph.test.ts`
pins `APH_EDITION` to `'2026-27'`.

**Status: OPEN** — see `OQ-01` in [`../open questions`](../open questions). Until it is
resolved, quote clause numbers from this reference only when the clause number itself is stable
across both editions, and keep the existing "not an official AICTE citation" wording on seeded data.

## Licence

Third-party material retained for prototype reference. Provenance is recorded in
[`../third-party-notices.md`](../third-party-notices.md). The handbook is published by AICTE and is
not ours to relicense.
