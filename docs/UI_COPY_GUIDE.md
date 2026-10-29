# UI copy guide

Adapted from the copy guide adopted in `github.com/example/sih_2026`, rewritten to match how
Clauseway already writes. This records existing convention; it does not introduce a new voice.

Clauseway is a synthetic prototype. Copy has one job: tell an officer or an institution what is
true right now and what they can do next.

## 1. Sentence case

Capitalise the first word and proper nouns only. No title case, no all-caps labels.

- Do: `Escalation desk`, `Case ageing`, `No escalations`
- Don't: `Escalation Desk`, `ESCALATION QUEUE`

`engineering conventions` also forbids decorative template language — eyebrows, numbered section headings,
generic explanatory subtitles, repeated slogans. If a line carries no information, delete it
rather than shorten it.

## 2. Name the action

Buttons, tabs and links name the action they perform. Avoid `Submit`, `Continue`, `OK`, `Next`
when a specific verb exists.

- Do: `Inspect case`, `Mark read`, `Open full dossier`, `Replay illustration`
- Don't: `Proceed`, `Click here`, `Manage`

Every action label should survive being read on its own, out of context.

## 3. A confirmation reuses the action verb

The message after an action repeats what was done, in the same words.

| Action taken | Confirmation |
| --- | --- |
| `Mark read` | `Notification marked as read.` |
| `Adopt policy notice` | `Policy notice adopted.` |

Add one line of consequence when it helps:

> **Deficiency raised**
> The institution can now respond with the requested document.

Never `Success!`, `Done` or `Saved successfully`. Those do not say what changed.

## 4. Errors say what went wrong and what to do next

Every error carries three things: what failed, why it failed if known, and the next action.

- Do: `The file must be 10 MB or smaller.`
- Do: `The grant for this region has expired, so the case cannot be reassigned.`
- Don't: `Invalid input`, `Something went wrong`, `Error 422`

If the cause is genuinely unknown, give the next action: `The document could not be uploaded.
Check the file size and try again.`

## 5. Never claim officialdom

This is the hard rule, and it comes from `docs/engineering conventions` and the repository README.

- Do not write `official`, `authoritative`, `regulatory determination` or `approved by` anywhere
  the user could read it as a statement about a real authority.
- Do not fabricate official seals, signatures, reviewer identities or decision outcomes.
- Wording like *"This is an official compliance notification dispatched from the AICTE Flow
  Approval & Monitoring Engine"* is prohibited. Clauseway is explicitly **not** an official AICTE
  service. The only permitted uses of `AICTE` are the disclosure sentences themselves and the
  handbook title in `src/domain/aph.ts`.

**Route display copy through `neutralCopy`** (`src/domain/presentation.ts`), which maps
`Clauseway` → `Clauseway`, `AICTE` → `Institutional Review`, `Government` → `Public`. Raw HTML,
email bodies, SMS payloads and PDF text are built outside React — they must be neutralised at the
source, because `neutralCopy` never sees them.

## 6. Disclosures stay visible, not apologetic

Demo and synthetic disclosures must remain **accessible and explicit at decision points**
(`engineering conventions`, integrity rules). Write them as facts, not as fine print.

Existing forms worth reusing rather than reinventing:

- `SIH26262 prototype. Synthetic cases only. / No real institutional data or approval decisions.`
- `APH clause text verified against the {title} held in docs/reference. The document-to-clause
  mapping is ours, and these are not official AICTE determinations.`
  (This replaced *"APH references are synthetic demonstration citations from {edition}"* on
  29 Oct 2026, after the six `APH_CLAUSES` entries were checked line-by-line against
  `docs/reference/APH_2024-27.txt` and corrected — see `docs/open questions` OQ-02. Keep the
  **not official AICTE determinations** half: accuracy of a citation is not authority to cite it.)
- `Synthetic demonstration draft. … A permitted human reviewer must verify the captured facts …`

Prefer one clear sentence at the point of the action over a banner repeated on every card.

## 7. Do not dress up unavailable actions

`engineering conventions` prohibits making unavailable actions appear functional. If a control cannot run:

- Disable or omit it, and
- Say the unmet condition next to it, in one line.

`Use Preview as in the top bar to test a role boundary.` is the pattern. A greyed button with no
explanation is worse than no button.

## 8. Advisory and prediction language

Analysis surfaces are advisory and must stay that way in prose too.

- Do: `ranked for reviewer attention`, `what-if analysis`, `flagged for re-review`
- Don't: `will be approved`, `risk score predicts the outcome`, `the model decided`

Every advisory surface carries its disclaimer; do not summarise one away in a tooltip.

## 9. Localise pairs, not fragments

Copy is written as `t('English.', 'हिंदी.')` through `makeT` in `src/ui/i18n.ts`. Both strings ship
together — never add an English-only call with an empty Hindi string on a user-visible surface.
Role names come from `roleLabels` / `roleLabelsHi` in `src/domain/model.ts` and
`src/ui/i18n.ts`; do not hard-code role names inline.

## 10. Numbers

- Use `String(x).padStart(2,'0')` for counters shown as `03`.
- `en-IN` for dates and numbers: `toLocaleDateString('en-IN')`, `toLocaleString('en-IN')`.
- Use a number only where sequence or reference actually matters.

---

## Checklist before shipping a screen

- [ ] Sentence case; no eyebrow, no slogan, no decorative subtitle.
- [ ] Every button names its action.
- [ ] Confirmation reuses the action verb; no `Success!`.
- [ ] Every error states cause and next action.
- [ ] No claim of officialdom anywhere, including raw HTML, email and SMS paths.
- [ ] Display copy passes through `neutralCopy`.
- [ ] Disclosure present and readable at the decision point.
- [ ] Disabled controls explain the unmet condition.
- [ ] Advisory wording intact on analysis surfaces.
- [ ] English and Hindi strings both present.
