# 48-hour integrity slice tasks

Plan: `tasks/integrity-slice-plan.md`

## Phase 1: Foundation

- [ ] Add integrity domain types and canonical audit helper
- [ ] Add claim ledger migration and RLS
- [ ] Seed nine requirements and nine `demo-app-0` claims

## Checkpoint: Foundation

- [ ] Migrations apply in the PGlite security harness
- [ ] `npm run check` passes
- [ ] Demo dossier loads with claims

## Phase 2: Claim and evidence flow

- [ ] Add claim RPCs and transition gates
- [ ] Build claim ledger UI
- [ ] Build deficiency and pre-flight UI

## Checkpoint: Claim and evidence flow

- [ ] Raise, resolve, recheck, and resubmit work end-to-end
- [ ] No direct table writes
- [ ] Claim ledger is usable at 390px width

## Phase 3: Evidence and audit

- [ ] Add integrity signals and evidence passport
- [ ] Add audit chain and verifier
- [ ] Add verify surfaces to dossier, audit, and receipt

## Checkpoint: Evidence and audit

- [ ] Duplicate and expired evidence are visible
- [ ] Audit chain verifies green and tamper replay verifies red
- [ ] Receipt shows a record hash

## Phase 4: Trust Center and release

- [ ] Add access expiry, revoke, and agent registry
- [ ] Build Trust Center
- [ ] Integrate, test, and rehearse

## Checkpoint: Complete

- [ ] All acceptance criteria met
- [ ] `npm run check` and Playwright integrity spec pass
- [ ] Screenshots refreshed with zero horizontal overflow
- [ ] Public QR and production scanner explicitly out of scope
