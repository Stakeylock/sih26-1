# Evidence integrity slice — signal disposition

Status: proposed for review. Nothing here is speculative: the backend already has `fp_disposition_signal` (`supabase/migrations/20261023110000_claim_rpcs.sql:245-249`) and `signals_read` RLS (`signals_read` policy on `public.integrity_signals`, `fp_private.can_view(application_id)`), but the `Repository` interface, `demo.ts`, `supabase.ts`, and every UI surface never wire it. Integrity signals are detected but never acted upon in the UI. This slice closes that gap.

## Template answers before editing

- What is this screen for? The Evidence Passport (document record dialog) already shows a document's integrity signals read-only. This slice adds one task to it: disposition an open integrity signal (explained / confirmed / dismissed) with a mandatory reason, recorded as an audit event.
- What is removed? Nothing removed. One reviewer action is added to an existing dialog.
- Does the backend behavior change? No schema, no new RPC. `fp_disposition_signal` already exists and enforces: disposition in {explained, confirmed, dismissed}, reason 10–1000 chars, records a `signal_disposition` audit event, `integrity_gate` already blocks decisions when a confirmed signal exists. Frontend only calls the existing RPC and mirrors it in demo mode.

## Scope

In scope:
- `src/domain/model.ts` — `Repository.dispositionSignal(signalId, disposition, reason, requestId?)` method.
- `src/data/demo.ts` — demo `dispositionSignal`: validate role/visibility/disposition/reason length, mutate `integrity_signals`, append `signal_disposition` audit event, persist.
- `src/data/supabase.ts` — connected `dispositionSignal`: `client.rpc('fp_disposition_signal', {_signal, _disposition, _reason})`.
- `src/ui/EvidencePassport.tsx` — disposition controls for open signals: reason textarea (10–1000 chars), three disposition buttons; gated so the institution role cannot disposition its own signals (scrutiny_officer / regional_officer / national_admin only); resolved signals render read-only with disposition + reason + disposed by/at.
- `tests/signal-disposition.test.ts` — unit tests: happy path, reason-too-short, invalid disposition, institution blocked, confirmed-signal blocks scrutiny pass (integrity gate).
- `e2e/demo.spec.ts` — one e2e test: scrutiny officer dispositions an open signal on demo-app-0 through the passport dialog; institution sees no disposition controls.

Out of scope:
- Re-opening dismissed signals (backend permits re-disposition; UI treats disposition as terminal — reviewer must file a new signal if needed).
- New signal types, severity changes, or auto-disposition.
- Connected-mode e2e (requires harness fixtures out of scope; unit + demo e2e cover the flow).

## Honesty rules honored

- Disposition is a real reviewer action recorded as a `signal_disposition` audit event — never a simulated outcome.
- Reason is mandatory (backend enforces 10–1000 chars); UI mirrors with minLength/maxLength and clear errors.
- Confirmed signals keep blocking decisions via the existing `integrity_gate` — confirmed via test.
- Institution cannot disposition in the UI (it must not dismiss its own duplicate/expired signals); roles that can: scrutiny_officer, regional_officer, national_admin.
- No new dependencies; no fake reviewer identities or official seals.

## Gates

- `npx tsc --noEmit -p tsconfig.json` clean; `npm run build` 32 chunks.
- `tests/signal-disposition.test.ts` 5+ passing; existing integrity suites (`tests/evidence-integrity.test.ts`, `tests/audit-chain.test.ts`, `tests/claims.test.ts`) still green.
- Full e2e green including the new disposition test.

## Out of order

- User performs commits; this agent does not commit.
