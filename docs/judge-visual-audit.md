# Judge-path visual and accessibility audit

Date: 2026-10-27  
Scope: Clauseway / SIH26262 demonstration app  
Target: `http://127.0.0.1:5174`  
Viewports: desktop `1450x1000`, mobile `390x844`  
Themes: light and dark

## Purpose

This audit follows the judge path described in `docs/judges-walkthrough.md`:

1. Start at the proof case.
2. Read the expired certificate and correction thread.
3. Inspect unresolved items and correction actions.
4. Verify the audit chain in Trust Center.
5. Follow the continuing obligation in Compliance.
6. Verify that the route, roles, and demo disclosure remain understandable.

The review combined manual interaction with Playwright and axe-core scans. It is not a full WCAG conformance audit. It concentrates on the states a judge is likely to see during the six-minute story.

## Result

Two high-severity issues and four medium-severity issues were confirmed. The highest-impact issues are a light-theme hover contrast failure on secondary controls and a mobile deadline panel that extends outside the viewport.

| # | Severity | Area | Finding |
|---|---|---|---|
| 1 | High | Buttons / light theme | Outline and secondary buttons become unreadable on hover (`1.88:1`). |
| 2 | High | Mobile proof case | The deadline explanation extends beyond the `390px` viewport and creates page-level horizontal overflow. |
| 3 | Medium | Mobile Compliance | The horizontally scrolling obligations table cannot receive keyboard focus; the action column is off-screen at rest. |
| 4 | Medium | Proof case | The action card says “No actions available” while `Link evidence` and `Resolve` are visible in the claim ledger. |
| 5 | Medium | SPA navigation | Route changes leave focus on `BODY` and do not update the document title. |
| 6 | Medium | Proof case | The deadline disclosure’s accessible name does not contain its visible text (`label-content-name-mismatch`) on mobile light and desktop dark. |
| 7 | Low | Proof case | Two complementary landmarks are unlabelled; axe reports `landmark-unique` on the dossier action rail. |

A Trust Center count that initially looks inconsistent is explainable and is recorded below as a non-finding.

## Findings

### 1. Light-theme hover makes outline and secondary buttons unreadable

**Severity:** High  
**WCAG:** 1.4.3 Contrast (Minimum), AA  
**Axe:** `color-contrast`, serious, 1 node

The global light-theme hover rule changes the background to dark teal but leaves the text colour as the normal dark ink:

- Text: `#172332`
- Background on hover: `#0f574f`
- Axe contrast: `1.88:1`
- Required: `4.5:1` at 10px normal weight

The normal state is fine (`15.87:1`). The failure occurs only on hover, so an axe pass that does not trigger hover will not catch it.

Reproduction:

1. Open `http://127.0.0.1:5174/#trust` in light theme.
2. Hover `Verify chain` under Record integrity.
3. Observe dark text on the dark teal fill.
4. Run axe with `color-contrast`; the target is `.trust-reference > .button.outline`.

The same rule affects other outline and secondary controls, including `Policy notices` on Compliance.

Cause:

- `src/styles.css:42` gives outline and secondary buttons a light hover background with dark text.
- `src/styles.css:1484` overrides the background with `#0f574f` at higher specificity, but does not set a light foreground colour.
- `:root:not([data-contrast="high"]) .button:hover:not(:disabled)` has specificity `0,5,0`; `.button.outline:hover:not(:disabled)` has `0,4,0`.

Suggested fix:

- Scope the dark hover fill to filled buttons only, for example `.button:not(.outline):not(.secondary):hover`.
- Or add a light foreground colour to the global hover rule and verify every button variant.
- Keep the dark-theme override at `src/styles.css:1486` and `:1488`; the dark hover state already passes.

Verification after fix:

- Hover `Verify chain`, `Policy notices`, and a filled primary button in light and dark themes.
- Confirm axe reports no `color-contrast` violation.
- Confirm the normal and focus-visible states are unchanged.

Evidence: `focus2/04-trust-verify-hover.png`, `focus2/focus-results.json` (`trustHoverAxe`), `focus3/focus3-results.json` (`secondaryHover`, `Policy notices`).

---

### 2. Mobile deadline explanation overflows the viewport

**Severity:** High  
**Area:** Reflow / mobile layout

At `390x844`, opening the first deadline disclosure in the proof case produces:

- Panel left: `215px`
- Panel right: `539px`
- Panel width: `324px`
- Viewport width: `390px`
- Document horizontal overflow: `true`

The panel is sized against the viewport but is laid out at the trigger’s inline position, so its right edge extends `149px` beyond the screen. The second deadline disclosure does not overflow because it begins near the left edge. The failure depends on where the trigger sits.

This is on the judge’s primary proof case and hides part of the explanation for the approaching deadline.

Reproduction:

1. Open the demo lab and choose `Open the proof case` as `institution`.
2. Set the viewport to `390x844`.
3. Open the deadline disclosure labelled `2d remaining`.
4. Observe page-level horizontal scrolling and a panel that extends off-screen.
5. Measure `document.documentElement.scrollWidth`; it exceeds `innerWidth`.

Cause:

- `src/ui/common.tsx:22-24` renders the panel inside an inline `details` element.
- `src/ui/explain.css:19` sets `width:min(350px,calc(100vw - 44px))`, but does not constrain the panel’s horizontal position.
- `src/ui/explain.css:47` and `:48` narrow the width on small screens without moving the panel into a viewport-bounded layer.

Suggested fix:

- At the mobile breakpoint, render the panel in a viewport-constrained layer, for example fixed positioning with `left:16px; right:16px; width:auto`, or
- Position it relative to the trigger with a clamped inline offset and a maximum width that accounts for both sides, or
- Let the panel occupy a full-width row below the deadline summary instead of following the summary’s inline position.

Verification after fix:

- At `390px` and `320px`, open every `details.due-explain` on the proof case.
- Confirm `document.documentElement.scrollWidth === innerWidth`.
- Confirm no panel edge is outside the viewport and no text is clipped.

Evidence: `focus2/03-proof-mobile-due-0.png`, `focus2/03-proof-mobile-due-1.png`, `focus2/focus-results.json` (`proofInstitutionMobileDue`).

Implementation note (2026-10-27):

- `src/ui/explain.css` now fixes the panel to the viewport at `<=760px` with `left:16px; right:16px; bottom:16px; width:auto; max-height:calc(100vh - 32px)` and uses `12px` insets at `<=520px`.
- Testing exposed a second cause: `.page-body`’s `page-in` animation retained an identity `transform` through `animation-fill-mode:both`, making `.page-body` the containing block for fixed descendants. The open panel measured `y + height = 5734.8px` at `390x844` despite `position:fixed`.
- `src/styles.css:248-249` now fades opacity only, so fixed positioning resolves against the viewport. Verified at `390x844` and `320x700`: the panel stays inside the viewport and document width does not overflow.
- Regression coverage: `e2e/judge-audit-fixes.spec.ts` (`deadline explanation stays inside narrow viewports`).

---

### 3. Mobile obligations table cannot be scrolled from the keyboard

**Severity:** Medium  
**WCAG:** 2.1.1 Keyboard, A  
**Area:** Compliance monitoring

At `390x844`, the `Continuing obligations` table is wider than its scroll container:

- Container client width: `358px`
- Table scroll width: `610px`
- Overflow: `auto`
- Container `tabindex`: `null`

The `ACTION` column starts at `499px` and its buttons run from `511px` to `614px`, so every `Review obligation` and `Open case` control is off-screen at rest. Touch users can pan the table, but keyboard users cannot focus the scroll container to pan it. The table also has no explicit scroll cue or focusable region.

Reproduction:

1. Open `http://127.0.0.1:5174/#compliance` at `390x844`.
2. Tab through the page without using a pointer.
3. Observe that focus skips the table container.
4. Observe that the action buttons remain outside the visible area.

Cause:

- `src/ui/WorkspaceViews.tsx:87` renders `.table-scroll` without `tabIndex`, `role`, or an accessible name.
- `src/styles.css:1419` supplies `overflow:auto` but no keyboard entry point or focus style.

Suggested fix:

- Make the scroll container focusable with `tabIndex={0}`.
- Give it a named region, for example `role="region"` and `aria-label="Continuing obligations table"`.
- Add a visible focus ring and a short scroll hint.
- Consider a responsive card layout or a sticky action column for small screens.

Verification after fix:

- At `390px`, Tab into the table region and pan with the arrow keys.
- Confirm all `Review obligation` and `Open case` buttons are reachable.
- Confirm the region has a unique accessible name and a visible focus indicator.

Evidence: `focus2/05-compliance-mobile.png`, `focus2/05-compliance-mobile-scrolled.png`, `focus2/focus-results.json` (`complianceMobile`).

---

### 4. Proof-case action card contradicts the visible correction actions

**Severity:** Medium  
**Area:** UX consistency / action affordance

For the proof case as `institution`, the action card says:

> Read-only at this gate. Scrutiny officer holds the next action.  
> No actions available.

The same page shows `Link evidence` on multiple claims and a `Resolve` button on the open deficiency. Both are real, enabled controls. A judge reading only the action card would conclude that the institution cannot act, then see correction controls immediately below.

For `national_admin`, the card also says `No actions available` while `Inspect unresolved items` is present. That button only scrolls to the unresolved section and opens no dialog, so the contradiction is weaker, but the wording is still broader than the truth.

Reproduction:

1. Open `#demo-lab` and choose `Open the proof case` as `institution`.
2. Read the right-hand `YOUR ACCESS` card.
3. Scroll to the claim ledger and observe `Link evidence` and `Resolve`.

Cause:

- `src/ui/CaseWorkspace.tsx:150` derives the card from stage-level `allowedActions()`.
- Claim-level correction actions are rendered separately in the claim ledger.
- The copy does not distinguish “no stage transition” from “no correction action.”

Suggested fix:

- Change the empty-state copy to `No stage action available` and add a sentence when claim-level actions exist, for example `Claim correction is available below.`
- Optionally add an in-page link from the card to the unresolved section.
- Keep the role boundary explicit: the institution can correct claims, but cannot perform the scrutiny transition.

Verification after fix:

- As `institution`, confirm the card mentions correction actions and the visible buttons match the copy.
- As `national_admin`, confirm the card says no stage action and does not imply that the page has no inspectable content.

Evidence: `focus3/focus3-results.json` (`guide[0]`, `landingProof`, `correction`), `focus2/03-proof-institution-desktop.png`.

---

### 5. SPA route changes do not update focus or the document title

**Severity:** Medium  
**WCAG risk:** 2.4.2 Page Titled, 2.4.3 Focus Order  
**Area:** SPA navigation

After navigating from the landing page to the proof case:

- `location.hash` changes to `#case/demo-app-0`.
- `document.title` remains the landing title.
- `document.activeElement` remains `BODY`.
- The main region has `tabIndex={-1}` but is not focused.
- No route-change status is announced.

The same pattern appears on the other guide destinations: every captured guide step ends with focus on `BODY` and the same static title.

This is not caught by axe. It affects screen-reader and keyboard users who do not see the visual route change.

Reproduction:

1. Open the landing page.
2. Activate `Open proof case`.
3. Wait for the case dossier.
4. Inspect `document.title` and `document.activeElement`.

Cause:

- `src/App.tsx:71` listens for `hashchange` and updates `route`.
- `src/App.tsx:115` provides `main#main-content tabIndex={-1}` but no route effect focuses it.
- There is no route-specific title update or live announcement.

Suggested fix:

- Update `document.title` from the route and case heading, for example `Cedar Technical Institute - Clauseway`.
- On route changes after the initial load, focus the main region or its `h1`.
- Announce the new view through a polite live region, or rely on the focused heading.
- Do not move focus when a dialog opens or when only a query parameter changes.

Verification after fix:

- Navigate the full judge path with a keyboard.
- Confirm each route has a distinct title and focus lands on the new heading or main region.
- Confirm the skip link still works and focus is not stolen on first load.

Evidence: `focus2/focus-results.json` (`landing`, `freshPrimaryCtaProof`), `focus3/focus3-results.json` (all guide steps).

---

### 6. Deadline disclosure’s accessible name omits its visible text

**Severity:** Medium  
**WCAG:** 2.5.3 Label in Name, A  
**Axe:** `label-content-name-mismatch`, serious, 1 node

The proof case has a deadline summary with:

- Visible text: `2d remaining`
- `aria-label`: `Deadline: 2 working days remaining. Open how this target was derived.`

The visible text is not a substring of the accessible name. Speech-input users who say “2d remaining” cannot target the control by its visible label. The accessible name is more descriptive, but it replaces rather than includes the visible label.

The same node is reported by both the mobile light scan and the desktop dark proof scan, so this is not a mobile-only defect.

Reproduction:

1. Open the proof case as `institution` or `national_admin`.
2. Run axe on the proof view at `390x844` in light theme or `1450x1000` in dark theme.
3. Inspect the `summary.due.urgent` node.

Cause:

- `src/ui/common.tsx:23` sets an `aria-label` on the summary without preserving the visible text.

Suggested fix:

- Remove the `aria-label` and expose the extra detail through `aria-describedby`, so the accessible name comes from the visible `2d remaining`.
- Or include the visible text literally at the start of the `aria-label`, for example `2d remaining. Deadline: 2 working days remaining. Open how this target was derived.`

Verification after fix:

- Re-run axe and confirm `label-content-name-mismatch` is gone.
- Confirm the summary still announces the deadline explanation and the expanded/collapsed state.

Evidence: `focus2/focus-results.json` (`proofInstitutionMobileAxe`, `proofDark`), `focus2/03-proof-mobile-due-0.png`.

---

### 7. Duplicate complementary landmarks are unlabelled

**Severity:** Low  
**WCAG:** 1.3.1 Info and Relationships / 2.4.1 Bypass Blocks  
**Axe:** `landmark-unique`, moderate, 1 node

The proof dossier exposes two `complementary` landmarks without unique names:

- The workspace sidebar, `<aside className="sidebar">`, at `src/App.tsx:142`.
- The dossier action rail, `<aside className="dossier-action-rail">`, at `src/ui/CaseWorkspace.tsx:150`.

Axe reports the action rail because the landmark combination is not distinguishable. On mobile the sidebar is off-canvas but remains in the accessibility tree, so it still contributes to the duplicate landmark set.

Reproduction:

1. Open the proof dossier at `390x844`.
2. Run axe with the `landmark-unique` rule.
3. Inspect the target `aside.dossier-action-rail`.

Suggested fix:

- Give the sidebar a distinct name, or convert it to `<nav aria-label="Workspace">` because it contains navigation.
- Give the action rail `aria-label="Dossier actions"`.
- If the off-canvas sidebar is closed and not usable, consider `inert` or equivalent so it is not exposed as a second complementary region.

Verification after fix:

- Re-run axe and confirm no `landmark-unique` violation.
- Confirm both regions are still discoverable by landmark navigation.

Evidence: `focus2/focus-results.json` (`proofInstitutionMobileAxe`).

## What passed

- All six demo-guide steps are enabled and reach their expected route and role:
  - institution correction dossier
  - scrutiny officer dossier
  - EVC verification agenda
  - regional officer final decision
  - national administrator obligations
  - national administrator decision receipts
- The proof case demonstrates the intended correction story: expired certificate, open deficiency, tied claim, `Resolve`, and `Link evidence`.
- The `Resolve` dialog preserves the other six reviews and reopens only the tied claim for re-check.
- The `Link evidence` dialog correctly blocks submission when no eligible document exists.
- Trust Center `Verify chain` works inline and reports a verified three-event chain.
- The verification toast is a status message (`role=status`), survives a route change briefly, and clears after about six seconds.
- The dark Trust scan produced zero axe violations; its explicit hover overrides are readable. The dark desktop proof scan found only the same deadline label mismatch recorded as finding 6.
- The mobile theme toggle is visible and within the viewport.
- Normal-state `Verify chain` contrast is `15.87:1`.
- The desktop proof case does not show the mobile deadline overflow.
- The mobile Compliance table remains usable by touch; the issue is keyboard access and discoverability, not data loss.
- The dark scans returned three `color-contrast` incomplete nodes on short numeric text; inspection did not identify an actual contrast failure, so they are not counted as violations.

## Non-findings and observations

### Trust Center counts look inconsistent but reconcile

Trust Center shows:

- `2 Expired documents`
- `1 Duplicate hash groups`
- `0 Pending scans`
- `2 Open signals`

Three `Fire Safety Certificate` rows appear below those metrics: two expired records and one duplicate-hash record. This is not a confirmed defect:

- `openSignals` counts open integrity-signal records.
- Expired documents and duplicate-hash groups are separate derived metrics.
- The three rows combine two open expired-evidence signals with one derived duplicate group.

The wording could still confuse a judge because the number of visible rows does not equal the `Open signals` metric. A future clarity change could label the metric as `2 open signal records` or add a note that duplicate groups are counted separately. This audit does not treat it as a failure.

### The one console error is unattributed

Each automated run recorded one console error:

```
Failed to load resource: the server responded with a status of 404 (Not Found)
```

The request URL was not captured. It did not block any judge-path interaction and is not counted as a finding. It is likely a missing static asset, but that is not proven.

## Coverage and limitations

Tested:

- Landing page and primary CTA.
- Proof case as `institution` and `national_admin`.
- Mobile and desktop proof views.
- Mobile deadline disclosures.
- Compliance monitoring at desktop and mobile widths.
- Trust Center before and after chain verification.
- Light and dark themes.
- All six demo-guide steps.
- All four demo-lab showcase cards.
- Resolve and Link evidence dialogs.
- Light hover, focus target, and title behaviour.
- Axe scans on the mobile proof view, Trust hover state, and dark proof/Trust states. The dark proof scan reported only the same deadline label mismatch; the dark Trust scan reported no violations.

Not tested:

- Full WCAG conformance or a screen-reader session.
- `320px` width, `200%` zoom, forced-colors mode, or high-contrast mode.
- Complete keyboard traversal of every route.
- Reduced-motion behavior beyond the demo's existing animation settings.
- Firefox and Safari.
- Connected/Supabase mode; this audit covers demo mode only.
- Interactions that mutate stored demo data beyond the inspected correction flow.

The app is being edited concurrently by other workers. Findings refer to the source and build observed during this audit; line numbers may shift.

## Reproduction setup

The demo server was already running at `http://127.0.0.1:5174`. To recreate it:

```powershell
npm run dev -- --port 5174
```

The audit used:

- Playwright with the installed Chrome channel, headless.
- axe-core from `node_modules/axe-core/axe.min.js`.
- Desktop `1450x1000` and mobile `390x844`.
- Query-busting URLs such as `?s=N#demo-lab` because hash-only navigation does not reload the SPA.

Captured evidence for this run:

- `C:\Users\amanb\AppData\Local\Temp\opencode\judge-audit\focus2\`
- `C:\Users\amanb\AppData\Local\Temp\opencode\judge-audit\focus3\`

Those directories are temporary and are not part of the repository. The report records the measured values and source causes so the findings can be re-created without them.

## Recommended order

1. Fix the light-theme hover foreground and re-scan every secondary control.
2. Constrain the mobile deadline panel and verify the proof case at `390px` and `320px`.
3. Correct the action-card copy so the institution’s correction actions match the card.
4. Make the mobile obligations table keyboard-scrollable and expose the action column.
5. Add route-specific titles and focus or announce route changes.
6. Fix the deadline summary’s accessible name.
7. Give the two complementary landmarks unique names.
