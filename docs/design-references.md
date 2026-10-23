# FlowPilot design reference research

**Date:** October 23, 2026
**Phase:** Research gate only; no application code was changed.

## Method and evidence

I used direct web fetching plus the app's built-in browser for visual checks. I did not rely on prior memory or claim access to blocked pages. Browser visual observations were captured at the available mobile viewport (`310 × 659`); no local screenshot files were written because the direct browser tool did not expose a workspace save path.

## Sources actually inspected

### Swiss / International graphic design

- [Inspirationfeed — 100 Magical Examples of Swiss Graphic Design](https://inspirationfeed.com/swiss-graphic-design/)
  - Direct fetch succeeded.
  - Browser visual check succeeded.
  - The requested Behance search was also attempted, but returned HTTP 403, so it is not used as visual evidence.

### React Flow UI

- [React Flow UI](https://reactflow.dev/ui)
  - Direct fetch succeeded.
- [Base Node](https://reactflow.dev/ui/components/base-node)
  - Direct fetch and browser visual check succeeded.
- [Data Edge](https://reactflow.dev/ui/components/data-edge)
  - Direct fetch succeeded.

### shadcn/ui

- [shadcn/ui Blocks](https://ui.shadcn.com/blocks)
  - Direct fetch succeeded.
- [dashboard-01](https://ui.shadcn.com/view/new-york-v4/dashboard-01)
  - Direct fetch and browser visual check succeeded.
- [sidebar-07](https://ui.shadcn.com/view/new-york-v4/sidebar-07)
  - Direct fetch and browser visual check succeeded.
- [shadcn MCP Server](https://ui.shadcn.com/docs/registry/mcp)
  - Direct fetch succeeded; used for tooling constraints, not visual direction.

### Tooling references

- [Playwright MCP](https://playwright.dev/docs/getting-started-mcp)
  - Direct fetch succeeded; this documents the alternative browser-MCP setup, not a design reference.

## Concrete observations

### Swiss / International graphic design

1. The reference explicitly centers geometry, grids, white space, uniformity, and structured information rather than decoration.
2. The browser view uses a restrained editorial composition: a strong title, generous whitespace, a narrow reading column, and a small number of images instead of a dense dashboard surface.
3. The article describes hierarchy as a relationship between pieces of information, making the order of reading part of the design system.

**Borrow:** use a visible grid, disciplined spacing, numbered sections, and one strong route accent. Make information order obvious before adding metrics or ornament.

**Do not borrow:** the long editorial article format, poster-collage density, decorative historical styling, or a literal Swiss flag palette.

**FlowPilot mapping:**

- Overview: priority queue first, route register second, metrics last.
- Case workspace: record-jacket header, numbered route, evidence index, decision receipt.
- Supporting desks: ruled registers with explicit row hierarchy.

### React Flow UI

1. The UI catalog is organized around reusable node, handle, edge, control, and panel primitives rather than one fixed application layout.
2. `BaseNode` is split into header, content, and footer regions, giving each workflow station a predictable information hierarchy.
3. The examples call out interaction boundaries such as `nodrag` for buttons inside draggable nodes, while `Data Edge` makes a relationship legible by displaying a field from the source node's data.

**Borrow:** treat each approval station as a bounded record with a header, operational content, and permitted action area. Label edges with the handoff or transition they represent.

**Do not borrow:** a free-form workflow editor, drag-to-rearrange behavior, zoom controls, or a generic node-editor skin for the current immutable route registry.

**FlowPilot mapping:**

- Approval routes: station cards connected by an explicit route line.
- Station detail: role, waiting cases, oldest case, target duration, evidence requirements, and allowed transitions.
- Dossier route: edges communicate handoffs such as scrutiny query, institution response, and resubmission.

### shadcn/ui Blocks

1. `dashboard-01` composes a sidebar shell, supporting metrics, a chart, and a large data table; it is a complete generic dashboard template.
2. `sidebar-07` keeps navigation collapsible and pairs the content area with a compact breadcrumb/header treatment.
3. The blocks expose practical controls—named buttons, checkboxes, inputs, comboboxes, row menus, pagination, and table operations—alongside copyable source and install commands.

**Borrow:** use accessible primitives for dialogs, tables, tabs, comboboxes, menus, breadcrumbs, and sidebar behavior. Use the block composition as a control inventory, not as FlowPilot's identity.

**Do not borrow:** the interchangeable KPI-card grid, dark/pastel dashboard treatment, generic “Documents” information architecture, or stock rounded-card composition.

**FlowPilot mapping:**

- Overview: preserve the existing navigation shell but make the dispatch register the hero.
- Case workspace: use dialog, tabs, table, and badge primitives for review controls.
- Supporting screens: use table/row primitives for agendas, obligations, escalations, reports, and decision receipts.

## shadcn MCP inspection

The official shadcn MCP server was started locally with a temporary, research-only `components.json`; no project configuration or dependency was added. The server initialized successfully as `shadcn` version `1.0.0` and exposed registry search, item inspection, usage-example, add-command, and audit-checklist tools.

Registry searched: `@shadcn` → `https://ui.shadcn.com/r/styles/new-york-v4/{name}.json`.

Useful results for FlowPilot:

- `@shadcn/dialog` — one UI file; depends on `cn` and `radix-ui`.
- `@shadcn/tabs` — one UI file; depends on `cn` and `radix-ui`.
- `@shadcn/sidebar` — one UI file; depends on `cn`, `radix-ui`, `class-variance-authority`, and `lucide-react`.
- `@shadcn/badge` — one UI file; depends on `cn` and `radix-ui`.
- `@shadcn/data-table-demo` — example implementation.
- `@shadcn/dashboard-01` — dashboard block with sidebar, charts, and data table.
- `@shadcn/sidebar-01` — simple sidebar with navigation grouped by section.

The MCP-returned combined add command was:

```text
npx shadcn@latest add @shadcn/dialog @shadcn/tabs @shadcn/sidebar @shadcn/badge
```

That command was **not run**. The primitives are suitable references, but FlowPilot should not install or copy them until the two compositions above are approved.

## Proposed composition A — operations overview

### Desktop

1. **Dispatch header:** `DISPATCH OFFICE`, date/environment stamp, active case count, and one clear primary action.
2. **Priority register as the hero:** a wide, ruled queue grouped by current station. Each row keeps reference, institution, stage, deadline, reason, owner, and permitted action together.
3. **Route strip beside the queue:** a compact numbered path showing where the selected case is waiting, including returned or blocked transitions.
4. **Supporting evidence rail:** small summaries for evidence readiness, overdue cases, and unread escalations; no decorative chart before the operational answer.
5. **Persistent disclosure:** synthetic/demo state remains visible beside simulated decisions.

### Mobile

- Collapse navigation.
- Keep one case summary per row/card with institution, stage, deadline, reason, and action visible together.
- Move the route strip below the selected case rather than forcing horizontal scrolling.
- Keep queue state labels textual; color is supplementary only.

## Proposed composition B — application dossier

### Desktop

1. **Record jacket:** dossier reference, institution, application type, current stage, deadline, workflow version, and environment stamp.
2. **Numbered route:** a horizontal station sequence with explicit handoff labels and a visible return path for deficiencies/resubmissions.
3. **Single review task:** evidence index and reviewer checks share the main work surface; evidence readiness remains distinct from scrutiny completion.
4. **Decision rail:** the next permitted action, responsible role, reason field, and advisory pre-check live together. The advisory is clearly non-decisional.
5. **Receipt footer:** completed actions render actor, role, outcome, reason, time, and workflow version.

### Mobile

- Stack the record jacket, route, evidence index, checks, and action rail.
- Keep the next permitted action sticky or immediately adjacent to the review state.
- Preserve the dossier reference and institution at the top while scrolling.

## Approval gate

This research supports the existing Dispatch Office direction and does **not** authorize implementation yet. The next implementation step should use shadcn-compatible primitives selectively, preserve the current role/data/security behavior, and be reviewed against these two compositions before the deterministic storyline resumes.
