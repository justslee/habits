"""Golf Performance Workout Plan — September 2026 → spring 2027 (docs/TRAINING-GOLF.md).

The program as data plus the rules that turn it into a day's prescription:

  * five sessions (S1–S5) with warm-ups, time budgets, blocks, accessory rotations (week A/B)
  * phases by date with dose rules that REPLACE the reference doses
  * lighter weeks (every 4–6 weeks; a starting calendar) that override the phase
  * tournament weeks (a 4-session taper relative to the event day)
  * a week planner that lays sessions onto days around travel, keeping lower-body
    sessions 48 h apart and never adding catch-up work
  * double progression within the phase's rep range, driven by what was logged

No medicine-ball throws or tosses anywhere. 70-minute hard cap per session.
"""

from __future__ import annotations

import datetime
import math
import re
from dataclasses import dataclass

PROGRAM_START = datetime.date(2026, 9, 8)
FIRST_EVENT_DEFAULT = datetime.date(
    2027, 4, 24
)  # April/May 2027; the owner sets the real date
LIGHTER_WEEKS = [
    datetime.date(2026, 9, 28),
    datetime.date(2026, 11, 2),
    datetime.date(2026, 12, 7),
    datetime.date(2027, 1, 11),
    datetime.date(2027, 2, 15),
]
MAX_MINUTES = 70
BANNED = (
    "med ball",
    "medicine ball",
    "medicine-ball",
    "ball throw",
    "ball toss",
    "slam",
)

# ---------------------------------------------------------------------------
# Sessions (reference dose = November–January)
# ---------------------------------------------------------------------------

DAILY_MOBILITY = [
    ("90/90 hip switches", "6–8/side"),
    ("Adductor rockbacks", "6–8/side"),
    ("Half-kneeling hip-flexor stretch with reach", "30 sec/side"),
    ("Open-book thoracic rotations", "6/side"),
    ("Supported deep squat hold", "30 sec"),
    ("Wall slides", "8–10"),
    ("Shoulder CARs", "2 slow circles/side"),
]
S5_EXTRA_MOBILITY = [
    ("Thoracic extension over a foam roller", "6–8 gentle reps"),
    ("Lat stretch", "30 sec/side"),
    ("Band shoulder external rotation", "2 × 10/side"),
]
WARMUP_S1 = [
    "Easy walk, bike or jog — 2 min",
    "90/90 hip switches — 6/side",
    "World's greatest stretch — 3/side",
    "Glute bridge — 10",
    "Bodyweight squat — 8",
    "Thoracic rotation — 5/side",
]
WARMUP_S2 = [
    "Easy cardio — 2 min",
    "Hip switches, thoracic rotations, wall slides",
    "A few light practice reps of today's cable or landmine movement",
]
WARMUP_S3 = WARMUP_S1 + ["A few unloaded hinges before lifting"]
WARMUP_S4 = [
    "Easy cardio — 2 min",
    "Daily mobility sequence at a comfortable pace (shorten drills to fit)",
    "Light rehearsal sets of the first power movements",
]


def ex(
    name,
    sets,
    reps,
    kind,
    *,
    per_side=False,
    rest=None,
    notes=None,
    superset=None,
    pair=None,
    omit_first=False,
):
    return {
        "name": name,
        "sets": sets,
        "reps": reps,
        "kind": kind,  # main | accessory | core | power | carry | run
        "per_side": per_side,
        "rest": rest,
        "notes": notes,
        "superset": superset,
        "pair": pair,
        "omit_first": omit_first,
    }


SESSIONS: dict[str, dict] = {
    "S1": {
        "title": "Lower-body strength, back and core",
        "target_minutes": (65, 70),
        "budget": "8 warm-up · 6 jumps · 18 main lift · 23 accessories · 10 core · 5 transitions",
        "warmup": WARMUP_S1,
        "blocks": [
            {
                "name": "Jumps",
                "minutes": 6,
                "exercises": [
                    ex(
                        "Box jump",
                        3,
                        "3",
                        "power",
                        rest="90–120 s",
                        notes="Modest box; land quietly and step down",
                    )
                ],
            },
            {
                "name": "Main lift",
                "minutes": 18,
                "exercises": [
                    ex(
                        "Trap-bar deadlift",
                        4,
                        "4–5",
                        "main",
                        rest="2–3 min",
                        notes="Brace; ~2 reps in reserve. 2–4 build-up sets first",
                    )
                ],
            },
            {
                "name": "Accessories",
                "minutes": 23,
                "exercises": [
                    {
                        "rotation": {
                            "A": ex(
                                "Bulgarian split squat",
                                3,
                                "6–8",
                                "accessory",
                                per_side=True,
                                rest="60–90 s",
                                notes="Controlled depth; weaker side first",
                            ),
                            "B": ex(
                                "Single-leg RDL",
                                2,
                                "8",
                                "accessory",
                                per_side=True,
                                rest="60–90 s",
                                notes="Weaker side sets the load",
                            ),
                        }
                    },
                    ex(
                        "Chest-supported DB row",
                        3,
                        "6–8",
                        "accessory",
                        pair="D",
                        superset="DB bench press",
                    ),
                    ex(
                        "DB bench press",
                        3,
                        "6–8",
                        "accessory",
                        pair="D",
                        superset="Chest-supported DB row",
                        notes="Stop before grinding",
                    ),
                ],
            },
            {
                "name": "Core",
                "minutes": 10,
                "exercises": [
                    ex(
                        "Pallof press",
                        2,
                        "8",
                        "core",
                        per_side=True,
                        pair="E",
                        notes="Brief pause, arms extended",
                    ),
                    ex(
                        "Suitcase carry",
                        2,
                        "30–40 sec",
                        "carry",
                        per_side=True,
                        pair="E",
                        notes="Walk tall without leaning",
                    ),
                ],
            },
        ],
    },
    "S2": {
        "title": "Rotational power, upper body and run",
        "target_minutes": (65, 70),
        "budget": "7 warm-up · 15 power · 25 upper body · 18 running · 5 transitions",
        "warmup": WARMUP_S2,
        "blocks": [
            {
                "name": "Power",
                "minutes": 15,
                "exercises": [
                    ex(
                        "Broad jump",
                        3,
                        "3",
                        "power",
                        rest="90–120 s",
                        notes="Reset between reps; stick each landing",
                    ),
                    {
                        "rotation": {
                            "A": ex(
                                "Explosive cable rotation",
                                3,
                                "4",
                                "power",
                                per_side=True,
                                rest="90–120 s",
                                notes="Chest height; hips → torso → arms; decelerate before the end",
                            ),
                            "B": ex(
                                "Landmine rotation",
                                3,
                                "4",
                                "power",
                                per_side=True,
                                rest="90–120 s",
                                notes="Hips → torso → arms; no jerking the plate",
                            ),
                        }
                    },
                ],
            },
            {
                "name": "Upper body",
                "minutes": 25,
                "exercises": [
                    ex(
                        "Pull-up or lat pulldown",
                        3,
                        "5–8",
                        "accessory",
                        pair="A",
                        superset="Half-kneeling landmine press",
                        notes="Add weight only when bodyweight reps stay clean",
                    ),
                    ex(
                        "Half-kneeling landmine press",
                        3,
                        "6",
                        "accessory",
                        per_side=True,
                        pair="A",
                        superset="Pull-up or lat pulldown",
                    ),
                    ex(
                        "Single-arm cable row",
                        2,
                        "8",
                        "accessory",
                        per_side=True,
                        pair="B",
                        omit_first=True,
                    ),
                    {
                        "rotation": {
                            "A": ex(
                                "Lateral raise",
                                2,
                                "12",
                                "accessory",
                                pair="B",
                                omit_first=True,
                            ),
                            "B": ex(
                                "Face pull",
                                2,
                                "12",
                                "accessory",
                                pair="B",
                                omit_first=True,
                            ),
                        }
                    },
                ],
            },
        ],
        "run": {
            "minutes": 18,
            "structure": "3 min easy · 6 × (1 min hard @ RPE 7–8 + 1 min easy) · 3 min easy",
            "intervals": 6,
        },
    },
    "S3": {
        "title": "Full-body strength and trunk control",
        "target_minutes": (65, 70),
        "budget": "8 warm-up · 5 jumps · 17 squat · 25 accessories · 10 core · 5 transitions",
        "warmup": WARMUP_S3,
        "blocks": [
            {
                "name": "Jumps",
                "minutes": 5,
                "exercises": [
                    ex(
                        "Vertical jump",
                        3,
                        "3",
                        "power",
                        rest="90–120 s",
                        notes="Reset between reps",
                    )
                ],
            },
            {
                "name": "Main lift",
                "minutes": 17,
                "exercises": [
                    ex(
                        "Front squat",
                        4,
                        "4–6",
                        "main",
                        rest="2–3 min",
                        notes="Goblet squat is an alternative. 2–4 build-up sets first",
                    )
                ],
            },
            {
                "name": "Accessories",
                "minutes": 25,
                "exercises": [
                    ex(
                        "Romanian deadlift",
                        3,
                        "6–8",
                        "accessory",
                        rest="60–90 s",
                        notes="Hinge through the hips; controlled lowering",
                    ),
                    ex(
                        "Incline DB press",
                        3,
                        "8",
                        "accessory",
                        pair="D",
                        superset="Pull-up or lat pulldown",
                    ),
                    ex(
                        "Pull-up or lat pulldown",
                        3,
                        "6–8",
                        "accessory",
                        pair="D",
                        superset="Incline DB press",
                        notes="Full comfortable range",
                    ),
                    {
                        "rotation": {
                            "A": ex(
                                "Reverse lunge",
                                2,
                                "8",
                                "accessory",
                                per_side=True,
                                omit_first=True,
                                notes="First to omit if time runs short",
                            ),
                            "B": ex(
                                "Back extension",
                                2,
                                "8–12",
                                "accessory",
                                omit_first=True,
                                notes="Finish straight; don't arch past neutral",
                            ),
                        }
                    },
                ],
            },
            {
                "name": "Core",
                "minutes": 10,
                "exercises": [
                    ex(
                        "Cable chop",
                        2,
                        "8",
                        "core",
                        per_side=True,
                        pair="F",
                        notes="Controlled rotation; don't chase speed",
                    ),
                    ex(
                        "Side plank",
                        2,
                        "30–45 sec",
                        "core",
                        per_side=True,
                        pair="F",
                        notes="End when position deteriorates",
                    ),
                ],
            },
        ],
    },
    "S4": {
        "title": "Power and athleticism",
        "target_minutes": (60, 65),
        "budget": "10 warm-up · 25 power · 20 athletic strength · 5 carries · 5 transitions",
        "warmup": WARMUP_S4,
        "blocks": [
            {
                "name": "Power",
                "minutes": 25,
                "exercises": [
                    {
                        "rotation": {
                            "A": ex("Box jump", 3, "3", "power", rest="90–120 s"),
                            "B": ex("Vertical jump", 3, "3", "power", rest="90–120 s"),
                        }
                    },
                    {
                        "rotation": {
                            "A": ex(
                                "Landmine rotational press",
                                3,
                                "4",
                                "power",
                                per_side=True,
                                rest="90–120 s",
                            ),
                            "B": ex(
                                "Split-stance cable rotational punch",
                                3,
                                "4",
                                "power",
                                per_side=True,
                                rest="90–120 s",
                            ),
                        }
                    },
                    {
                        "rotation": {
                            "A": ex(
                                "Kettlebell swing",
                                3,
                                "6",
                                "power",
                                rest="90–120 s",
                                notes="Fast, controlled hip extension",
                            ),
                            "B": ex(
                                "Lateral bound",
                                3,
                                "3",
                                "power",
                                per_side=True,
                                rest="90–120 s",
                                notes="Stabilise each landing before the next rep",
                            ),
                        }
                    },
                ],
            },
            {
                "name": "Athletic strength",
                "minutes": 20,
                "exercises": [
                    ex(
                        "Walking DB lunge",
                        2,
                        "8",
                        "accessory",
                        per_side=True,
                        omit_first=True,
                        notes="Omit if Thursday still affects your movement",
                    ),
                    ex("Cable row", 3, "10", "accessory", pair="B", superset="Push-up"),
                    ex(
                        "Push-up",
                        3,
                        "10–15",
                        "accessory",
                        pair="B",
                        superset="Cable row",
                        notes="Stop with 2 reps left",
                    ),
                ],
            },
            {
                "name": "Carries",
                "minutes": 5,
                "exercises": [ex("Farmer carry", 2, "40 sec", "carry")],
            },
        ],
        "four_session_variant": {
            "budget": "10 warm-up · 20 power · 12 strength · 18 easy run · 5 transitions",
            "target_minutes": (60, 65),
            "keep_power_slots": ["jump", "rotation"],
            "strength": [
                ex("Cable row", 2, "10", "accessory", pair="B", superset="Push-up"),
                ex("Push-up", 2, "10–15", "accessory", pair="B", superset="Cable row"),
            ],
            "run": {
                "minutes": 18,
                "structure": "conversational pace, easy start and finish",
                "intervals": 0,
            },
        },
    },
    "S5": {
        "title": "Easy aerobic work and mobility (optional)",
        "target_minutes": (40, 60),
        "budget": "30–45 easy run · 10–15 mobility",
        "warmup": [],
        "blocks": [],
        "run": {
            "minutes": 35,
            "structure": "30–45 min conversational; bike, elliptical or incline walk when impact would interfere with golf",
            "intervals": 0,
        },
        "mobility_extra": S5_EXTRA_MOBILITY,
    },
}
DEFAULT_WEEK = {
    0: "S1",
    1: "S2",
    3: "S3",
    4: "S5",
    5: "S4",
}  # Mon Tue Thu Fri Sat (Python weekday)
PRIORITY = ["S1", "S3", "S2", "S4", "S5"]  # what survives when days are lost to travel
LOWER_BODY = {"S1", "S3"}

# ---------------------------------------------------------------------------
# Phases (rules replace the reference doses)
# ---------------------------------------------------------------------------


@dataclass
class Phase:
    key: str
    name: str
    start: datetime.date
    end: datetime.date
    main_sets: int
    main_reps: str
    accessory_sets: int | None  # None = as listed
    power_sets: int
    rpe: str
    run_note: str
    notes: str = ""
    strength_focus: str = ""


def phases(first_event: datetime.date) -> list[Phase]:
    pre_start = first_event - datetime.timedelta(weeks=5)
    return [
        Phase(
            "baseline",
            "Establish technique and baseline",
            datetime.date(2026, 9, 8),
            datetime.date(2026, 9, 30),
            2,
            "6–8",
            2,
            2,
            "6–7",
            "Session 2: 15–18 min easy run/walk. Session 5: 20–30 min easy if tolerated.",
            "First 2 weeks: 2 working sets per lift. Then main lifts to 3 sets if recovery is good; accessories stay at 2. Controlled low jumps, light rotations, no max efforts.",
        ),
        Phase(
            "build",
            "Build muscle and aerobic capacity",
            datetime.date(2026, 10, 1),
            datetime.date(2026, 10, 31),
            3,
            "6–8",
            None,
            3,
            "7–8",
            "4 × 1 min hard / 1 min easy inside an 18-min run; optional easy run builds toward 30–35 min.",
            "Main lifts 3 × 6–8; other lifts 2–3 sets at listed ranges. Finish with 2–3 reps left. Increase speed on power work while retaining control.",
        ),
        Phase(
            "strength",
            "Build strength",
            datetime.date(2026, 11, 1),
            datetime.date(2026, 12, 31),
            4,
            None,
            None,
            3,
            "7–8",
            "Work toward the full 6-interval run. Optional easy run 30–40 min.",
            "Reference doses: trap bar 4 × 4–5, front squat 4 × 4–6, other lifts as listed. Crisp jumps, light fast rotations.",
        ),
        Phase(
            "consolidate",
            "Consolidate strength",
            datetime.date(2027, 1, 1),
            datetime.date(2027, 1, 31),
            4,
            None,
            None,
            3,
            "7–8",
            "Hold intervals steady. Optional easy run up to 40–45 min if comfortable.",
            "Continue reference doses. Increase load only when earned; 3 main-lift sets if golf or fatigue rises. No max testing.",
        ),
        Phase(
            "golf_power",
            "Emphasize golf power",
            datetime.date(2027, 2, 1),
            pre_start - datetime.timedelta(days=1),
            3,
            "3–5",
            2,
            3,
            "7–8",
            "Session 2: 4–6 intervals only if legs feel fresh; otherwise easy running. Optional easy run 25–40 min. More golf practice.",
            "Main lifts 2–3 × 3–5. Accessories 2 sets; omit Session 3's optional accessory and Session 4 lunges when needed. Power: 3 sets of 3–4 reps, swings 6.",
        ),
        Phase(
            "pre_event",
            "Arrive fresh",
            pre_start,
            first_event - datetime.timedelta(days=1),
            2,
            "3–5",
            1,
            2,
            "6–7",
            "Replace hard intervals with 15–20 min easy running. Optional cardio 20–30 min. Scoring practice and simulated rounds.",
            "Sets down 30–40 %: 2 per main lift, 1–2 per accessory. Familiar loads only. Power 2–3 × 2–3; swings 2 × 5. No new drills.",
        ),
        Phase(
            "in_season",
            "In-season maintenance",
            first_event,
            first_event + datetime.timedelta(days=90),
            2,
            "3–5",
            1,
            2,
            "6–7",
            "Four sessions of 20–50 min; optional fifth is easy recovery only.",
            "Two short strength sessions weekly (2 × 3–5 main, 1–2 accessory sets). One short power session; fourth session is easy cardio and mobility.",
        ),
    ]


def phase_for(
    d: datetime.date, first_event: datetime.date = FIRST_EVENT_DEFAULT
) -> Phase:
    for p in phases(first_event):
        if p.start <= d <= p.end:
            return p
    ps = phases(first_event)
    return ps[0] if d < ps[0].start else ps[-1]


# ---------------------------------------------------------------------------
# Week kinds
# ---------------------------------------------------------------------------


def week_start(d: datetime.date) -> datetime.date:
    return d - datetime.timedelta(days=d.weekday())


def is_lighter_week(d: datetime.date, extra: list[datetime.date] | None = None) -> bool:
    ws = week_start(d)
    return ws in LIGHTER_WEEKS or ws in {week_start(x) for x in (extra or [])}


def rotation_week(d: datetime.date) -> str:
    """Accessory rotation A/B alternates weekly from the program start."""
    return (
        "A" if ((week_start(d) - week_start(PROGRAM_START)).days // 7) % 2 == 0 else "B"
    )


def tournament_in_week(
    d: datetime.date, tournaments: list[datetime.date]
) -> datetime.date | None:
    ws = week_start(d)
    for t in sorted(tournaments):
        if ws <= t <= ws + datetime.timedelta(days=6):
            return t
    return None


TOURNAMENT_TEMPLATE = {  # offset from the event day → prescription
    -5: (
        "T-strength",
        "35–45 min strength",
        [
            ex("Trap-bar deadlift", 2, "3–4", "main", rest="2–3 min"),
            ex("DB bench press", 2, "6", "accessory"),
            ex("Chest-supported DB row", 2, "6", "accessory"),
            ex("Pallof press", 2, "6", "core", per_side=True),
        ],
    ),
    -4: ("T-easy", "25–35 min easy cardio + mobility", []),
    -3: (
        "T-primer",
        "25–35 min power and strength primer",
        [
            ex("Box jump", 2, "2", "power"),
            ex("Explosive cable rotation", 2, "3", "power", per_side=True),
            ex("Front squat", 2, "3", "main", notes="RPE 6–7"),
            ex("Lat pulldown", 2, "6", "accessory"),
        ],
    ),
    -2: ("T-walk", "15–20 min easy walk or bike + gentle mobility", []),
    -1: (
        "T-rest",
        "Rest or a brief familiar pre-round warm-up; no hard intervals or heavy lifting",
        [],
    ),
    0: ("T-event", "Tournament", []),
    1: ("T-event", "Tournament or golf; no catch-up gym work", []),
}


# ---------------------------------------------------------------------------
# Week planner: sessions onto days around travel and tournaments
# ---------------------------------------------------------------------------


@dataclass
class DayPlan:
    date: datetime.date
    session: str | None  # S1..S5, T-*, or None
    label: str
    travel: bool = False
    note: str | None = None


def plan_week(
    ws: datetime.date,
    *,
    travel_days: set[datetime.date],
    tournaments: list[datetime.date],
    five_sessions: bool = True,
    golf_days: set[datetime.date] | None = None,
) -> list[DayPlan]:
    days = [ws + datetime.timedelta(days=i) for i in range(7)]
    t = tournament_in_week(ws, tournaments)
    if t is not None:
        out = []
        for d in days:
            off = (d - t).days
            tpl = TOURNAMENT_TEMPLATE.get(off)
            if d in travel_days and tpl and tpl[0] not in ("T-event",):
                out.append(DayPlan(d, "MOB", "Travel · 8-min mobility", travel=True))
            elif tpl:
                out.append(DayPlan(d, tpl[0], tpl[1], travel=d in travel_days))
            else:
                out.append(DayPlan(d, None, "Rest or golf", travel=d in travel_days))
        return out

    wanted = [
        DEFAULT_WEEK[i]
        for i in sorted(DEFAULT_WEEK)
        if five_sessions or DEFAULT_WEEK[i] != "S5"
    ]
    free = [d for d in days if d not in travel_days]
    # keep the default day when it is free; otherwise move to the nearest free day still unused
    assigned: dict[datetime.date, str] = {}
    for wd, sid in DEFAULT_WEEK.items():
        if sid not in wanted:
            continue
        d = ws + datetime.timedelta(days=wd)
        if d in free and d not in assigned:
            assigned[d] = sid
    for sid in [s for s in PRIORITY if s in wanted and s not in assigned.values()]:
        default_d = ws + datetime.timedelta(
            days=next(k for k, v in DEFAULT_WEEK.items() if v == sid)
        )
        candidates = sorted(
            (d for d in free if d not in assigned),
            key=lambda d: (abs((d - default_d).days), d),
        )
        for d in candidates:
            # lower-body sessions want 48 h from each other
            if sid in LOWER_BODY and any(
                v in LOWER_BODY and abs((d - dd).days) < 2 for dd, v in assigned.items()
            ):
                continue
            assigned[d] = sid
            break
    out = []
    dropped = [s for s in wanted if s not in assigned.values()]
    for d in days:
        if d in travel_days:
            out.append(DayPlan(d, "MOB", "Travel · 8-min mobility", travel=True))
        elif d in assigned:
            sid = assigned[d]
            moved = DEFAULT_WEEK.get(d.weekday()) != sid
            out.append(
                DayPlan(
                    d,
                    sid,
                    SESSIONS[sid]["title"],
                    note="moved around travel" if moved else None,
                )
            )
        else:
            out.append(
                DayPlan(
                    d,
                    None,
                    "Golf or rest"
                    if (golf_days and d in golf_days)
                    else "Rest, golf or mobility",
                )
            )
    if dropped:
        note = (
            "Not enough free days this week — dropped "
            + ", ".join(dropped)
            + " (no catch-up work)"
        )
        for dp in out:
            if dp.session and dp.session.startswith("S"):
                dp.note = (dp.note + " · " if dp.note else "") + note
                break
    return out


# ---------------------------------------------------------------------------
# Dose rules and prescription
# ---------------------------------------------------------------------------


def parse_reps(r: str) -> tuple[int | None, int | None]:
    m = re.match(r"^(\d+)(?:[–-](\d+))?$", (r or "").strip())
    if not m:
        return None, None
    lo = int(m.group(1))
    return lo, int(m.group(2) or lo)


def _dose(
    exercise: dict, phase: Phase, *, lighter: bool, four_session_s4: bool = False
) -> dict:
    e = dict(exercise)
    kind = e["kind"]
    if kind == "main":
        e["sets"] = phase.main_sets
        if phase.main_reps:
            e["reps"] = phase.main_reps
    elif kind in ("accessory", "core", "carry") and phase.accessory_sets is not None:
        e["sets"] = min(e["sets"], phase.accessory_sets)
    elif kind == "power":
        e["sets"] = min(e["sets"], phase.power_sets)
        if phase.key == "pre_event":
            e["reps"] = "2–3" if "swing" not in e["name"].lower() else "5"
            e["sets"] = 2 if "swing" in e["name"].lower() else e["sets"]
    if lighter:
        if kind == "power":
            e["sets"] = max(1, e["sets"] // 2)
        else:
            e["sets"] = max(1, math.floor(e["sets"] * 0.6))
    e["rpe"] = "6–7" if lighter else phase.rpe
    return e


def _pick_rotation(item: dict, rot: str) -> dict:
    return item["rotation"][rot] if "rotation" in item else item


def prescribe(
    d: datetime.date,
    session_id: str,
    *,
    first_event: datetime.date = FIRST_EVENT_DEFAULT,
    lighter: bool | None = None,
    five_sessions: bool = True,
    profiles: dict[str, dict] | None = None,
    tournament_day: datetime.date | None = None,
) -> dict:
    """The day's session as data: warm-up, blocks with dosed exercises and suggested loads, run, mobility."""
    profiles = profiles or {}
    phase = phase_for(d, first_event)
    lighter = is_lighter_week(d) if lighter is None else lighter
    rot = rotation_week(d)

    if session_id in TOURNAMENT_TEMPLATE_BY_KEY:
        tpl = TOURNAMENT_TEMPLATE_BY_KEY[session_id]
        return {
            "session": session_id,
            "title": tpl[1],
            "phase": phase.key,
            "phase_name": phase.name,
            "week_kind": "tournament",
            "rotation": rot,
            "target_minutes": [25, 45],
            "warmup": WARMUP_S1[:4] if tpl[2] else [],
            "blocks": [
                {
                    "name": "Primer",
                    "minutes": 30,
                    "exercises": [_with_load(e, profiles) for e in tpl[2]],
                }
            ]
            if tpl[2]
            else [],
            "run": None,
            "mobility": DAILY_MOBILITY,
            "rules": [
                "Demanding lower-body work stays 48–72 h before the event",
                "No catch-up gym work",
            ],
            "budget": tpl[1],
        }
    if session_id == "MOB":
        return {
            "session": "MOB",
            "title": "Travel day · mobility",
            "phase": phase.key,
            "phase_name": phase.name,
            "week_kind": "travel",
            "rotation": rot,
            "target_minutes": [8, 12],
            "warmup": [],
            "blocks": [],
            "run": None,
            "mobility": DAILY_MOBILITY,
            "rules": ["Hotel-friendly: nothing to load. Comfortable ranges only."],
            "budget": "8 min",
        }

    spec = SESSIONS[session_id]
    week_kind = "lighter" if lighter else "normal"
    blocks = []
    variant = (
        spec.get("four_session_variant")
        if (session_id == "S4" and not five_sessions)
        else None
    )
    for b in spec["blocks"]:
        items = [_pick_rotation(i, rot) for i in b["exercises"]]
        if variant and b["name"] == "Power":
            items = items[:2]  # jump + rotation only
        if variant and b["name"] == "Athletic strength":
            items = list(variant["strength"])
        if variant and b["name"] == "Carries":
            continue
        dosed = [_with_load(_dose(i, phase, lighter=lighter), profiles) for i in items]
        blocks.append({"name": b["name"], "minutes": b["minutes"], "exercises": dosed})
    run = variant["run"] if variant else spec.get("run")
    if run:
        run = dict(run)
        if session_id == "S2":
            if phase.key == "baseline":
                run.update(minutes=16, structure="15–18 min easy run/walk", intervals=0)
            elif phase.key == "build":
                run.update(
                    structure="3 min easy · 4 × (1 min hard + 1 min easy) · easy running to 18 min",
                    intervals=4,
                )
            elif phase.key in ("pre_event", "in_season"):
                run.update(
                    minutes=18,
                    structure="15–20 min easy running (no hard intervals)",
                    intervals=0,
                )
            if lighter:
                run.update(
                    structure="18 min easy — keep running easy in a lighter week",
                    intervals=0,
                )
        if session_id == "S5":
            run["minutes"] = {
                "baseline": 25,
                "build": 32,
                "strength": 35,
                "consolidate": 40,
                "golf_power": 32,
                "pre_event": 25,
                "in_season": 25,
            }.get(phase.key, 35)
    rules = [
        f"Hard cap {MAX_MINUTES} min including warm-up, rest and transitions — omit the last accessory set, never the warm-up",
        f"Strength sets finish with 2–3 good reps left (RPE {phase.rpe})",
        "Power first; stop a set when speed, balance or landing quality drops",
        "No medicine-ball throws or tosses",
    ]
    if lighter:
        rules.insert(
            0,
            "Lighter week: sets cut by a third to a half, RPE 6–7, power sets halved, running easy. Resume from your previous load.",
        )
    return {
        "session": session_id,
        "title": spec["title"],
        "phase": phase.key,
        "phase_name": phase.name,
        "phase_notes": phase.notes,
        "week_kind": week_kind,
        "rotation": rot,
        "target_minutes": list(
            variant["target_minutes"] if variant else spec["target_minutes"]
        ),
        "budget": variant["budget"] if variant else spec["budget"],
        "warmup": spec["warmup"],
        "blocks": blocks,
        "run": run,
        "mobility": DAILY_MOBILITY + (spec.get("mobility_extra") or []),
        "rules": rules,
        "estimated_duration_minutes": (
            variant["target_minutes"] if variant else spec["target_minutes"]
        )[1],
    }


TOURNAMENT_TEMPLATE_BY_KEY = {
    v[0]: v for v in TOURNAMENT_TEMPLATE.values() if v[0] != "T-event"
}


def _with_load(e: dict, profiles: dict[str, dict]) -> dict:
    """Attach the double-progression suggestion from the exercise profile, if any."""
    e = dict(e)
    p = profiles.get(e["name"].lower())
    if p and p.get("weight") is not None:
        e["load"] = p["weight"]
        e["load_note"] = p.get("note")
    else:
        e["load"] = None
        e["load_note"] = (
            "pick a weight you can lift cleanly for the bottom of the range with 2–3 reps left"
            if e["kind"] in ("main", "accessory")
            else None
        )
    return e


# ---------------------------------------------------------------------------
# Double progression
# ---------------------------------------------------------------------------

LOWER_BODY_NAMES = ("deadlift", "squat", "lunge", "rdl", "step-up", "split")


def increment_for(exercise_name: str) -> float:
    return 10.0 if any(k in exercise_name.lower() for k in LOWER_BODY_NAMES) else 5.0


def progression_after(exercise: dict, sets_logged: list[dict]) -> dict | None:
    """Given the prescribed exercise and the working sets logged (weight, reps, rpe), decide
    the next exposure. Returns {weight, note} or None when nothing changes."""
    lo, hi = parse_reps(exercise.get("reps") or "")
    working = [s for s in sets_logged if not s.get("is_warmup") and s.get("reps")]
    if not working or lo is None:
        return None
    weights = {s.get("weight") for s in working if s.get("weight") is not None}
    if len(weights) != 1:
        return None
    w = weights.pop()
    hit_top = all((s.get("reps") or 0) >= hi for s in working) and len(
        working
    ) >= exercise.get("sets", 1)
    easy_enough = all((s.get("rpe") or 8) <= 8.5 for s in working)
    if hit_top and easy_enough:
        return {
            "weight": w + increment_for(exercise["name"]),
            "note": f"all sets hit {hi} with reps left → +{increment_for(exercise['name']):.0f} lb, back to {lo}",
        }
    if any((s.get("reps") or 0) < lo for s in working):
        return {
            "weight": w,
            "note": f"missed the bottom of the range ({lo}) — hold {w:.0f} lb, or trim 5–10 %",
        }
    return {"weight": w, "note": f"add reps toward {hi} at {w:.0f} lb"}


def spec_check() -> list[str]:
    """Sanity: nothing banned in the spec."""
    bad = []
    for sid, s in SESSIONS.items():
        for b in s["blocks"]:
            for i in b["exercises"]:
                for e in i["rotation"].values() if "rotation" in i else [i]:
                    if any(k in e["name"].lower() for k in BANNED):
                        bad.append(f"{sid}: {e['name']}")
    return bad
