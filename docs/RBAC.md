# Role-based access control

Format adopted from `github.com/example/sih_2026` (`docs/RBAC.md`), rewritten from **our** roles
and the policies Postgres actually enforces. Clauseway is a synthetic prototype; none of this
describes a real authority's permissions.

Enforcement lives in three layers. All three must agree:

1. **PostgreSQL RLS and RPC guards** — `supabase/migrations/20261022160724_harden_baseline.sql`,
   `20261023163901_fix_integrity_boundaries.sql`, `20261024105147_approval_scope_and_notices.sql`.
   This is the authority. Every command rechecks live identity, role, region and case permission.
2. **Domain helpers** — `allowedActions()` in `src/domain/model.ts`, `caseAuthority()` in
   `src/domain/authority.ts`, `canUploadEvidence()` in `src/domain/evidence.ts`.
3. **Screen gating** — disable or omit the control, and state the unmet condition next to it.

If a screen offers an action the RPC would reject with `42501`, the screen is wrong, not the
database.

## Roles

| Role constant | Display label | Jurisdiction (`region`) | Where it exists |
| --- | --- | --- | --- |
| `institution` | Institution | must be `NULL` | demo + connected |
| `scrutiny_officer` | Scrutiny officer | one named region | demo + connected |
| `evc_coordinator` | EVC coordinator | one named region | demo + connected |
| `evc_member` | EVC member | one named region | demo + connected |
| `regional_officer` | Regional officer | one named region | demo + connected |
| `national_admin` | National administrator | must be `NULL` (national scope) | demo + connected |

Named regions: `North`, `South`, `East`, `West`, `Central`, `North-East`.

Labels come from `roleLabels` (`src/domain/model.ts`) and `roleLabelsHi` (`src/ui/i18n.ts`). Do not
hard-code them.

> **Resolved (OQ-15):** Migration `20261030110000_evc_member_role.sql` added `evc_member` to
> `public.app_role` and updated the `role_jurisdiction` constraint to permit `evc_member` with a
> named region, maintaining complete parity with TypeScript `roles` (`tests/security.test.ts`).
> In connected mode, `src/data/supabase.ts` tracks committee member reservations via
> `inspection_experts` and `expert_reservations` while user accounts carry `evc_member` with regional
> jurisdiction. `allowedActions` returns empty for `evc_member` because visit coordination and
> consolidated reporting belong to `evc_coordinator`.

## Jurisdiction helper

`fp_private.has_role(role, area)` is true when the actor holds that role, it is `active`, and

- `role = 'national_admin'` (national scope ignores `area`), **or**
- `region = area`.

`fp_private.in_region(area)` is the same test with `role <> 'institution'` excluded outright — an
institution identity never passes a regional test; it reaches records through ownership only.

## Permission matrix

Legend: **R** read · **W** write · **–** no access · **own** own cases only · **rgn** own region only
· **asgn** assigned cases only.

| Resource / action | institution | scrutiny_officer | evc_coordinator | evc_member | regional_officer | national_admin |
| --- | --- | --- | --- | --- | --- | --- |
| Own draft case — read | R(own) | – | – | – | – | R |
| Own draft case — edit | W(own) | – | – | – | – | – |
| Own draft case — upload evidence | W(own) | – | – | – | – | – |
| Submitted case — read | R(own) | R(asgn+rgn) | R(rgn) | R(rgn) | R(rgn) | R |
| Submit / resubmit | W(own) | – | – | – | – | – |
| Start scrutiny | – | W(asgn+rgn) | – | – | – | – |
| Raise / resolve deficiency | – | W(asgn+rgn) | – | – | – | – |
| Pass scrutiny | – | W(asgn+rgn) | – | – | – | – |
| Schedule EVC visit | – | – | W(rgn) | – | – | – |
| Submit EVC report | – | – | W(rgn) | – | – | – |
| Approve / reject | – | – | – | – | W(rgn) | W |
| Institutions — read | R(own) | R(rgn) | R(rgn) | R(rgn) | R(rgn) | R |
| Workflow templates — read | R(published) | R(published) | R(published) | R(published) | R(published) | R |
| Workflow templates — adopt | – | – | – | – | – | W |
| Policy notices — register / adopt | – | – | – | – | – | W |
| Access grants — issue / revoke | – | – | – | – | – | W |
| Config audit log — read | – | – | – | – | – | R |
| Audit events — read | R(own) | R(rgn) | R(rgn) | R(rgn) | R(rgn) | R |
| Notifications — read / mark read | R(own) | R(rgn) | R(rgn) | R(rgn) | R(rgn) | R |

Reads of a `draft` case are **owner-only** for everyone, including `national_admin`. The gate is
`fp_private.can_view`, which requires `status <> 'draft'` for any non-owner path.

## Write gates, as enforced

| Gate | Condition (abbreviated) |
| --- | --- |
| `can_view(app)` | `(owner_id = actor AND has_role('institution')) OR (status <> 'draft' AND in_region(region))` |
| `can_edit(app)` | `owner_id = actor AND has_role('institution') AND status IN ('draft','deficiency_raised')` |
| `can_upload_document(app, kind)` | owner + institution, **and** one of: draft/deficiency_raised where `kind` is required or on a claim; `under_scrutiny` where an open or escalated deficiency matches a claim's evidence type; any status where an open obligation lists `kind` in `required_evidence` |
| transition RPC — scrutiny actions | `has_role('scrutiny_officer', region)` else `42501 Scrutiny jurisdiction required` |
| transition RPC — EVC actions | `has_role('evc_coordinator', region)` else `42501 EVC jurisdiction required` |
| transition RPC — approve/reject | `has_role('regional_officer', region) OR has_role('national_admin')` else `42501 Decision jurisdiction required` |
| `workflow_templates` select | `status = 'published' OR has_role('national_admin')` |
| `config_audit` select | `has_role('national_admin')` |
| `user_roles` select | `user_id = actor AND active` — nobody else's role rows are visible |

## The single action list

`allowedActions(app, identity, mode)` in `src/domain/model.ts` is the one place that decides what a
user can do next, and it is used to render the affordance. It matches region to case region, with
`national_admin` exempt:

```ts
const has = (role: Role) => identity.roles.some(r => r.role === role && (r.region === app.region || role === 'national_admin'));
```

| Case status | Owner (institution) | Officer |
| --- | --- | --- |
| `draft` | `submit` | – |
| `deficiency_raised` | `resubmit` | – |
| `rejected` (demo only, no SHC appeal filed) | `request_shc` | – |
| `submitted` / `resubmitted` | – | `start_scrutiny` if unassigned or assigned to me, and `scrutiny_officer` in region |
| `under_scrutiny` | – | `raise_deficiency`, `pass_scrutiny` if assigned to me |
| `evc_pending` | – | `schedule_evc` if `evc_coordinator` in region |
| `evc_scheduled` | – | `submit_evc_report` if `evc_coordinator` in region |
| `pending_decision` | – | `approve`, `reject` if `regional_officer` or `national_admin` |
| `approved` / `rejected` | – | – (terminal) |

`mode = 'demo'` additionally exposes `request_shc`, which connected mode does not. If a control is
disabled, show the unmet condition beside it — see [`UI_COPY_GUIDE.md`](UI_COPY_GUIDE.md) §7.

## Case custody and delegated grants

`caseAuthority(app, context, now)` (`src/domain/authority.ts`) reports **who currently holds the
case**, the state of any delegated grant, and the handoff that put it there.

- **Holder** is derived from status: institution (draft, deficiency_raised) → named scrutiny officer
  (submitted, under_scrutiny) → named EVC coordinator (evc_pending, evc_scheduled) → the regional
  officer role (pending_decision) → `closed`.
- **Grant** comes from `access_assignments` and is ranked `active` > `revoked` > `inactive` >
  `expired` > `missing`, with the newest expiry winning ties.
- **Warnings** surface honestly: an expired, revoked, missing or inactive grant; a case under
  scrutiny with no individual officer recorded; a grant expiring before the case deadline.

A warning is information, not a block. The block is always the database.

## Existence is not disclosed to an out-of-scope reader

Adopted from `backend/docs/access_policy.md` in `github.com/example/aicte-approval-compliance-platform`:
*"Unknown and out-of-scope detail IDs both return 404."*

Clauseway already behaves this way; this section records it so it is not accidentally broken:

- **Reads** go through RLS (`fp_private.can_view`), which silently filters the row. A caller who asks
  for a case they cannot see gets an empty result — no error, no status difference from a case that
  never existed.
- **RPCs** raise a deliberately non-specific message: `'Application unavailable'` with
  `errcode='42501'` (and `'Application unavailable or locked'` on the edit path). The text does not
  distinguish *missing* from *not yours*, so it carries no existence information.
- Role-level failures on a **write the caller could already read** use a specific message
  (`'Scrutiny jurisdiction required'`, `'Decision jurisdiction required'`). That reveals nothing,
  because reaching that check already proves the case is visible to the caller.

Two corollaries worth keeping:

- Do not "helpfully" change `'Application unavailable'` to `'Application not found'` — that creates
  an existence oracle for anyone holding a guessed ID.
- A cursor, page offset or sort parameter orders rows; it must never widen visibility. RLS decides
  visibility before pagination runs.

## Rules for changing anything here

- A new permission is a migration plus a test, never a UI-only gate.
- Never let a screen offer an action the RPC rejects; the migration is the source of truth.
- Do not add a role to the TypeScript `roles` array without adding it to `public.app_role` **and**
  to the `role_jurisdiction` constraint — that is exactly how OQ-15 happened.
- Role changes are audited. Do not write an authority review through an automated agent or an
  institution acting on its own case.
