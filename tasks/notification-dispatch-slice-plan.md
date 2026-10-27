# Notification dispatch slice - plan

Status: proposed for review. Adapt Ao-chuba's `notify.ts` gateway pattern (declare real gateway state, multi-channel dispatch with sandbox fallback, honest SIMULATED when unconfigured) to our React+Vite+Supabase stack. No new dependencies; no fabricated delivery claims.

## Template answers before editing

- What is this screen for? The DemoLab gains a **Live Alert Tester**: a judge can dispatch a test notification (reminder/overdue/escalation/info/return) through in-app/email/SMS channels and see the honest gateway status + delivery result. Nothing is dispatched to real channels unless env vars are explicitly configured.
- What is removed? Nothing removed. One new dispatch surface + domain types + gateway declaration are added.
- Does the backend behavior change? Demo mode: yes (new `dispatchNotification` repo method + audit event). Connected mode: yes, via a new `fp_dispatch_notification` RPC + notification columns (channel/delivery_status/preview_url) + RLS. This is a real feature, not layout support.

## Scope (in)

- `src/domain/notification.ts` (NEW): `NotificationChannel`, `DeliveryStatus`, `GatewayStatus`, `DispatchNotificationParams`, `DispatchNotificationAttempt`, `getGatewayStatus()` (declares RESEND_LIVE/SMTP_LIVE/ETHEREAL_SANDBOX/SIMULATED etc. from `VITE_*` env), `dispatchNotification()` (pure domain logic: validate, select channels, attempt delivery per channel, return per-channel results; SIMULATED when gateway unconfigured)
- `src/domain/model.ts`: extend `Notification` with optional `channel`, `deliveryStatus`, `previewUrl`
- `src/data/demo.ts`: `createDemoRepository.dispatchNotification` - validates visibility (`fp_private.can_view` equivalent via `visible()`), creates in-app notification record, runs domain dispatch, appends `notification_dispatched` audit event, persists
- `src/data/supabase.ts`: `dispatchNotification` calls `public.fp_dispatch_notification` RPC
- `src/ui/NotificationTester.tsx` (NEW): LiveAlertTester equivalent - gateway badge strip, channel/kind/subject/body form, per-channel delivery results + preview URLs, gated so institution cannot dispatch to another tenant's application
- `src/ui/DemoLab.tsx`: add NotificationTester card to the demo lab
- `supabase/migrations/20261027XXXXXX_notification_dispatch.sql` (NEW): add `channel`/`delivery_status`/`preview_url` columns to `public.notifications`; `fp_private.dispatch_notification` (validate visibility, insert notification row, return jsonb channel+status); `public.fp_dispatch_notification`; grant execute to authenticated
- `tests/notification-dispatch.test.ts` (NEW): unit tests - happy path per channel, reason-too-short, invalid channel, institution blocked from another tenant, gateway SIMULATED when unconfigured, audit event recorded
- `e2e/demo.spec.ts`: e2e test - scrutiny officer dispatches a test notification through the passport/dialog; institution sees no dispatch button for another tenant's case

## Scope (out of)

- Real email/SMS sending without explicit env vars (always SIMULATED unless `VITE_RESEND_API_KEY`/`VITE_SMTP_HOST`/`VITE_FAST2SMS_API_KEY`/`VITE_TWILIO_ACCOUNT_SID` are set)
- Re-opening dismissed notifications, notification preferences, digest/batching
- Connected-mode dispatch tested end-to-end (requires Supabase runner; unit + demo e2e cover the contract)

## Honesty rules honored

- Gateway status is declared, never fabricated: `getGatewayStatus()` reads env and reports SIMULATED when unconfigured
- Delivery status is per-channel and truthful: `delivered`/`sent_sandbox`/`simulated`/`failed`
- No simulated reviewer identities or official seals
- Institution role cannot dispatch to another tenant's application (RLS + `can_view`)
- `markRead`/`fulfil` behavior unchanged

## Gates

- `npx tsc --noEmit -p tsconfig.json` clean
- `npm run build` 32 chunks
- `tests/notification-dispatch.test.ts` passing; existing integrity/claims/audit suites still green
- Full e2e green including new dispatch test

## Out of order

- User performs commits; this agent does not commit.
