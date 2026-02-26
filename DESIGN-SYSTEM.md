# Design System — Mastery Tracker

> Opinionated design system for a dark-mode iOS fitness/mastery tracking app.  
> Built for React Native + Expo. Every choice is final — no "consider" or "maybe."

---

## 1. Design Audit Summary

### What Makes Premium Apps Feel Premium

After auditing Robinhood, Kalshi, Claude, Strava, Runna, Apple Fitness+, and Nike Run Club, five patterns separate "feels expensive" from "feels like a homework project":

1. **Depth through darkness.** Premium dark modes aren't `#000000`. They use layered grays (`#0A0A0F` → `#141420` → `#1C1C2E`) that create spatial depth without borders. Robinhood and Apple Fitness+ nail this — cards float above backgrounds through subtle luminance shifts, not outlines.

2. **Typography does the heavy lifting.** Nike Run Club's giant "5:42" pace number, Robinhood's portfolio balance — these apps let numbers be the hero. They use extreme scale contrast: 40-60pt for the primary metric, 12-13pt for labels. The ratio between "big number" and "label" is at least 3:1.

3. **Color is information, not decoration.** Robinhood's green/red. Strava's orange for effort. Runna's zone colors. Premium apps have 1-2 accent colors max for brand, then use color semantically — it means something. Apps that splash color everywhere feel cheap.

4. **Animations communicate state, not personality.** Robinhood's chart scrubber with haptic ticks. Apple's ring fill animation. These aren't decorative — they confirm "yes, your input registered" or "here's your progress." The best micro-interactions are ones you'd miss if they were gone.

5. **Generous whitespace signals confidence.** Claude.ai is the masterclass here. Massive padding, no cramming. When an app isn't afraid of empty space, it communicates "we know exactly what matters." Cramped layouts scream "we couldn't prioritize."

### Per-App Key Takeaways

| App | Steal This | Avoid This |
|-----|-----------|------------|
| **Robinhood** | Chart interaction + haptics, card layering, big hero numbers | Overwhelming options density on trading screens |
| **Kalshi** | Clean dark card design, real-time data badges, subtle borders | Over-reliance on tables for mobile |
| **Claude** | Typography scale, whitespace, empty states, input UX | Too minimal for data-heavy screens |
| **Strava** | Activity feed cards, map integration, stat grids | Orange overuse, dated iconography |
| **Runna** | Color-coded run types, training plan timeline, zone indicators | Can feel overwhelming with too many plan details |
| **Apple Fitness+** | Ring animations, vibrant accent on dark bg, activity cards | Requires Apple ecosystem thinking |
| **Nike Run Club** | Celebration screens, bold type, post-run summary layout | Sometimes too "branded" — heavy Nike identity |

---

## 2. Recommended Design System

### Color Palette

```
// backgrounds (layered depth)
bg.primary:     #09090F    // deepest — screen background
bg.secondary:   #12121E    // card background
bg.tertiary:    #1A1A2E    // elevated cards, modals
bg.quaternary:  #242438    // input fields, pressed states

// text hierarchy
text.primary:   #F0F0F5    // headings, big numbers (not pure white — easier on eyes)
text.secondary: #A0A0B8    // body text, descriptions  
text.tertiary:  #5C5C72    // labels, timestamps, disabled
text.inverse:   #09090F    // text on bright backgrounds

// accent — ONE primary accent, period
accent.primary:    #6366F1  // indigo-500 — main brand, buttons, active states
accent.primaryMuted: #6366F120  // 12% opacity — subtle backgrounds

// semantic colors
semantic.success:  #22C55E  // green-500 — positive scores, completed
semantic.warning:  #F59E0B  // amber-500 — mediocre scores, needs attention  
semantic.danger:   #EF4444  // red-500 — low scores, missed days
semantic.info:     #3B82F6  // blue-500 — informational

// pillar colors (each pillar gets ONE color)
pillar.quantFinance:  #8B5CF6  // violet — math/finance
pillar.macroInvest:   #06B6D4  // cyan — global/macro  
pillar.mlMath:        #F97316  // orange — ML/research
pillar.aiEngineering: #22D3EE  // light cyan — engineering
pillar.publicSpeaking:#EC4899  // pink — communication

// special
chart.line:     #6366F1
chart.fill:     #6366F110    // 6% opacity gradient fill
border.subtle:  #FFFFFF08    // 3% white — barely visible card edges
border.focus:   #6366F140    // focused input border
```

**Rule: Never use more than 2 non-semantic colors on any single screen.**

### Typography

**Font: Inter** (via `@expo-google-fonts/inter`)

Inter is the correct choice. It's designed for screens, has excellent number rendering (critical for a data app), supports tabular figures (numbers align in columns), and has a complete weight range.

```
// Scale (size / lineHeight / weight / letterSpacing)
display:    48px / 52px / 700 / -1.5    // hero metrics ("87%", "5:42")
title1:     28px / 34px / 700 / -0.5    // screen titles
title2:     22px / 28px / 600 / -0.3    // section headers
title3:     18px / 24px / 600 / 0       // card titles
body:       15px / 22px / 400 / 0       // primary body text
bodyBold:   15px / 22px / 600 / 0       // emphasized body
caption:    13px / 18px / 500 / 0.2     // labels, timestamps
micro:      11px / 14px / 600 / 0.5     // badges, tags (ALL CAPS)
```

**Rules:**
- Hero numbers ALWAYS use `fontVariant: ['tabular-nums']` — numbers must not jump around
- Labels are ALWAYS `text.tertiary` + `caption` or `micro` size
- Never use `fontWeight: 300` or lighter — looks anemic on OLED

### Card Styles

**Choice: Subtle border + slight elevation. No glassmorphism. No heavy shadows.**

Glassmorphism is a trend that's already aging. Subtle borders with luminance-based depth is timeless (see: Robinhood, Linear, Vercel).

```typescript
const card = {
  primary: {
    backgroundColor: '#12121E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.03)',  // barely visible edge
    padding: 20,
  },
  elevated: {
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    padding: 24,
    // subtle shadow for modals/overlays only
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
  },
  interactive: {
    // same as primary, but with:
    // - scale(0.98) on press (Reanimated spring)
    // - borderColor transitions to accent on press
  }
};

// Border radius scale
radius.sm:   8    // tags, badges, small buttons
radius.md:  12    // input fields, small cards
radius.lg:  16    // standard cards
radius.xl:  20    // modals, bottom sheets
radius.full: 999  // pills, avatars

// Spacing scale (8px base)
space.xs:    4
space.sm:    8
space.md:   16
space.lg:   24
space.xl:   32
space.2xl:  48
```

### Animation Library

**Choice: `react-native-reanimated` v3 + `expo-haptics`**

Do NOT add Moti (unnecessary abstraction over Reanimated). Do NOT add Lottie unless you have designer-made animations (Lottie without a designer = generic garbage).

Reanimated v3 gives you:
- `withSpring()` for all interactive feedback (card press, tab switch)
- `withTiming()` for progress fills and chart animations  
- `useAnimatedStyle()` for performant 60fps animations on UI thread
- Layout animations for list item enter/exit

Spring config for "premium feel":
```typescript
const SPRING_CONFIG = {
  damping: 15,
  stiffness: 150,
  mass: 0.5,
};
// This gives snappy but not robotic movement — similar to iOS system springs
```

### Chart Library

**Choice: `victory-native` v41+ (uses `react-native-skia` under the hood)**

Why not alternatives:
- `react-native-chart-kit` — dated, limited customization, ugly defaults
- Custom SVG — too much work for line/bar charts, save for radar charts only
- `react-native-skia` raw — great but you'll spend weeks on chart math

Victory-native gives you Robinhood-style interactive line charts with:
- Gesture-based scrubbing (pan to see values at any point)
- Smooth animated transitions between data ranges
- Full dark-mode theming
- Gradient fills under line charts

**Exception: Build the Radar Chart (pillar visualization) with `react-native-skia` directly.** It's a unique visualization that no library handles well, and it's your signature component.

### Component Patterns

#### Tab Bar
```
Style: Custom tab bar (don't use default React Navigation tab bar)
Background: bg.primary with top border (border.subtle)
Icons: SF Symbols via expo-symbols (iOS) / Material Icons fallback
Active state: accent.primary icon + label, with a subtle pill background (accent.primaryMuted)
Inactive: text.tertiary
Animation: Icon does a subtle scale spring (1.0 → 1.15 → 1.0) on tap
Haptic: Haptics.impactAsync(ImpactFeedbackStyle.Light) on every tab switch
Height: 83px (safe area aware)
```

Tabs: **Dashboard** (grid icon) · **Check-In** (plus-circle) · **Progress** (trending-up) · **History** (clock)

#### Stat Cards (Big Numbers)
```
Layout:
┌──────────────────────────┐
│  RECOVERY SCORE     ···  │  ← micro label (text.tertiary) + menu dots
│  87%                     │  ← display size, colored by semantic value
│  ▲ 12% vs last week     │  ← caption, semantic.success with up arrow
│                          │
│  ████████████░░░  87/100 │  ← thin progress bar (4px, rounded)
└──────────────────────────┘

The number color changes based on value:
- ≥ 80: semantic.success
- 50-79: semantic.warning  
- < 50: semantic.danger

Animate the number counting up from 0 on mount (Reanimated interpolation, 800ms).
```

#### Progress Indicators
```
Primary: Thin horizontal bar (4px height, radius.full corners)
  - Track: bg.quaternary
  - Fill: accent.primary (or semantic color based on context)
  - Animate fill width with withTiming(value, { duration: 1000 })
  
Ring/Circle: For daily completion and streaks
  - Use react-native-skia for custom ring (Apple Fitness+ style)
  - 6px stroke width, rounded caps
  - Animate with Reanimated's useSharedValue driving Skia path
  - Ring color = accent.primary; track = bg.quaternary
```

#### Chat Bubbles (AI Evaluation)
```
AI messages:
  - bg.secondary background
  - 16px border radius (top-left: 4px for "tail" effect)
  - text.primary for content
  - Left-aligned, max-width 85%
  - Subtle typewriter animation for AI responses (15ms per character)

User messages:
  - accent.primary background  
  - text.inverse for content
  - Right-aligned, max-width 85%
  - 16px border radius (top-right: 4px)
  
Score callouts within AI messages:
  - Inline pill badges: semantic color bg at 15% opacity, semantic color text
  - e.g., "Your depth score: [  7/10  ]" where the pill is green-tinted
```

#### Run Tracking Overlay
```
Layout: Full-screen map with bottom sheet

Bottom sheet (persistent, draggable):
  ┌─────────────────────────────┐
  │  5:42          3.2 mi       │  ← display size, two columns
  │  PACE          DISTANCE     │  ← micro labels
  │                             │
  │  ♥ 156 bpm    23:14         │  ← title3 size
  │  HEART RATE   ELAPSED       │  ← micro labels
  │                             │
  │     [ ⏸ PAUSE ]   [ 🏁 ]   │  ← large circular buttons
  └─────────────────────────────┘

Map overlay:
  - Dark map style (Mapbox dark or Google dark)
  - Route line: accent.primary, 4px width
  - Current position: pulsing dot (accent.primary + animated opacity ring)
  - Stats update every second with number roll animation

Haptics: Haptics.notificationAsync(Success) on each km/mile split
```

#### Celebration / PR Screens
```
Full-screen overlay with:
  - Background: gradient from accent.primary (20% opacity) → bg.primary
  - Giant emoji or icon at top (🏆, 🔥, ⚡)  
  - "NEW PERSONAL RECORD" in micro style (letter-spacing: 3)
  - The metric in display size, white
  - Confetti: Use react-native-skia particles (NOT a Lottie file)
    - 40-60 small rectangles/circles in pillar colors
    - Physics: gravity + random horizontal velocity
    - Duration: 2.5 seconds
  - Haptic: Haptics.notificationAsync(Success) on reveal
  - Auto-dismiss after 4 seconds or tap to dismiss
  
Trigger celebrations for:
  - Streak milestones (7, 14, 30, 60, 90, 180, 365 days)
  - New high scores on any pillar
  - First check-in of the day (subtle — just a small spring animation)
  - Completing all 5 pillars in one day
```

### Haptic Feedback Patterns

```typescript
import * as Haptics from 'expo-haptics';

// Tab switch, toggle, small button press
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

// Card press, important button tap
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

// Submit check-in, complete action
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

// Success (PR, streak milestone, good score)
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

// Warning (mediocre score, missed day)
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

// Error (validation failure)
Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

// Chart scrubbing (Robinhood-style) — on each data point while panning:
Haptics.selectionAsync();

// Slider/rating changes (1-10 scale):
Haptics.selectionAsync();  // on each step
```

**Rule: Every user-initiated interaction gets haptic feedback. No exceptions.**

### Loading States & Skeleton Screens

```
Never use spinners. Ever. Spinners are 2015.

Skeleton screens:
  - Same layout as loaded content
  - Placeholder shapes use bg.tertiary
  - Shimmer animation: linear gradient sweep (left → right, 1.5s, infinite)
    - Colors: bg.tertiary → bg.quaternary → bg.tertiary
  - Implemented with Reanimated translateX on a LinearGradient mask

Pull-to-refresh:
  - Custom indicator matching brand (not default iOS spinner)
  - Subtle scale animation on the page content
  
Optimistic updates:
  - Check-in submission shows immediately in history
  - AI evaluation shows typing indicator (3 pulsing dots) then streams in
```

### Micro-Interactions to Implement

| Interaction | Animation | Haptic |
|-------------|-----------|--------|
| Card press | `scale(0.97)` spring, 150ms | Light impact |
| Button press | `scale(0.95)` spring + opacity 0.8 | Medium impact |
| Tab switch | Active icon springs up, badge scales in | Light impact |
| Check-in submit | Card slides up and fades out, success checkmark scales in | Heavy impact → Success notification |
| Score reveal | Number counts up from 0 over 800ms | Selection on each "tick" |
| Streak counter | Each flame/number pops with staggered spring (50ms delay) | Light impact per item |
| Pull to refresh | Content scales to 0.97 then springs back | Light impact on release |
| Swipe to delete | Row slides left, red bg reveals, snap-back spring | Medium impact |
| Chart pan | Value tooltip follows finger, data point highlighted | Selection per point |
| Rating slider | Thumb follows with spring, track fills with color | Selection per step |

---

## 3. Before/After Mockup Descriptions

### Dashboard Screen

**Before (current):**
Generic flat list of stats, default React Navigation header, no visual hierarchy, all text same size, probably light gray cards on dark background.

**After:**
- No header bar — screen starts with a greeting: "Thursday, Feb 26" in `caption` style, "Good morning, Justin" in `title1`
- Below: Daily ring (Apple Fitness+ style) showing check-in completion — large, centered, animated on mount
- Stat cards grid (2 columns): Current streak (🔥 + display number), Weekly depth score, Pillar breakdown (mini radar chart in a card), Today's AI verdict (one-line summary)
- Each card uses `card.primary` style, subtle entry animation (fade up + spring, staggered 50ms)
- Bottom: "Last 7 Days" mini bar chart showing daily scores
- Everything breathes — generous 24px gaps between cards, 48px from screen edges to first content

### Check-In Screen

**Before:** Long form with labels, text inputs, maybe dropdowns. Feels like filling out a tax form.

**After:**
- Full-screen dark background, no card wrapper (the screen IS the card)
- Top: "What did you work on?" in `title2`, with a large multi-line text input below (bg.quaternary, 16px radius, 20px padding, placeholder in text.tertiary)
- Smart suggestions appear as pills below input as you type (pillar tags, auto-detected)
- Time picker: horizontal scroll of preset durations ("30m", "1h", "1.5h", "2h", "3h+") as pill buttons, custom input available
- Depth & Energy: custom slider with haptic steps, filled track in accent.primary, large thumb
- Key takeaway: single-line input with character counter
- Submit button: full-width, accent.primary bg, "Log Today" in `bodyBold` + text.inverse, 56px height, 16px radius
- On submit: button morphs into checkmark, entire form slides out, celebration micro-animation

### Progress Screen

**Before:** Maybe a basic line chart and some numbers.

**After:**
- Top: Time range selector (pill buttons: "1W", "1M", "3M", "6M", "1Y", "All") — horizontally scrollable
- Hero section: Radar chart (pentagonal) showing all 5 pillars, animated draw-on-mount, colored by pillar colors, with previous period shown as ghost overlay
- Below: Interactive line chart (Victory-native) showing composite score over time
  - Gradient fill under line (accent.primary → transparent)
  - Pan to scrub with haptic feedback per data point
  - Value tooltip follows finger
- Pillar breakdown: 5 horizontal cards, each with:
  - Pillar color dot + name + current level
  - Thin progress bar showing depth vs target
  - Sparkline (tiny 7-day trend)
  - Tap to expand into full pillar detail
- Weekly heatmap (GitHub contribution-style): 52 columns × 7 rows, colored by check-in depth

### History Screen

**Before:** Flat list of dates and text.

**After:**
- Grouped by week with section headers ("This Week", "Last Week", "Feb 10-16")
- Each entry is a card:
  ```
  ┌────────────────────────────────┐
  │  Mon, Feb 24           8/10 ●  │  ← date + score dot (colored)
  │  "Studied vol surfaces..."     │  ← truncated key takeaway  
  │  ◆ Quant  ◆ ML  ·  2.5h      │  ← pillar pills + time
  └────────────────────────────────┘
  ```
- Score dot uses semantic colors (green/yellow/red)
- Tap to expand: shows full entry + AI evaluation inline
- Empty days shown as subtle gap with "No check-in" in text.tertiary
- Streak visualization at top: horizontal scroll of day circles (filled = checked in)

### Run Screen

**Before:** Basic map with text overlay.

**After:**
- Full-bleed dark map (edge to edge, no safe area padding on map)
- Floating stats panel at bottom (bottom sheet, `card.elevated` style)
- Pre-run: Shows planned route (if any), weather, estimated time
- During run: Live stats grid (pace, distance, HR, elapsed), pulsing current-location dot
- Post-run: Summary card slides up with big stats, mini map of route, splits table, pillar tagging prompt, celebration if PR

---

## 4. Priority Implementation Order

Ranked by **impact-to-effort ratio** (what makes it feel premium fastest):

### Tier 1: Immediate (1-2 days each, massive feel improvement)

1. **Color system overhaul** — Replace all hardcoded colors with the palette above. Single biggest improvement. Create a `theme.ts` constants file, search-and-replace everything.

2. **Typography scale** — Install Inter font, create text component presets, apply display size to hero numbers. Big numbers = instant premium.

3. **Card style update** — Apply the card system (subtle borders, correct radius, correct padding). Remove any shadows that look like `elevation: 5` Android defaults.

4. **Haptic feedback everywhere** — Add `expo-haptics` to all interactive elements. Takes an hour, transforms the feel immediately.

### Tier 2: This Week (2-4 days each, significant polish)

5. **Custom tab bar** — Replace default React Navigation tab bar with custom component. Add the icon spring animation and haptic feedback.

6. **Skeleton loading screens** — Replace all loading spinners with skeleton screens. Shimmer animation with Reanimated.

7. **Stat card animations** — Number count-up animation on mount, staggered card entry animations.

8. **Interactive line chart** — Swap to Victory-native with pan scrubbing and haptic ticks.

### Tier 3: Next Week (3-5 days each, delight layer)

9. **Celebration screens** — PR and streak milestone celebrations with Skia confetti particles.

10. **Radar chart** — Custom Skia radar chart for pillar visualization with animated draw.

11. **AI chat improvements** — Typewriter effect, styled score callouts, better bubble design.

12. **Run tracking overlay** — Dark map style, floating stats panel, pulsing location dot.

### Tier 4: Ongoing Polish

13. **Pull-to-refresh custom indicator**
14. **Weekly heatmap visualization**  
15. **Swipe-to-delete with spring physics**
16. **Optimistic updates for check-in submission**

---

## Dependencies to Install

```bash
# Core animation & rendering
npx expo install react-native-reanimated
npx expo install @shopify/react-native-skia
npx expo install expo-haptics

# Charts
npm install victory-native

# Typography
npx expo install @expo-google-fonts/inter expo-font

# Navigation enhancement  
npm install @react-navigation/bottom-tabs  # (likely already installed)

# Map (if not already)
npx expo install react-native-maps
```

---

## Non-Negotiable Rules

1. **No light mode.** Dark only. Don't waste time on theme switching.
2. **No spinners.** Skeleton or nothing.
3. **No default React Navigation chrome.** Custom everything.
4. **Haptics on every touch.** No silent interactions.
5. **Numbers are the UI.** If a screen has a key metric, it's `display` size or you're doing it wrong.
6. **One accent color.** Indigo. Pillar colors are the only exception.
7. **Inter font only.** No mixing fonts. Consistency > variety.
8. **8px spacing grid.** Every margin and padding is a multiple of 8 (4 allowed for tight spots).
9. **16px standard border radius.** Not 10, not 15, not 20 (except modals at 20).
10. **Animate state changes.** If a value changes, it transitions. Never jump-cut.
