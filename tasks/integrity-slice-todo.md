# 48-hour integrity slice tasks

Plan: `tasks/integrity-slice-plan.md`

## Phase 1: Foundation

- [x] Add integrity domain types and canonical audit helper
- [x] Add claim ledger migration and RLS
- [x] Seed nine requirements and nine `demo-app-0` claims

## Checkpoint: Foundation

- [x] Migrations apply in the PGlite security harness
- [x] `npm run check` passes
- [x] Demo dossier loads with claims

## Phase 2: Claim and evidence flow

- [x] Add claim RPCs and transition gates
- [x] Build claim ledger UI
- [x] Build deficiency and pre-flight UI

## Checkpoint: Claim and evidence flow

- [ ] Raise, resolve, recheck, and resubmit work end-to-end
- [x] No direct table writes
- [x] Claim ledger is usable at 390px width

## Phase 3: Evidence and audit

- [x] Add integrity signals and evidence passport
- [x] Add audit chain and verifier
- [x] Add verify surfaces to dossier, audit, and receipt

## Checkpoint: Evidence and audit

- [x] Duplicate and expired evidence are visible
- [x] Audit chain verifies green and tamper replay verifies red
- [x] Receipt shows a record hash

## Phase 4: Trust Center and release

- [ ] Add access expiry, revoke, and agent registry
- [ ] Build Trust Center
- [ ] Integrate, test, and rehearse

## Checkpoint: Complete

- [ ] All acceptance criteria met
- [ ] `npm run check` and Playwright integrity spec pass
- [ ] Screenshots refreshed with zero horizontal overflow
- [ ] Public QR and production scanner explicitly out of scope
