# Landing page: evidence review in motion

Purpose: explain Clauseway's evidence-review workflow and let visitors enter the synthetic workspace. The primary action is opening the demo. The supporting detail is one illustrative review, its document versions and the human review record.

Replace the disconnected case cards, tiny type, unused route graphics and duplicate feature-card groups. Keep the working application and its backend unchanged. A focused LandingJourney component replaces the existing animation timers and cards; it adds no dependency.

References inspected: Prompt Motion's UI-state morphing example and per-simmons/clone-app-pat-pro-public's inspect/measure/verify method. The repository is used as a reference workflow, not installed or executed. Its Claude-specific orchestration and whole-site cloning are outside this targeted change. This is an original Clauseway adaptation, not a pixel copy of the reference video.

Motion sequence: evidence flagged -> replacement awaiting review -> human review recorded. Keep a single persistent document surface, restrained position/opacity/radius transitions and a moving step indicator. The final frame represents a claim review, not application approval. Provide pause/play, replay and keyboard-selectable steps. Reduced motion disables automatic playback; hidden/offscreen content pauses. Never change actual application data from the illustration.

Validation: desktop/tablet/mobile layouts, light/dark contrast and accessibility, pause/replay/keyboard/reduced-motion behavior, measured typography/control dimensions, existing application journeys, both builds and unit/SQL tests. Record the measured reference and implementation values with their provenance.

Completed: 171 unit/PGlite tests and 50 browser checks pass. Both builds pass. The illustration loads separately, uses local assets, pauses offscreen or for keyboard reading, and generates no case-data writes. Measurements are in `docs/landing-measured-styles.json`; reference limits are in `docs/landing-motion-references.json`. Backend code and migrations are unchanged.
