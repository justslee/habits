# Habits — liquid design exploration

September 10, 2026. Interactive concept, using sample data. The app’s production screens and services are not changed by this exploration.

## The direction

Keep Habits personal and editorial. Preserve Instrument Serif, the quiet violet accent, and the six destinations in the revised order: Daily, North Star, Train, Speak, Food, Me. Pair that identity with softer surfaces, a small amount of sculptural depth, and motion tied to the action being performed. The prototype explores DM Sans for supporting interface text; keeping the existing Inter in production is also a reasonable choice.

Two appearances share the same design: **Ink**, close to the current app’s atmosphere; and **Pearl**, a warmer, lighter alternative. The default follows device appearance. Compare them using the preview’s design controls or Me → Appearance. The revised controls offer quieter motion, an immersive or compact aurora header, and visual haptic cues.

References reviewed:

- [SceneAI](https://sceneai.art/), including its Kova mobile preview: atmospheric imagery, generous typography, and a restrained focal point. Borrow the sense of depth, rather than its full-screen cinematic treatment for every task.
- [60fps’s Miles bottom-sheet example on X](https://x.com/60fpsdesign/status/1866177294563500085): a compact surface opens into an expanded task without losing the surrounding context.
- [MarceloDesignX’s motion exploration on X](https://x.com/MarceloDesignX/status/2010827847435157833): an additional reference for subtle depth and purposeful motion. Its indexed description informed this exploration; the post’s video was not inspected.

## What changes

| Area reviewed | Proposed experience |
| --- | --- |
| Daily’s agenda, quote, compounding hero, habits, and tasks compete for attention | Focus Daily on the next workout action, rituals, and one meaningful task. Keep compounding analysis in North Star, one tap away in the second tab. Agenda and quote remain available in the eventual implementation; their detail views are outside this revision. |
| The first North Star concept removed too much information | Restore Vision, Discipline, and Compound. Use a photographic aurora header, followed by the existing information with clearer hierarchy. Preserve all five pillars, their full targets, and anti-goals. |
| Six icon-only tab destinations | Retain all six; add short labels and a continuously sliding selection background. North Star is abbreviated to North in the compact dock, with its full accessible name. |
| Training has Today, Week, Program, and History segments | Keep Today, Week, Program, and History as primary segments. Program retains its phase timeline, lighter weeks, tournament timing, session templates, mobility, and weekly log. Today opens into inline weight, rep, set, and rest controls. |
| Food spans Home, Pantry, Deck, Plan, Bags, Carts, Spend, Calendar, Recipes, and Stores screens | Keep one coherent journey: pantry → meal deck → coverage → store comparison → cart review. Show the current stage and a useful back action. Present secondary details in sheets. |
| Assistant access varies by feature | Use one consistent assistant entry above navigation, with context supplied by the current tab. Speak remains a separate destination for longer conversations and practice. |
| Preference weights appear as numeric feature chips | Explain preferences in human terms. A skip should be a light, reversible signal; a permanent exclusion should require an explicit preference. |

The Food prototype models 14 days minus 3 travel days and 2 eating-out days: 9 eating days. At two planned meals per day, that is 18 servings. Three sample recipes yielding six servings each meet the target. The deck stops at coverage; nine eating days do not imply nine different recipes. Production coverage must use actual recipe yield, serving sizes, eating occasions, freezer capacity, and storage limits, rather than this fixed demonstration.

## Interaction rules

| Action | Shortcut | Visible alternative | Result |
| --- | --- | --- | --- |
| Complete a ritual | Horizontal swipe | Tap the ritual | Immediate completion with Undo |
| Change a ritual | Hold for 500 ms | Ellipsis | Options sheet |
| Fit training into a busy day | Hold the session | Adjust button | Draft time choice; apply explicitly; dismissing discards the draft |
| Choose a recipe | Swipe right to keep, left to skip | Yes, please / Not this time | Card follows the gesture; selection updates coverage; Undo restores the last choice |
| Inspect a recipe or store | Tap its details | Labeled detail action | Sheet or the relevant flow stage |
| Dismiss a sheet | Drag the handle down | Close, Escape | Returns to the previous context |
| Approve a purchase | No gesture shortcut | Review payment approval, then device authentication | Separate, deliberate approval for one reviewed basket |

Motion should begin with the touch, rather than play independently. The refined prototype uses roughly 190 ms for a released recipe card, 220–240 ms for selection movement, and 260 ms for opening a sheet. These are starting points for native tuning, not verified native performance measurements. Honor Reduce Motion, preserve readable opaque text surfaces, and keep at least 44-point effective native touch targets. Provide VoiceOver actions and button equivalents for every gesture.

## Payment is a product boundary

The prototype deliberately separates building a cart, reviewing the exact basket and total, and approving payment. Its final button explicitly simulates device approval; it neither invokes Face ID nor places an order.

In the real app, visual confirmation must be backed by server enforcement: a short-lived, single-use approval bound to the merchant, basket version, delivery details, and exact approved total; atomic consumption and idempotency; an order-status check before any retry; and a new review when relevant details change. Authentication alone is not a purchase authorization. An unknown order result must not become an automatic second order. Store spending only from confirmed receipts, and reconcile refunds and adjustments separately.

The store totals, offers, recipe yields, nutrition, history, calendar entries, cart contents, and receipts in this concept are illustrative. They are not live quotes or verified recipe adaptations. The illustrated recipe covers are placeholders; the finished Food experience should use appropriately licensed source photography, with visible recipe attribution and verified ratings when available.

## Implementation sequence

1. **Foundation and Daily.** Extend `mobile/src/theme.ts` with semantic light/dark surfaces; refine `CustomTabBar.tsx`; establish shared action, gesture-row, and sheet components. Port Daily first and validate on a physical iPhone before broad rollout.
2. **Training.** Apply the shared sheet and motion patterns to `ProgramToday`, `AdjustDaySheet`, and the workout logger. Preserve the in-progress training changes already present in this checkout. Keep drafts separate from saved adjustments and maintain set/rest state when the user changes tabs.
3. **Food.** Retain existing API contracts while composing the Food screens into a coherent staged flow. Add coverage-first deck termination, editable pantry assumptions, travel confirmation, cart diffs, and clear receipt states. Replace sample quantities and offers with verified backend data before allowing checkout.
4. **Assistant and Speak.** Add the persistent contextual assistant entry; carry speaking history and existing practice modes forward; connect long-term priorities to concrete Daily actions. Give users direct control over remembered preferences. North Star and its compounding chart belong in the first design implementation, alongside Daily.
5. **Native QA and TestFlight.** Validate VoiceOver, Dynamic Type, Reduce Motion, keyboard behavior, one-handed reach, interruption recovery, and actual gesture performance. Roll out an isolated frontend prototype build before changing purchase workflows.

The repository already includes React Native Gesture Handler, Reanimated, Expo Haptics, SVG, Linear Gradient, and Local Authentication. Use the existing native stack for the eventual app work. The browser preview demonstrates interaction intent; it does not verify native haptics, biometric security, iOS animation performance, or backend authorization.

## North Star revision: beauty without losing the record

The original `NorthStarScreen.tsx`, `NSBrandHeader.tsx`, `NSCompoundChart.tsx`, `CompoundingHero.tsx`, and `InteractiveCompoundChart.tsx` informed this revision. The first concept is retained separately as `habits-liquid-v1.html` for comparison.

**Vision:** the full existing mantra, growth index, current and best streak, lifetime deep-work hours, five pillars with levels, progress and hours, full mastery targets, and all four anti-goals. A pillar opens a sheet with its subject areas and target sentence; one action opens that pillar in the chart. Targets can expand individually or together. Information moves into readable groups rather than being removed.

**Discipline:** today's grade and completion count, current/best/longest active streak, 30-day completion summary, per-habit totals and streaks, a 13-week activity map, a coaching nudge, and weekly review. The current day is explicitly in progress. Completion and logged activity are distinct measures.

**Compound:** 30D/90D/1Y/All, multiplier/percentage/equivalent-days units, Composite/Pillars/Forecast, reference comparison, velocity, current streak, one-year scenario, linked activity surfaces, six-month activity, and the last five deep-work entries. Series can be hidden independently. Date scrubbing has a keyboard-accessible slider; activity dates also open session detail.

**Chart placement:** The full graph lives in North Star. Daily prioritizes immediate action and does not repeat the chart. North Star is the second app tab and opens to Compound when entered from another destination. Its segments are Compound → Vision → Discipline. This makes progress easy to reach without consuming Daily's most valuable space. The preview opens on North Star to show the revised landing; Daily remains the first app tab. Chart range changes preserve the same baseline and never invent missing history. “Equivalent days” expresses growth in units of 1%-growth days, not elapsed time.

The aurora is reserved for North Star. Daily remains calm and useful, with the next action as its main visual. Vision gets the more immersive image; Discipline and Compound shorten the header to bring data closer to the thumb. The native tab dock should remain within the bottom safe area while content scrolls. This inline preview expands to show its contents rather than introducing a second nested phone scroll area.

### Aurora treatment

The preview uses an AI-generated photographic still. Its two layers drift gently on 17- and 22-second alternating cycles; the foreground text does not move. A dark image overlay preserves readability in both Ink and Pearl. Motion pauses offscreen, when the document is hidden, through the pause button, or under Reduce Motion. The optional compact framing reduces the image's height.

For the iPhone build, start with the still and restrained native transforms. If true aurora movement is preferred, use a licensed silent video loop with a matching still poster; pause it offscreen, during app inactivity, and under Reduce Motion or Low Power Mode. Keep the image cached locally. A video and Low Power Mode behavior are proposals, not features implemented in this browser mock. See the [image and exact generation prompt](assets/aurora-prompt.md).

### Gestures and proposed iPhone haptics

| Interaction | Gesture and visible alternative | Native feedback |
| --- | --- | --- |
| Change destination, North Star view, chart range or units | Tap. The North Star segment strip also accepts a horizontal swipe; the whole page does not. | One selection tick after the selection changes. |
| Inspect a chart date | Drag horizontally; use the visible slider or accessibility increment/decrement actions. Vertical scrolling takes precedence until horizontal intent is clear. | A subtle selection tick at date detents, throttled to roughly 70ms and omitted if the date has not changed. |
| Open a pillar | Tap or hold for approximately 500ms; full detail has a visible action to its chart. | A soft impact as the sheet opens. A recognized hold may lift the card slightly; no second tick for the same open. |
| Complete a ritual or keep a meal | Swipe past the commit threshold and release, or use the button. Undo stays available. | A light impact on the committed change. Undo uses selection feedback. |
| Adjust a session | Hold the session or tap Adjust. Changes remain drafts until Update. | Soft impact on opening; light impact after the adjustment is applied. |
| Dismiss detail | Drag the sheet handle down, or Close/Escape. Return focus to the invoking control. | Soft impact only when the sheet settles closed; none on each drag movement. |
| Finish a workout or confirm an order | Explicit action, with the existing purchase review and authentication boundary. | Success notification only after confirmed completion. An uncertain order result has no success cue. |

The existing Expo Haptics package provides selection, impact, and notification types, including Soft impact. This design adds Soft to the app's current wrapper when native implementation begins. Haptics are a complement to visible feedback and must not be required to understand the result. They may be unavailable because of device settings or system state. See [Expo Haptics](https://docs.expo.dev/versions/latest/sdk/haptics/) and [Apple's haptics guidance](https://developer.apple.com/design/human-interface-guidelines/playing-haptics).

Starting points for gesture tuning: 500ms hold; cancel a pending hold after about 9 points of movement; horizontal intent around 7–9 points; 65-point release threshold for a swipe or sheet dismissal. These are prototype values, not universal iOS recommendations. Validate with one hand on a physical phone. Gesture cancellation must restore the original visual and never commit. A swipe that changes the North Star segment must consume its following click. A moving chart or heatmap must not compete with page navigation.

Keep ordinary scroll, ambient aurora motion, and numerical updates silent. Use a short release animation for cards and a spring that settles quickly for sheets; do not add bounce to every interaction. Reduce Motion removes image drift and spatial flourish while preserving immediate state changes. Buttons and VoiceOver actions remain available for every gesture. Follow [Apple's gesture guidance](https://developer.apple.com/design/human-interface-guidelines/gestures/) and [accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility).

### Data fidelity before native rollout

The current chart code includes seeded illustrative series, while the North Star hero computes a multiplier from a value that can come from streak or lifetime hours. A visually convincing curve must not quietly be described as measured growth. Use a documented scoring model, one actual elapsed-time axis, and one authoritative series for the North Star chart and any future summaries. Keep projections labeled as scenarios; the preview band is not a confidence interval.

Connect pillar levels, progress, hours and targets to their real records. Derive completed days from actual habit completions, independently of session counts. The old “Running” tile used overall hours; this preview labels its corresponding surface “Deep work.” Restore a dedicated Running measure only when run-specific data exists. Preserve empty states when speaking or other sources have no records.

## Research-led refinement · September 10–11

This pass preserves the approved typography, Ink/Pearl palette, aurora, tab order, chart-only North Star, and Training Program. It refines the existing experience rather than changing the information architecture.

### References and decisions

- [Apple — Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/): navigation and content have different material roles. Keep readable, opaque content panels; use restrained highlights and depth in the navigation dock. The preview is a CSS interpretation, not Apple's native Liquid Glass implementation.
- [Apple — Get to know the new design system](https://developer.apple.com/videos/play/wwdc2025/356/): hierarchy, grouping, and continuity matter more than extra decoration. Bring the chart ahead of its less frequently used analysis controls; preserve the user's current context when a setting changes.
- [Emil Kowalski — 7 Practical Animation Tips](https://emilkowal.ski/ui/7-practical-animation-tips): immediate press feedback and fast easing make an interface responsive. Use slight compression on actions and quick selection movement. Avoid animating an element from zero size.
- [Emil Kowalski — Building a Drawer Component](https://emilkowal.ski/ui/building-a-drawer-component): direct manipulation, damped movement, velocity, and input handling make sheets feel natural. The preview now tracks the handle with the pointer, settles back after an incomplete drag, and dismisses after a sufficient drag or a deliberate flick. It ignores additional pointers during the gesture. Physical iPhone validation is still required.
- [Emil Kowalski — You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations): frequent actions should not incur ornamental delays. Routine state updates no longer replay a whole-screen entrance. Keyboard navigation is immediate. The aurora remains a controlled exception because an atmospheric North Star was explicitly requested.

These are applications of the references to Habits, not claims that the sources prescribe this exact layout. The existing X inspiration remains in the earlier notes; a fresh request for the Miles post returned 403, so this pass makes no new claim about that video's contents.

### What changed in the prototype

1. **Chart first.** Current growth and the date range precede the plot. Composite/Pillars/Forecast and units follow it, all still directly accessible. The chart appears earlier without removing data or introducing another menu.
2. **Continuity.** Date selection survives unit and analysis changes. North Star and Training selection highlights move between positions. The aurora's animation position survives ordinary North Star updates. Program phases and mastery targets retain their expanded state across relevant updates and navigation.
3. **Program at a glance.** Phase descriptions start folded so the seven-part journey is easier to scan. Every description remains available inline. The optional fifth-session control now looks like a switch while retaining a native checkbox and keyboard access.
4. **Sheets with physical feedback.** A handle drag follows the pointer. Releasing early returns the sheet; a 65px drag or a sufficiently fast downward release closes it. The closing presentation is inert and hidden from assistive technology; it cannot submit a duplicate action. Opening content remains opaque for legibility. Closing and opening a second sheet cancels the obsolete visual.
5. **Motion with restraint.** Selection settles in 220–240ms, screen context changes in 170ms, details expand in 210ms, and sheets open in 260ms. Reduced Motion and Quiet mode remove these spatial animations; keyboard actions skip them. Haptic annotations remain available through the preview controls but are off by default.

The payment review and explicit simulated approval flow are preserved. These changes do not implement native haptics, biometric authentication, or live orders.

## Validation history

Refinement-pass checks: the selected chart date survived unit and analysis changes; an expanded Program phase survived the optional-session change and leaving/returning to Program. A 15px handle drag returned the sheet to rest, while a 100px drag dismissed it without changing the workout. Selecting a draft duration and closing also left the saved 45-minute session unchanged. The Food flow still stopped at 18 servings; cancelling payment approval returned to review, and explicit simulated approval produced the sample receipt. Inspected the refined chart in Ink and Pearl at 360px outer width, Program in Pearl at 320px, and sheets at 736px. The narrow views had no horizontal overflow. Browser warnings and errors were empty. Gesture velocity thresholds, native haptics, and physical-device accessibility remain to be tested on iPhone.

The latest navigation decision makes North Star the second app tab, with Compound as its landing view and the first segment. Daily no longer includes a graph. Training retains Today, Week, Program, and History. Its expanded Program preview uses a static snapshot of `golf_program.py` and the information hierarchy in `ProgramOverview.tsx`, including all seven phases and five session templates. Phase details expand inline and remember their open state; session templates, tournament timing, mobility, and the weekly log open in sheets. The optional fifth-session setting updates the sample week. Tournament creation/removal, live weekly replanning, and log sharing remain existing native capabilities to preserve during implementation; this design preview does not reproduce those backend operations.

Latest checks: verified tab order and the second-tab selection indicator, Compound as the initial and returning North Star view, and no chart on Daily. Verified all four Training segments, seven phases, five sessions, expanding phase details, session detail, all seven mobility movements, and sample weekly log. Turning off Session 5 changes Friday to recovery in the sample week. Inspected Program in Ink at 736px and Pearl at 360px with no horizontal overflow, plus North Star and Daily at 320px. Browser logs were clear.

Checked in the browser: all six destinations; ritual tap and swipe completion with Undo; recipe swipe, skip, Undo, and stopping at 18 servings; a 30-minute workout reducing to four movements; inline set logging, rest, and next exercise; the Food journey through store choice and explicit simulated approval; sample receipt spending changing from $164.30 to $248.90; scripted Speak states; and North Star details.

Inspected Ink and Pearl appearances and layouts at 736, 360, and 320 CSS-pixel outer widths. At the narrowest inspected approval view, controls and text stayed within the mock’s horizontal bounds. Browser logs contained no errors or warnings during the exercised flows. Physical-device long-press timing, haptics, VoiceOver, and real authentication still require native validation.

Earlier North Star revision checks (before moving the chart off Daily): confirmed all five expanded targets, pillar detail → isolated pillar chart, Vision/Discipline/Compound navigation including a horizontal segment swipe, chart scrubbing by pointer and keyboard, range limits, all three units, forecast endpoint, hide/show including the all-hidden state, and preserved chart selection after resizing. Confirmed activity-date detail, weekly review, shared habit state, and the compact Daily chart. Inspected the aurora, pillar layout, and full chart in Ink, and Daily and forecast in Pearl; checked chart labels and controls at narrow widths. The final preview loaded without browser errors or warnings. The image pause control was exercised; Reduce Motion and background/offscreen pause paths were inspected in code. Native haptics and physical-device holds remain unverified.
