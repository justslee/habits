# Workout Screen Redesign — Completed Section

## Research: What Premium Apps Do

### Strong / Hevy (Set Logging Gold Standard)
- **Table layout per exercise**: columns for SET | PREVIOUS | WEIGHT | REPS | ✓
- "PREVIOUS" column shows last session's numbers — instant progressive overload visibility
- Checkmark per set for completion state
- Tags: warm-up, failure, drop set
- Rest timer countdown between sets
- Notes per exercise
- Exercise name as section header with muscle group subtitle

### Whoop / Apple Fitness+ (Post-Workout Summary)
- Hero stat at top: total strain / duration / calories burned
- Heart rate zone breakdown (if available)
- Clean stat grid: big numbers, tiny labels
- Generous whitespace, data-forward design

### Key Takeaway
The completed section should look like a **post-workout summary card** (Whoop-style) combined with **Strong-style exercise tables** for the detail.

---

## Design Spec

### 1. Workout Summary Header (NEW)
Add a summary card between the plan and completed sections:

```
┌─────────────────────────────────────────┐
│  WORKOUT SUMMARY                        │
│                                         │
│  45 min        6          24            │
│  Duration    Exercises    Sets           │
│                                         │
│  Total Volume: 12,450 lb                │
└─────────────────────────────────────────┘
```

- Calculate total volume = sum(weight × reps) for all strength sets
- Duration = time from first to last logged set (if timestamps exist), or estimated
- Use `typography.title2` for the big numbers, `typography.micro` for labels
- Only show volume for strength-focused days; for cardio days show total distance/time

### 2. Exercise Table (Replaces current chips/list)
Per exercise group, use a table layout inspired by Strong:

```
┌─────────────────────────────────────────┐
│ 🏋️ Bench Press                          │
│                                         │
│  SET    PREVIOUS     WEIGHT    REPS     │
│   1     135×8        135       8    ✓   │
│   2     135×8        145       6    ✓   │
│   3     135×8        145       5    ✓   │
│  W      —            95        10   ✓   │
└─────────────────────────────────────────┘
```

For cardio exercises:
```
┌─────────────────────────────────────────┐
│ ⚡ 400m Intervals                        │
│                                         │
│  SET    DISTANCE     TIME     PACE      │
│   1     400m         1:32     6:10/mi   │
│   2     400m         1:35     6:22/mi   │
│   3     400m         1:38     6:34/mi   │
└─────────────────────────────────────────┘
```

For bodyweight/core:
```
┌─────────────────────────────────────────┐
│ 🧘 Plank Hold                            │
│                                         │
│  SET    PREVIOUS     DURATION           │
│   1     45s          45 sec         ✓   │
│   2     45s          45 sec         ✓   │
│   3     45s          45 sec         ✓   │
└─────────────────────────────────────────┘
```

### 3. Column Definitions

**SET column:**
- Number (1, 2, 3...) for working sets
- "W" in dimmed text for warm-up sets
- "D" for drop sets
- "F" suffix if trained to failure

**PREVIOUS column:**
- Shows last session's data for same exercise
- Format: "135×8" or "45s" or "400m"
- If no previous data: "—"
- Color: `colors.textTertiary`
- This requires fetching previous workout data (may need API addition)

**WEIGHT/REPS columns:**
- Weight bold if it's a PR (heavier than previous)
- Green text if improved vs previous
- Regular text otherwise

**Checkmark column:**
- ✓ in accent color for completed sets
- This is visual-only since our sets are already logged

### 4. RPE Badge (if provided)
Show small badge next to the checkmark:
- RPE ≤6: green badge
- RPE 7-8: yellow badge  
- RPE 9-10: red badge
- Format: small pill "RPE 8"

### 5. Style Rules
- Table header row: `typography.micro`, `colors.textTertiary`, uppercase
- Data rows: `typography.body` for values
- Weight values: `typography.bodyBold` when it's a PR
- Exercise name: `typography.bodyBold` with type icon
- Card: use `cardStyle` from theme
- Row height: 40px with vertical centering
- Column alignment: SET (center), PREVIOUS (left), WEIGHT (right), REPS (right), CHECK (center)
- Alternating row backgrounds: none (keep clean), use subtle bottom border

### 6. Implementation Notes

**Phase 1 (do now):**
- Redesign the COMPLETED section rendering in WorkoutScreen.tsx
- Table layout per exercise group
- Smart formatting by exercise type (strength/cardio/bodyweight)
- Summary card with totals
- No API changes needed

**Phase 2 (future):**
- Add "previous" column (needs API: GET last session's sets for each exercise)
- PR indicators (needs comparison logic)
- Rest timer integration

### 7. What NOT to change
- Plan section, Whoop card, Coach chat, input bar — untouched
- Data fetching, state management, API calls — untouched
- Only replace the COMPLETED section JSX + its styles
