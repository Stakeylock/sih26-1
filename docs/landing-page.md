# Landing page and motion

The landing page uses one persistent document surface to illustrate an evidence correction and human review. It does not alter a case or depict automatic application approval. The primary action opens the existing demo; the guided-tour action retains the existing tour.

`src/ui/Welcome.tsx` owns the page layout and copy. `src/ui/LandingJourney.tsx` owns three illustration states and bounded playback. `src/ui/landing.css` scopes the page's tokens and motion independently of the working application. The illustration is a separate bundle, with no added dependency or third-party runtime asset.

Each state remains for 4.4 seconds. Container transitions take 450–500 ms, and content enters with opacity and a small vertical translation. The user can pause, resume, replay or select a step. Arrow keys, Home and End navigate the steps. Focusing the document or step controls pauses playback. Reduced motion disables automatic playback and CSS motion. Visibility changes and an intersection observer suspend offscreen/background playback.

The reference was [Prompt Motion's UI-state morphing example](https://prompt-motion.com/twoclipping-5cba86). The approach adapts [clone-app-pat-pro's inspect/measure/verify method](https://github.com/per-simmons/clone-app-pat-pro-public). Original React/CSS implements the FlowPilot story; the reference video, audio and repository code are not embedded or copied. Measurements distinguish the reference player/page from the encoded animation itself.

Validation includes full light/dark accessibility and contrast checks at 390, 768 and 1450 pixels, measured style assertions, playback and keyboard behavior, offscreen suspension, local-only assets and unchanged case data. The existing workflow, governance and audit journeys also pass. This UI change does not revalidate live Supabase or claim production readiness.
