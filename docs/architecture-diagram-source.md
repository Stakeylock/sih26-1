# Architecture diagram source

Component boundaries for the FlowPilot evidence-review demo. Mermaid source for
review; do not treat as a claim about production behavior outside this demo.

```mermaid
graph TD
    subgraph Browser["Browser (React 19 + TypeScript + Vite)"]
        App[App shell · hash routing · role picker]
        Dossier[Dossier workspace · evidence index · claim ledger · history]
        DemoLab[Demo lab · demo calendar · simulation controls]
        Trust[Trust Center · access ledger · audit chain verify]
        Ops[Operations · alerts & escalations · policy notices]
    end

    subgraph Local["Local data layer (PGlite harness · tests only)"]
        Seed[demo.ts seed · synthetic cases/claims/evidence]
        Store[createDemoRepository · in-memory store]
        Events[hash-chained event audit chain]
    end

    subgraph Remote["Connected mode (Supabase · Postgres + RLS)"]
        RPC[PostgreSQL RPCs · fp_* functions]
        RLS[Row-level security · fp_private.can_view · user-scoped]
        Storage[application-docs bucket · quarantined until scanned]
    end

    App --> Dossier
    App --> DemoLab
    App --> Trust
    App --> Ops
    DemoLab -.->|demo only| Events
    Dossier --> Store
    Dossier --> RPC
    RPC --> RLS
    RPC --> Storage

    note right of Dossier: One task per screen. No dispatch / control-tower / cockpit theme.
    note right of Events: Stored events are append-only; tamper replay runs on a copy.
    note right of RLS: Cross-tenant reads return zero rows — no existence hint.
```

## Boundary contract

| Boundary | What crosses | Enforced by |
|---|---|---|
| Browser → Local | Demo reads/writes through `createDemoRepository` | TypeScript + PGlite harness |
| Browser → Remote | RPC calls through `supabase.ts` | `fp_private.can_view` / RLS policies |
| Local → Remote | None — modes are mutually exclusive per workspace | `repo.mode` gate |

## What is intentionally NOT in this diagram

- No dispatch, control tower, or cockpit composition (prohibited by AGENTS.md).
- No simulated reviewer identities, official seals, or fabricated decision outcomes.
- No backend behavior added to support layout — the layout reads existing surfaces only.

## Rendering

Convert with any Mermaid renderer (VS Code Mermaid preview, mermaid-cli, or the repo docs build). Keep this file in sync when pane composition changes.
