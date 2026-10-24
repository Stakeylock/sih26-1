# FlowPilot — Dispatch Office design contract

Status: implementation in progress

## Product stance

FlowPilot is a routing system for consequential institutional records. It should not look like a generic admin dashboard or a Public-service imitation. The product identity comes from a consistent grammar for cases, movement, responsibility, and decisions:

> **Every application is a dossier. Every handoff has an owner. Every decision leaves a receipt.**

The visual direction is **The Dispatch Office**: contemporary wayfinding, document jackets, routing slips, and ruled work surfaces. The interface should remain calm and precise in a black-and-white screenshot.

## Visual grammar

- **Dossier identity:** large case identifiers, institution names, application type, region, and status appear together.
- **Route language:** numbered stations and continuous ultramarine lines represent movement through the approval lifecycle.
- **Responsibility:** every stage, queue item, and action names the current owner or permitted role.
- **Decision receipts:** history entries show actor, role, reason, time, and workflow version.
- **Rule hierarchy:** important decisions use ruled sections and strong dividers; routine metadata stays quiet.
- **Action-first composition:** the next permitted action and its reason appear before secondary context.
- **Monospace records:** references, workflow versions, timestamps, and evidence IDs use IBM Plex Mono.

## Starting tokens

These are art-direction values, not a substitute for contrast testing:

| Token | Value | Use |
|---|---|---|
| `--canvas` | `#ECEFF1` | cool working background |
| `--paper` | `#FFFFFF` | dossiers and work surfaces |
| `--ink` | `#182126` | body text and headings |
| `--muted` | `#586670` | supporting copy |
| `--rule` | `#CFD6DC` | section rules and table lines |
| `--route` | `#2448D8` | workflow lines and active route |
| `--attention` | `#FFD166` | action-required markers |
| `--critical` | `#B42318` | overdue, blocked, or rejected states |
| `--verified` | `#176849` | clean evidence and completed work |
| `--radius-panel` | `4px` | large surfaces |
| `--radius-control` | `6px` | buttons and inputs |

## Primary screen contracts

### Dispatch board / Overview

- Remove the decorative hero banner.
- Lead with the operational headline: active cases and cases needing intervention.
- Make the priority queue the main visual surface.
- Show a compact current-handoffs route diagram alongside it.
- Use metrics as a supporting strip, not the first impression.
- Name the actual next action where permissions allow it.

### Dossier / Application workspace

- Establish the case header as a record jacket: reference, institution, type, stage, deadline, and workflow version.
- Put the numbered route immediately below the header.
- Compose evidence, reviewer checks, and the next permitted action into one review task.
- Separate evidence readiness from reviewer completion; 100% evidence readiness must not imply scrutiny completion.
- Present the advisory as **Evidence pre-check** with an expandable technical note; it cannot look like an automated decision.
- Render completed decisions as receipts: actor, role, outcome, reason, time, and workflow version.

### Approval routes

- Use stations and a continuous route line, not adjacent dashboard cards.
- Make returns explicit: scrutiny query → institution → resubmission.
- Selecting a station reveals responsible role, waiting cases, oldest case, target duration, evidence requirements, and allowed transitions.
- This view is a workflow registry, not an editor; published routes are immutable in the current slice.

### Supporting screens

- Verification visits use an agenda with date, institution, coordinator, evidence status, and next action.
- Compliance links each obligation to its source decision and evidence needed for fulfilment.
- Alerts distinguish escalations from informational updates.
- Reports answer operational questions such as “Where are cases waiting?” before showing decorative charts.
- Audit logs include case reference and actor identity.
- Mobile case summaries keep institution, stage, deadline, and action visible together.

## Interaction and state rules

- Every primary action is a real button or form control with an accessible name.
- Color never carries meaning alone; status labels and icons accompany route colors.
- Synthetic/demo disclosure is available from the persistent Demo environment control; prominent clarification remains beside simulated decisions.
- No fake signatures, official-looking seals, Institutional Review certification claims, or unexplained AI scores.
- Keep the existing role policy, evidence quarantine, audit trail, and LangGraph advisory contract unchanged.

## References consulted

These references informed structure and craft, not branding or copied layouts:

- Swiss graphic design examples: https://inspirationfeed.com/swiss-graphic-design/ — ruled grids, typographic hierarchy, and restrained composition.
- Swiss signage and wayfinding on Behance: https://www.behance.net/search/projects/Signage%20and%20Wayfinding%20swiss%20design — numbering, directional lines, and route language.
- React Flow UI: https://reactflow.dev/ui — explicit nodes, edges, station selection, and branching route behavior.
- shadcn/ui blocks: https://ui.shadcn.com/blocks — practical surface and form primitives, not a finished identity.
- Shadcnblocks: https://www.shadcnblocks.com/ — additional component composition references, subject to licensing review.
- Awwwards dashboard references: https://www.awwwards.com/websites/dashboard/ — alternative information hierarchy and composition.

## Acceptance criteria

- [x] Overview reads as an operational dispatch board, not a decorative dashboard hero.
- [x] A judge can find the next case, its reason, and its permitted action without scanning the whole page.
- [x] The application workspace reads as a dossier with a single review task.
- [x] The approval route uses numbered stations and explicit handoffs.
- [x] Supporting views use task-specific compositions: agenda, obligation register, escalation desk, operational report, and decision receipts.
- [x] Mobile case summaries keep institution, stage, deadline, and action together.
- [x] Existing unit, security, browser, accessibility, and demo-build checks remain green.
- [x] No production or regulatory claims are introduced.
