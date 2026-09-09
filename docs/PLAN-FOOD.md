# Plan — Food: two-week meal cycles, swipe-to-choose, bag building, guarded ordering

> Written 2026-09-08, revised the same day (decisions: Google Calendar, six tabs, spend tracking; deck stop rule and learning hardened).
> **Status 2026-09-09: F1–F6 shipped.** Backend under `/api/v1/food`, Food tab in the app. The browser adapters run in supervised mode and their selectors are tuned on first use; until then `FOOD_EXECUTOR=dry_run` simulates carts so the whole approval flow is exercisable. Builds on `PLAN-LOCAL-ASSISTANT.md` Phases 4 (memory, push, assistant) and 5
> (task queue, browser executor, approval gate). Owner decisions are marked **DECIDE**.

## 1. What the feature is, in one cycle

Every two weeks, on a schedule that already knows when you are travelling:

1. **Pantry check** (2 days before shop day). A push opens a checklist of what last cycle bought. You tap each item: gone / some / plenty. Takes a minute.
2. **Deck**. The planner proposes 10 to 14 meals for the next two weeks. You swipe right to keep, left to skip. Mostly proven favourites, a few new candidates.
3. **Plan**. The kept meals are laid onto a 14-day strip around travel days: about 5 cook sessions, each yielding 2 to 3 days of food, reheated in the oven or a pan.
4. **Bags**. Ingredients roll up into a shopping list, rounded to real package sizes, then split into store bags (H Mart, Whole Foods via Amazon, Wegmans via DoorDash) that each clear the store minimum and waste the least.
5. **Carts**. After you approve the bags, the operator on the Mac builds each cart in your logged-in browser and shows you the cart page, line by line, with the total.
6. **Order**. Each cart needs its own Face ID approval, bound to that cart's total, single use, expiring in 15 minutes. The agent cannot place an order without it. Receipts and screenshots are kept.
7. **Learn**. Swipes, what you actually cooked, and a one-tap "again?" after each meal tune the deck for next time. Leftovers you report at the next pantry check feed waste tracking.

## 2. Principles, straight from your list

| You said | Design consequence |
|---|---|
| Cook less, prep well, oven or pan reheat | Every recipe carries `prep_days` (how long it keeps), `reheat` (oven / pan / cold / microwave-only), and `batch_ok`. Microwave-only recipes rank last. |
| Few ingredients, nothing exotic one-off | Each recipe ingredient is tagged `essential` (flavour would change without it) or `optional`. Optional ingredients are dropped by default. A hard cap on distinct ingredients per cycle. |
| Leftover waste | Ingredients have package sizes and shelf lives. The plan is scored on **reuse**: a specialty item must appear in 2+ meals in the cycle or be shelf-stable, or it is swapped out. |
| Korean (Maangchi) and Japanese, high protein | Source priority: Maangchi, Just One Cookbook, then top-rated general sites. Protein per serving is estimated and floored (target 40 g+ per dinner). |
| Not too creative, but variety | Deck mix: 70 % from your proven set (rotating so nothing repeats two cycles in a row), 30 % new candidates. New candidates are near neighbours of what you already like. |
| Two-week cadence, store minimums, don't break the bank | Bags are optimised across stores for minimums, delivery fees, and a quality tier per ingredient (meat and produce high, staples standard). |
| Safe payment | See §6. Layered, boring, auditable. |
| Calendar awareness | Travel days come from Google Calendar automatically; the cycle shrinks around them. |
| Track spend | Every placed order is a ledger row: per cycle, per store, per meal, protein per dollar, waste, and a monthly budget line (§7b). |
| Nice UI, its own tab | A **Food** tab. Swipe deck, 14-day strip, bags, approvals, pantry. |

## 3. Data model (SQLite, alongside the memory tables from Phase 4)

| Table | Purpose |
|---|---|
| `recipes` | title, source URL, source site, rating and review count, cuisine, prep_minutes, cook_minutes, servings, protein_g_per_serving, prep_days, reheat, batch_ok, `status` (candidate / proven / retired), your rating, times_cooked, last_cooked |
| `recipe_ingredients` | recipe → ingredient, quantity, unit, `essential` flag, prep note |
| `ingredients` | canonical name, category, default unit, `package_sizes` per store, shelf_life_days, shelf_stable, preferred store, quality tier, aliases |
| `pantry` | ingredient, quantity estimate, state (gone / some / plenty), last_confirmed, projected_expiry |
| `meal_cycles` | start date, end date, shop date, status (planning / deck / planned / bagged / ordering / active / done), travel_days JSON |
| `cycle_meals` | cycle → recipe, cook_date, days_covered, servings, status (planned / cooked / skipped), post-meal rating |
| `swipes` | cycle, recipe, decision, position in deck, dwell ms |
| `shopping_bags` | cycle → store, items JSON (ingredient, product match, qty, unit price), subtotal, minimum, fee, status |
| `cart_tasks` | bag → operator task: status (queued / building / needs_review / approved / placing / placed / failed), cart screenshot, line items as read from the cart, cart total |
| `order_approvals` | cart_task, cart_total, bag hash, approved_at, expires_at, used_at, biometric flag |
| `orders` | cart_task → merchant order id, total, receipt screenshot, delivery window |
| `calendar_feeds` | Google Calendar secret iCal URL, label, last_synced |
| `spend_ledger` | order → store, cycle, goods total, fees, tip, line items JSON, receipt ref; plus per-recipe cost allocation |
| `preference_weights` | feature → weight (cuisine, protein source, prep time bucket, ingredient count, reheat method, site), updated after each cycle |

Existing Phase 4 `memories` gets entries the assistant can read in plain language: "hates microwaved rice", "always has gochugaru and soy sauce", "H Mart for Korean staples".

## 4. Recipe sourcing and the essential-ingredient rule

1. **Seed from what you already make.** Soft tofu soup (sundubu jjigae), dak galbi, hot pot udon, dak dori tang, galbi tang, plus 10 to 15 more from Maangchi and Just One Cookbook chosen for batch-friendliness and protein. These start as `proven`.
2. **Candidate discovery** runs in the background between cycles: Brave/Tavily search (already wired in `web_research.py`) with queries shaped by your preference weights, filtered to sites with visible ratings, top results fetched and passed to `llm.structured_output` to extract a normalised recipe: ingredients with quantities, steps, timing, yield, and an `essential` verdict per ingredient with a one-line reason.
3. **Essential** means the dish would not taste like itself without it. Gochujang in dak galbi is essential; sesame seeds on top are not. The LLM decides, you can flip it in the recipe view, and flips are remembered.
4. **Nothing exotic one-off**: an ingredient that is not shelf-stable and appears in only one recipe of the cycle triggers a swap suggestion (another recipe that shares it) or a drop.
5. Recipes never change under you: once proven, the ingredient list is frozen unless you edit it.

## 5. Planning and bag building

**Meal count.** 14 days minus travel days, minus a configurable number of eat-out days (default 2 per cycle), split into cook sessions of `prep_days` each. Lunch defaults to leftovers of the previous dinner.

**Deck size and stop rule (hardened).** You never swipe the whole catalogue.

- `eating_days = 14 − travel_days − eat_out_days` (eat-out default 2).
- Deck length is at most `ceil(eating_days / 2) + 4` cards: the worst case of two-day recipes plus a few skips.
- Cards are ordered by score, 70/30 proven/new.
- The deck **stops as soon as the kept recipes' `prep_days` sum to `eating_days`**, and offers exactly one spare. With 9 eating days that is 3 or 4 recipes.
- If the deck is exhausted short of coverage, the open days are shown and default to eat-out; you can reset or add.
- A distinct-ingredient cap (default 24 per cycle) flags a keep that would blow past it.

**Deck scoring.** `score = 1 + affinity + mean(feature_weights) − recency + overlap + protein − microwave`, where affinity is per recipe, features are cuisine / reheat / keeps bucket / time bucket / source / protein source, recency is −0.6 if cooked last cycle, overlap is +0.08 per essential ingredient shared with meals already kept, protein is +0.10 at 40 g or more, and microwave-only is −0.4. Overlap is recomputed after every keep, so the next card tends to share ingredients with what you just kept.

**Learning (bounded).** Keep: +0.08 on each feature and +0.10 affinity. Skip: −0.05 and −0.08. "Cooked it 👍" after a cook day: +0.15 affinity and promotion to proven. "Skipped cooking": −0.10. Long dwell before a keep counts as a stronger keep (+0.02). All weights clamp to [−1, 1] and decay 2 % per cycle. New candidates start at affinity 0.10 and are searched as near neighbours of the top-weighted features. Cold start seeds the proven set at 0.5. Weights are stored in `preference_weights` and shown on Food home as a taste profile so the learning is visible and correctable.

**Plan layout.** Greedy: place the highest-scoring kept recipe on the first free cook day, cover `prep_days`, continue. Perishable-heavy recipes go first in the cycle, shelf-stable ones last. You can drag meals on the strip.

**Shopping list.** Sum ingredient quantities across the plan, subtract pantry (`plenty` = full, `some` = half), round up to package sizes, and compute projected leftover per item. Items with high projected waste get a "reuse or drop" prompt.

**Store allocation.** Each ingredient has a preferred store and a fallback. Start with the fewest stores that can cover the list; add a store only if it lowers total cost including delivery fee, or is the only source of an essential item. Every bag must clear its store's minimum; if one falls short, move staples into it. Store minimums, fees, and delivery windows live in `merchant_accounts` and are verified live by the cart builder, not assumed.

**Quality without overspending.** Per-ingredient quality tier drives product matching: meat, fish, eggs, and produce prefer the store's better-rated option within 25 % of the cheapest; staples take the cheapest sensible pack. Product picks are remembered per store so the same rice, soy sauce, and gochugaru come back every time.

## 6. Ordering, and the payment gate

This is the part that must be boring. Layers, each sufficient on its own:

1. **No card data anywhere.** Payment methods are saved with the merchant. The app and the agent never see a card number.
2. **Dedicated browser profile.** A separate Chrome profile on the Mac, logged into each store once by you. The operator drives it with Playwright. It is not your daily browser.
3. **Cart, then stop.** The cart task builds the cart and ends in `needs_review`. It screenshots the cart page and reads the line items and total back from the page. You see exactly what the store sees.
4. **Approval is a signed, single-use token.** Tapping Approve in the app requires Face ID (`expo-local-authentication`) and creates an `order_approvals` row bound to the cart task, the bag hash, and the cart total. It expires in 15 minutes and is consumed on first use.
5. **Re-verify before the click.** Right before Place Order, the executor re-reads the cart total from the page. If it differs from the approved total by more than a small tolerance (rounding, a substituted item), it aborts and asks again.
6. **Hard caps in code, not prompts.** Per-order maximum, per-cycle maximum, at most one placed order per store per cycle, and a global kill switch (`ordering_enabled`) checked on every step. Caps live in the database and the app, never only in an LLM prompt.
7. **Supervised mode first.** For the first few cycles the executor stops with the cursor on Place Order and pushes you a "press it yourself" notification. You promote it to unattended when you trust it.
8. **Idempotency.** Each cart task has one order slot. A retry after a network error checks the merchant's order history before attempting again.
9. **Audit trail.** Every step keeps a screenshot and timestamp. Orders appear in the Food tab with the receipt, and in the assistant's memory as facts ("ordered 2 lb short rib from H Mart on 9/20").

## 7. Calendars and pantry

- **Travel detection without OAuth (decided: Google Calendar).** Google Calendar publishes a secret iCal address per calendar (Settings → Integrate calendar). The backend polls it daily, and an LLM classifies events into travel / away spans (flights, hotels, all-day events in other cities, "trip" keywords). You confirm the first few classifications; after that it is automatic.
- **Cycle scheduling.** The next shop date is computed from the current cycle end and travel spans, then a push asks for the pantry check two days ahead.
- **Pantry check UI.** The checklist is generated from the last bags plus staples. Three-state tap per item; unknown items can be typed or dictated. Shelf-life projections pre-fill the likely state so you mostly confirm.

## 8. The Food tab

**Decided — Tab layout.** Six tabs: Daily · Train · Speak · North Star · Food · Me. Food is added; Speak stays.

Screens:

- **Food home** — cycle status, next shop date, tonight's meal with the reheat method, a "what's for lunch" leftover hint, pantry summary, the pending approval if any, spend so far this cycle.
- **Deck** — full-bleed recipe cards: photo, title, source and rating, prep and cook minutes, protein per serving, keeps-for days, reheat icon, ingredient count with essentials highlighted. Swipe right or left; tap to expand; long-press "never show again".
- **Plan** — 14-day strip with travel days greyed out, meals on cook days spanning the days they cover, drag to move, tap a meal for the recipe.
- **Bags** — one section per store: items, matched products, quantities, subtotal versus minimum, projected waste warnings, swap suggestions. Approve bags.
- **Carts and approvals** — cart screenshot, line items as read from the store, total, Face ID approve or reject with a reason.
- **Orders** — history with receipts.
- **Spend** — cycle-over-cycle chart by store, per-meal cost, protein per dollar, waste, budget line, CSV export.
- **Pantry** — the current estimate, editable any time.
- **Recipe** — the normalised recipe with essential ingredients marked, your notes, times cooked, rating.

## 7b. Spend tracking

Every placed order writes a `spend_ledger` row: store, cycle, goods total with fees and tip separated, and the line items as read from the receipt. From that:

- **This cycle versus the last six**, stacked by store, fees called out.
- **Per meal and per day**: bag items are allocated to the recipes that used them, giving a cost per serving and a cost per eating day.
- **Protein per dollar** per recipe.
- **Waste**: items bought as leftovers-expected and reported gone at the next pantry check, priced.
- **A monthly budget line** you set once; the bag builder warns when a cycle would cross it.
- CSV export.

## 9. Learning loop

- Swipe right/left and dwell time update `preference_weights` (small, bounded steps; no single swipe flips a taste).
- After each planned cook day, a push: "Cook the dak galbi? 👍 / skipped". Skips demote; cooks with a thumbs-up promote to `proven`.
- Post-cycle summary: what was cooked, what was wasted (from the next pantry check), spend per store. The assistant writes 2 to 3 plain-language memories from it.
- Stability rule: a proven recipe is never dropped from the pool by the model alone. Only you retire one.

## 10. Phases and effort

| Phase | Delivers | Depends on | Size |
|---|---|---|---|
| F1 Catalog | Schema, seed recipes from your favourites, recipe extraction pipeline, essential-ingredient rule, Recipe screen | Local-first Phase 4 memory schema | 2 days |
| F2 Cycle and Deck | Meal cycles, deck scoring, swipe UI, 14-day plan strip, cook-day pushes | F1, server push | 2 to 3 days |
| F3 Bags | Pantry model and check UI, shopping list with package rounding and waste projection, store allocation with minimums, Bags screen | F2 | 2 days |
| F4 Cart builder | Task queue, Playwright executor with a dedicated Chrome profile, per-store adapters (H Mart, Amazon Whole Foods, DoorDash Wegmans), product matching with remembered picks, supervised mode | Local-first Phase 5 task queue | 3 to 4 days |
| F5 Payment gate and ledger | Approval tokens with Face ID, total re-verification, caps, kill switch, idempotency, audit, Orders and Spend screens | F4 | 2 to 3 days |
| F6 Calendar and learning | Google Calendar iCal polling and travel classification, cycle scheduling, preference weights, post-cycle summary into memory | F2 | 2 days |

F1 to F3 are useful on their own: a plan and a shopping list you could order by hand. F4 and F5 add the browser. F6 makes it hands-off.

## 11. Open decisions

- **DECIDE F2** eat-out days per cycle default (2).
- **DECIDE F3** anchor store when all three could cover the list (recommended: H Mart for any cycle with Korean meals, Wegmans via DoorDash otherwise).
- **DECIDE F4** supervised mode duration (recommended: first 3 cycles, then per-store promotion).

Interactive mock of the whole flow: the "Two-Week Kitchen" artifact page (§0).
