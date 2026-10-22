"""Golf Performance Workout Plan — September 2026 → spring 2027 (docs/TRAINING-GOLF.md).

The program as data plus the rules that turn it into a day's prescription:

  * five sessions (S1–S5) with warm-ups, time budgets, blocks, accessory rotations (week A/B)
  * phases by date with dose rules that REPLACE the reference doses
  * lighter weeks (every 4–6 weeks; a starting calendar) that override the phase
  * tournament weeks (a 4-session taper relative to the event day)
  * a week planner that lays sessions onto days around travel, keeping lower-body
    sessions 48 h apart and never adding catch-up work
  * double progression within the phase's rep range, driven by what was logged
  * a half-marathon block when a race is on the calendar (§12): ten build weeks of three runs
    plus two lifting sessions, a taper, race week and a recovery week; golf resumes after it
  * adapting to what you log (§13): the long run builds from the runs you logged, a run that
    felt harder than planned is repeated, the first week back after time off is easier, and
    Session 2's golf rotation steps aside while the running is taking it out of you

No medicine-ball throws or tosses anywhere. 70-minute hard cap per session.
"""

from __future__ import annotations

import datetime
import math
import re
from dataclasses import dataclass, replace

PROGRAM_START = datetime.date(2026, 9, 12)
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
            "structure": "Conversational throughout; bike, elliptical or an incline walk when impact would interfere with golf",
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
    race: bool = (
        False  # the half-marathon block: runs are their own days, S2 drops its run
    )


@dataclass(frozen=True)
class Race:
    """A race the plan builds toward (a golf_events row of kind "race")."""

    date: datetime.date
    name: str = "Half marathon"
    miles: float = 13.1
    notes: str | None = None  # where, and the goal ("finish strong, by effort")


def race_window(race: Race) -> dict[str, datetime.date]:
    """The block around a race: ten build weeks, a taper week, race week, a recovery week."""
    rw = week_start(race.date)
    return {
        "build": rw - datetime.timedelta(weeks=10),
        "taper": rw - datetime.timedelta(weeks=1),
        "week": rw,
        "recover": race.date + datetime.timedelta(days=1),
        "end": rw + datetime.timedelta(days=13),  # the Sunday after race week
    }


def _md(d: datetime.date) -> str:
    return f"{d:%b} {d.day}"


def phases(first_event: datetime.date, race: Race | None = None) -> list[Phase]:
    pre_start = first_event - datetime.timedelta(weeks=5)
    standard = [
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
    if race is None:
        return standard
    baseline, build, strength, _consolidate, golf_power, pre_event, in_season = standard
    w = race_window(race)
    back = w["end"] + DAY  # the Monday after the recovery week
    rebuild = back + datetime.timedelta(weeks=1)
    power = rebuild + datetime.timedelta(weeks=3)
    cut = sorted(w["week"] - datetime.timedelta(weeks=k) for k in RACE_CUTBACKS)
    longs = [wk["L"].miles for _, wk in sorted(RACE_BUILD.items(), reverse=True)]
    peak_wtr = max(RACE_BUILD, key=lambda k: (RACE_BUILD[k]["L"].miles, -k))
    peak = (
        w["week"]
        - datetime.timedelta(weeks=peak_wtr)
        + datetime.timedelta(days=_day_of("L"))
    )
    last_long = RACE_TEMPLATE[-11]
    out = [
        replace(baseline, end=min(baseline.end, w["build"] - DAY)),
        replace(build, end=w["build"] - DAY),
        Phase(
            "race_build",
            f"{race.name} build",
            w["build"],
            w["taper"] - DAY,
            3,
            None,
            2,
            2,
            "7",
            "Three runs a week, by effort rather than pace: easy (Tue), quality (Wed: steady, tempo, hills or "
            f"race effort) and long (Sat), the long run building from {longs[0]:g} to {max(longs):g} miles "
            f"(the longest on {_md(peak)}). Cutback weeks {_md(cut[0])} and {_md(cut[1])}. "
            "It adapts to what you log: the long run is never more than a mile past your longest run of the "
            "last three weeks, and a run that felt harder than planned is repeated. "
            "The Session 5 switch keeps or drops the easy run.",
            "Two lifting days hold your golf strength while the running builds: Session 1 (Mon, lower body and "
            "core, plus calf raises) and Session 2 (Thu, rotational power, upper body and 10 minutes of golf "
            "rotation, no run block). Main lift 3 sets, accessories 2, power 2, finishing with 2–3 reps left "
            "(RPE 7). The golf rotation steps aside in a week a run felt hard. Heavy legs? Cut lifting sets, "
            "never the long run.",
            race=True,
        ),
        Phase(
            "race_taper",
            "Taper and race",
            w["taper"],
            race.date,
            2,
            None,
            1,
            2,
            "6–7",
            "Running drops by about a third, then by half; short race-effort pieces keep the legs sharp. "
            f"The last longer run ({last_long.miles:g} mi) is 11 days out. Travelling far? Run easy once you "
            "land, outside in daylight, until the jet lag settles.",
            "One short Session 1 as the taper starts: 2 sets, familiar loads. No heavy lower-body work in the "
            "last 10 days; the mobility routine every day.",
            race=True,
        ),
        Phase(
            "race_recover",
            "Recover",
            w["recover"],
            w["end"],
            2,
            "6–8",
            1,
            1,
            "6",
            "Walk the day after. An easy 20 minutes from day 3 only if your legs feel normal; the first real "
            "run back a week after the race.",
            "No lifting this week: walks, the mobility routine and sleep. Golf is fine once walking feels normal.",
            race=True,
        ),
        Phase(
            "return",
            "Back to the full programme",
            back,
            rebuild - DAY,
            3,
            None,
            2,
            2,
            "7",
            "Session 2 restarts at 4 × 1 min hard inside its 18 minutes; Session 5 is a 30-minute easy run.",
            "All five sessions again: one week at 3 main-lift sets and RPE 7, with the loads you used in "
            "December, before the full doses.",
        ),
        replace(
            strength,
            name="Rebuild strength",
            start=rebuild,
            end=power - DAY,
            run_note="Work back to the full 6-interval run. Optional easy run 30–40 min keeps the "
            "half-marathon engine running.",
        ),
        replace(golf_power, start=power),
        pre_event,
        in_season,
    ]
    return [p for p in out if p.start <= p.end]


def phase_for(
    d: datetime.date,
    first_event: datetime.date = FIRST_EVENT_DEFAULT,
    race: Race | None = None,
) -> Phase:
    ps = phases(first_event, race)
    for p in ps:
        if p.start <= d <= p.end:
            return p
    return ps[0] if d < ps[0].start else ps[-1]


# ---------------------------------------------------------------------------
# Week kinds
# ---------------------------------------------------------------------------


def week_start(d: datetime.date) -> datetime.date:
    return d - datetime.timedelta(days=d.weekday())


def lighter_weeks(race: Race | None = None) -> list[datetime.date]:
    """The lighter-week calendar. A race replaces the ones inside its block with its own cutback
    weeks, and its recovery week counts as one."""
    if race is None:
        return list(LIGHTER_WEEKS)
    w = race_window(race)
    kept = {d for d in LIGHTER_WEEKS if not (w["build"] <= d <= w["end"])}
    cut = {w["week"] - datetime.timedelta(weeks=k) for k in RACE_CUTBACKS}
    return sorted(kept | cut | {w["week"] + datetime.timedelta(weeks=1)})


def is_lighter_week(
    d: datetime.date,
    extra: list[datetime.date] | None = None,
    race: Race | None = None,
) -> bool:
    ws = week_start(d)
    return ws in lighter_weeks(race) or ws in {week_start(x) for x in (extra or [])}


def race_week_kind(d: datetime.date, race: Race | None) -> str | None:
    """taper | race | recovery for the three weeks around a race that follow a day-by-day template."""
    if race is None:
        return None
    w = race_window(race)
    ws = week_start(d)
    if ws == w["taper"]:
        return "taper"
    if ws == w["week"]:
        return "race"
    if ws == w["week"] + datetime.timedelta(weeks=1):
        return "recovery"
    return None


def in_race_build(d: datetime.date, race: Race | None) -> bool:
    if race is None:
        return False
    w = race_window(race)
    return w["build"] <= week_start(d) < w["taper"]


def week_kind(
    d: datetime.date,
    *,
    race: Race | None = None,
    tournaments: list[datetime.date] | None = None,
    extra_lighter: list[datetime.date] | None = None,
) -> str:
    return (
        race_week_kind(d, race)
        or ("lighter" if is_lighter_week(d, extra_lighter, race) else None)
        or ("tournament" if tournament_in_week(d, tournaments or []) else "normal")
    )


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
# Half-marathon block: the runs (docs/TRAINING-GOLF.md §12). By effort, not pace.
# ---------------------------------------------------------------------------

DAY = datetime.timedelta(days=1)
EASY_PACE = 630  # sec/mile until easy runs are logged; it only sets a long run's expected minutes
RACE_WEEK = {0: "S1", 1: "E", 2: "Q", 3: "S2", 5: "L"}  # Mon Tue Wed Thu Sat
RACE_PRIORITY = ["L", "Q", "S1", "E", "S2"]  # what survives a week with lost days
RUN_IDS = ("E", "Q", "L")
HARD_RUNS = {"Q", "L"}  # kept 48 h apart, like the lower-body sessions
RACE_CUTBACKS = (7, 3)  # weeks before race week that cut back (lighter weeks)
SWAPPABLE = ["S1", "S2", "S3", "S4", "S5", *RUN_IDS]
RUN_NAMES = {"E": "the easy run", "Q": "the quality run", "L": "the long run"}
CALF_RAISE = ex(
    "Single-leg calf raise",
    2,
    "12–15",
    "accessory",
    per_side=True,
    notes="Slow, with a pause at the top: calves and Achilles carry the running",
)
# Session 2's add-on in the build weeks, from the paused Sessions 3 and 4: rotation is what the
# golf season needs most, and it costs the legs almost nothing. It steps aside in a week your
# running is taking it out of you (golf_rotation_off).
GOLF_ROTATION = {
    "name": "Golf rotation",
    "minutes": 10,
    "exercises": [
        {
            "rotation": {
                "A": ex(
                    "Landmine rotational press",
                    2,
                    "4",
                    "power",
                    per_side=True,
                    rest="60 s",
                ),
                "B": ex(
                    "Split-stance cable rotational punch",
                    2,
                    "4",
                    "power",
                    per_side=True,
                    rest="60 s",
                ),
            }
        },
        ex(
            "Cable chop",
            2,
            "8",
            "core",
            per_side=True,
            pair="G",
            notes="Controlled rotation; don't chase speed",
        ),
        ex(
            "Side plank",
            2,
            "30–45 sec",
            "core",
            per_side=True,
            pair="G",
            notes="End when position deteriorates",
        ),
    ],
}
WARM = (
    "Racing somewhere warmer than home? Run this one on a treadmill or a layer heavier than "
    "usual to start adapting."
)


RACE_TITLES = {"S2": "Rotational power and upper body"}  # S2 without its run block


def _day_of(sid: str) -> int:
    return next(k for k, v in RACE_WEEK.items() if v == sid)


def session_title(sid: str, race_phase: bool = False) -> str:
    return (RACE_TITLES.get(sid) if race_phase else None) or SESSIONS[sid]["title"]


def session_name(sid: str | None) -> str:
    return RUN_NAMES.get(sid or "", sid or "rest")


@dataclass(frozen=True)
class RunSpec:
    kind: str  # E easy | Q quality | L long | RACE
    title: str
    minutes: int | None = None  # time-based runs
    miles: float | None = None  # distance-based runs
    intensity: str = "easy"  # easy | moderate | hard: what the run logger understands
    structure: str = ""
    blocks: tuple = ()  # ((block, minutes, ((what, sets, reps, notes), ...)), ...)
    notes: tuple[str, ...] = ()


EFFORT = {  # key → (row label, phrase inside a structure line)
    "steady": ("Steady · RPE 5–6", "steady (RPE 5–6: short sentences only)"),
    "tempo": (
        "Comfortably hard · RPE 6–7",
        "comfortably hard (RPE 6–7: a few words at a time)",
    ),
    "race": (
        "Half-marathon effort · RPE 6",
        "at half-marathon effort (RPE 6: strong but sustainable)",
    ),
}


def _with_note(s: str, note: str | None) -> str:
    return f"{s} {note}" if note else s


def _easy_rows(minutes: int) -> tuple:
    return (("Easy running", 1, f"{minutes} min", "Conversational"),)


def _easy(minutes: int, *, strides: int = 0, note: str | None = None) -> RunSpec:
    s = f"{minutes} min easy and conversational (RPE 3–4)" + (
        f", then {strides} × 20 s strides: quick and relaxed, walking back between."
        if strides
        else ". Slow down or walk if you can't talk in full sentences."
    )
    return RunSpec("E", "Easy run", minutes=minutes, structure=_with_note(s, note))


def _long(miles: float, *, fuel: bool = False, note: str | None = None) -> RunSpec:
    s = f"{miles:g} miles easy (RPE 3–5): time on your feet, not pace. Walk breaks are fine."
    if fuel:
        s += " Practise race fuel: a gel, chews or sports drink about every 40 min, plus water."
    return RunSpec("L", "Long run", miles=miles, structure=_with_note(s, note))


def _steady(
    easy: int, steady: int, *, cool: int = 0, title: str = "Steady run"
) -> RunSpec:
    label, phrase = EFFORT["steady"]
    s = f"{easy} min easy · {steady} min {phrase}" + (
        f" · {cool} min easy" if cool else ""
    )
    blocks = [
        ("Easy", easy, _easy_rows(easy)),
        (
            "Steady",
            steady,
            ((label, 1, f"{steady} min", "Hold it even; don't race it"),),
        ),
    ]
    if cool:
        blocks.append(("Cool-down", cool, _easy_rows(cool)))
    return RunSpec(
        "Q",
        title,
        minutes=easy + steady + cool,
        intensity="moderate",
        structure=s,
        blocks=tuple(blocks),
    )


def _reps(
    title: str,
    sets: int,
    rep: int,
    effort: str,
    jog: int,
    *,
    warm: int = 10,
    cool: int = 10,
) -> RunSpec:
    label, phrase = EFFORT[effort]
    work = sets * rep + (sets - 1) * jog
    s = f"{warm} min easy · {sets} × {rep} min {phrase}, {jog} min easy jog between · {cool} min easy"
    blocks = (
        ("Warm-up", warm, _easy_rows(warm)),
        (title, work, ((label, sets, f"{rep} min", f"{jog} min easy jog between"),)),
        ("Cool-down", cool, _easy_rows(cool)),
    )
    return RunSpec(
        "Q",
        title,
        minutes=warm + work + cool,
        intensity="moderate",
        structure=s,
        blocks=blocks,
    )


def _hills(sets: int, *, warm: int = 10, cool: int = 10) -> RunSpec:
    work = math.ceil(sets * 2.5)
    s = (
        f"{warm} min easy to a hill · {sets} × 60 s strong uphill (RPE 7–8), walk or jog back "
        f"down · {cool} min easy. No hill nearby? A treadmill at 5–6 % incline works."
    )
    blocks = (
        ("Warm-up", warm, _easy_rows(warm)),
        (
            "Hills",
            work,
            (
                (
                    "Strong uphill · RPE 7–8",
                    sets,
                    "60 sec",
                    "Tall, quick feet; walk or jog back down",
                ),
            ),
        ),
        ("Cool-down", cool, _easy_rows(cool)),
    )
    return RunSpec(
        "Q",
        "Hill repeats",
        minutes=warm + work + cool,
        intensity="hard",
        structure=s,
        blocks=blocks,
    )


def _fartlek(minutes: int, sets: int) -> RunSpec:
    s = (
        f"{minutes} min easy; after the first 10, run {sets} × 1 min a little quicker "
        "(RPE 6–7) with easy running between."
    )
    blocks = (
        ("Warm-up", 10, _easy_rows(10)),
        (
            "Fartlek",
            minutes - 10,
            (
                (
                    "A little quicker · RPE 6–7",
                    sets,
                    "1 min",
                    "Easy running between, as long as you need",
                ),
            ),
        ),
    )
    return RunSpec(
        "Q",
        "Fartlek",
        minutes=minutes,
        intensity="moderate",
        structure=s,
        blocks=blocks,
    )


# Weeks before race week → that week's three runs. The long run starts where the owner was in
# October 2026 (one or two runs a week) and peaks at 11 miles two weeks out; weeks 7 and 3 cut back.
RACE_BUILD: dict[int, dict[str, RunSpec]] = {
    10: {"E": _easy(30), "Q": _steady(20, 10, title="Steady finish"), "L": _long(5)},
    9: {"E": _easy(30), "Q": _reps("Tempo run", 3, 5, "tempo", 2), "L": _long(6)},
    8: {"E": _easy(35, strides=4), "Q": _hills(6), "L": _long(7)},
    7: {
        "E": _easy(30),
        "Q": _fartlek(30, 6),
        "L": _long(5, note="Cutback week: lighter on purpose."),
    },
    6: {
        "E": _easy(35, strides=6),
        "Q": _reps("Tempo run", 3, 8, "tempo", 2),
        "L": _long(8, fuel=True),
    },
    5: {
        "E": _easy(40, strides=6),
        "Q": _hills(8),
        "L": _long(
            9, fuel=True, note="Run the last mile steady (RPE 5–6) if it feels good."
        ),
    },
    4: {
        "E": _easy(40, strides=6, note=WARM),
        "Q": _reps("Tempo run", 2, 12, "tempo", 3),
        "L": _long(10, fuel=True),
    },
    3: {
        "E": _easy(30, note=WARM),
        "Q": _steady(10, 15, cool=5),
        "L": _long(7, note="Cutback week before the longest run."),
    },
    2: {
        "E": _easy(40, strides=6, note=WARM),
        "Q": _reps("Race-effort run", 3, 10, "race", 2, cool=5),
        "L": _long(
            11,
            fuel=True,
            note="The longest run of the block. Feeling good? Run miles 9–10 at race effort, "
            "then an easy last mile.",
        ),
    },
}

# Days from race day → the day, for the taper week, race week and recovery week. Days not listed
# rest (before the race) or carry a walk and the mobility routine (after it).
RACE_TEMPLATE: dict[int, RunSpec | str] = {
    -13: "S1",
    -12: _reps("Race-effort run", 2, 8, "race", 2),
    -11: _long(6, note="The last longer run before race week."),
    -8: _easy(
        25,
        note="Just landed after a long flight? Run outside in daylight: it resets the body clock faster.",
    ),
    -7: _easy(35),
    -5: _reps("Race-effort run", 3, 4, "race", 2, cool=5),
    -4: _easy(30),
    -3: _easy(25, strides=4),
    -1: RunSpec(
        "E",
        "Shakeout",
        minutes=15,
        structure="15 min very easy, then 3 × 20 s strides. Lay out your kit, eat a familiar "
        "dinner, feet up.",
    ),
    0: "RACE",
    3: _easy(20, note="Only if your legs feel normal; a walk counts just as much."),
    7: _easy(25, note="The first run back: short and easy."),
}
RECOVERY_DAYS = (1, 2, 4, 5, 6)  # after the race: a walk and the mobility routine


def race_day_spec(
    race: Race, easy_pace: int = EASY_PACE, history: History | None = None
) -> RunSpec:
    """Race day by effort: start easy, settle into race effort, finish with what's left. If the
    longest run you logged in the last six weeks fell short of 9 miles, walk breaks come in."""
    s = (
        "Start slower than feels right: miles 1–3 easy (RPE 5). Settle into race effort (RPE 6) "
        "through mile 10, then use whatever is left. Sip at every aid station, and take a gel or "
        "chews about every 40 min, as practised. Warm and humid? Start easier still and pour "
        "water over your head."
    )
    longest = (
        max(
            (r.miles for r in history.runs_between(race.date - 42 * DAY, race.date)),
            default=None,
        )
        if history
        else None
    )
    if longest is not None and longest < 9:
        s = (
            f"Your longest run in the last six weeks was {longest:g} miles, so walk a minute at "
            f"every mile marker from mile {max(1, math.floor(longest) - 3)}: walking early is how "
            "you finish strong. " + s
        )
    minutes = round(race.miles * (easy_pace - 30) / 60)
    blocks = (
        (
            "Warm-up",
            8,
            (
                (
                    "Easy jog",
                    1,
                    "5 min",
                    "Then leg swings 10/side and 2 relaxed strides",
                ),
            ),
        ),
        (
            "The race",
            minutes,
            (
                (
                    "Miles 1–3 · easy, RPE 5",
                    1,
                    "3 mi",
                    "Let people go; you'll see them again",
                ),
                (
                    "Miles 4–10 · race effort, RPE 6",
                    1,
                    "7 mi",
                    "Strong but sustainable: a few words at a time",
                ),
                (
                    f"Miles 11–{race.miles:g} · what's left",
                    1,
                    f"{race.miles - 10:g} mi",
                    "Finish strong",
                ),
            ),
        ),
    )
    return RunSpec(
        "RACE",
        race.name,
        minutes=minutes,
        miles=race.miles,
        intensity="hard",
        structure=s,
        blocks=blocks,
        notes=(
            "Nothing new on race day: shoes, kit, breakfast and fuel you have already run in.",
            "Afterwards: walk 10 minutes, drink, and eat within the hour.",
        ),
    )


def run_label(spec: RunSpec) -> str:
    return (
        f"{spec.title} · {spec.miles:g} mi"
        if spec.miles
        else f"{spec.title} · {spec.minutes} min"
    )


# ---------------------------------------------------------------------------
# Adapting to what you log (docs/TRAINING-GOLF.md §13). Without a history the plan runs as
# written. With one, the long run builds from the runs you logged, a run that felt harder than
# planned is repeated, the first week back after time off is easier, and Session 2's golf
# rotation steps aside while the running is taking it out of you.
# ---------------------------------------------------------------------------

GAP_DAYS = 10  # this many days with nothing logged, and the week after it eases back in
LOOKBACK = datetime.timedelta(
    days=21
)  # "your longest recent run" looks back three weeks
LONG_STEP = 1.0  # the long run is at most a mile past your longest recent run...
CATCH_UP_STEP = (
    1.5  # ...or 1.5 when it's 2+ miles behind the plan and that run felt easy
)
FIRST_LONG = 4.0  # the long run when no run has been logged for three weeks
TOO_HARD = {"easy": 8, "moderate": 8, "hard": 9}  # a logged RPE harder than planned


@dataclass(frozen=True)
class LoggedRun:
    date: datetime.date
    miles: float
    rpe: int | None = None
    intensity: str = "easy"  # easy | moderate | hard, as the run logger records it


@dataclass(frozen=True)
class History:
    """What you've logged: runs, and the days you lifted (a session finished or with sets in it)."""

    runs: tuple[LoggedRun, ...] = ()
    lifted: tuple[datetime.date, ...] = ()

    def trained_before(self, d: datetime.date) -> list[datetime.date]:
        return sorted(
            {x for x in self.lifted if x < d}
            | {r.date for r in self.runs if r.date < d}
        )

    def runs_between(self, start: datetime.date, end: datetime.date) -> list[LoggedRun]:
        return sorted(
            (r for r in self.runs if start <= r.date < end), key=lambda r: r.date
        )


def _too_hard(run: LoggedRun) -> bool:
    return (run.rpe or 0) >= TOO_HARD.get(run.intensity, 8)


def _half_down(miles: float) -> float:
    return math.floor(miles * 2) / 2


def _build_week(race: Race, d: datetime.date) -> int:
    """Weeks from d's week to race week."""
    return (race_window(race)["week"] - week_start(d)).days // 7


def days_off_before(d: datetime.date, history: History | None) -> int | None:
    """How many days you were off, when d is in your first week back after GAP_DAYS or more
    with nothing logged; otherwise None. Nothing logged at all is a fresh start, not a comeback."""
    if history is None:
        return None
    seq = [*history.trained_before(d), d]
    for prev, nxt in zip(reversed(seq[:-1]), reversed(seq[1:])):
        if (d - nxt).days >= 7:
            break
        if (nxt - prev).days - 1 >= GAP_DAYS:
            return (nxt - prev).days - 1
    return None


def long_run_miles(
    race: Race, d: datetime.date, history: History | None
) -> tuple[float, str | None]:
    """A build week's long run in miles, and why when it isn't the plan's. The plan's distance is
    the ceiling; your longest run of the last three weeks sets how close you get to it."""
    ws, wtr = week_start(d), _build_week(race, d)
    plan = RACE_BUILD[wtr]["L"].miles
    if history is None or not (history.runs or history.lifted):
        return plan, None
    recent = history.runs_between(ws - LOOKBACK, ws)
    if not recent:
        miles, why = FIRST_LONG, "no runs logged in three weeks"
    else:
        longest = max(recent, key=lambda r: r.miles)
        last = max(
            history.runs_between(ws - 7 * DAY, ws), key=lambda r: r.miles, default=None
        )
        if last and last.miles < 0.75 * longest.miles:
            last = None  # last week had no long run in it
        if wtr in RACE_CUTBACKS:
            miles, why = (
                0.75 * longest.miles,
                f"a cutback from your {longest.miles:g} mi",
            )
        elif last and _too_hard(last):
            miles, why = (
                last.miles,
                f"a repeat: the last long run felt hard, RPE {last.rpe}",
            )
        elif days_off_before(d, history) is not None:
            miles, why = longest.miles, "first week back, so no step up"
        else:
            behind = plan - longest.miles >= 2 and (longest.rpe or 10) <= 5
            step = CATCH_UP_STEP if behind else LONG_STEP
            miles, why = (
                longest.miles + step,
                f"{step:g} mi past your longest recent run",
            )
    miles = max(3.0, min(plan, _half_down(miles)))
    return miles, None if miles == plan else f"{why} (plan: {plan:g} mi)"


def quality_run(
    race: Race, d: datetime.date, history: History | None
) -> tuple[RunSpec, str | None]:
    """A build week's quality run, and why when it isn't the plan's: easy running in your first
    week back, last week's session again when the last one felt harder than planned."""
    ws, wtr = week_start(d), _build_week(race, d)
    spec = RACE_BUILD[wtr]["Q"]
    if history is None:
        return spec, None
    off = days_off_before(d, history)
    if off is not None:
        return (
            _easy(min(30, spec.minutes or 30), strides=4),
            f"first week back after {off} days off: easy, no hard running",
        )
    hard = [r for r in history.runs_between(ws - 10 * DAY, ws) if r.intensity != "easy"]
    if (
        hard
        and _too_hard(hard[-1])
        and wtr not in RACE_CUTBACKS
        and wtr + 1 in RACE_BUILD
    ):
        return (
            RACE_BUILD[wtr + 1]["Q"],
            f"a repeat: the last quality run felt hard, RPE {hard[-1].rpe}",
        )
    return spec, None


def build_run(
    race: Race, d: datetime.date, sid: str | None, history: History | None = None
) -> tuple[RunSpec | None, str | None]:
    """A build-week run adapted to your log, and why when it isn't the plan's."""
    spec = RACE_BUILD.get(_build_week(race, d), {}).get(sid or "")
    if spec is None:
        return None, None
    if sid == "Q":
        return quality_run(race, d, history)
    if sid == "L":
        miles, why = long_run_miles(race, d, history)
        if miles != spec.miles:
            spec = replace(
                spec,
                miles=miles,
                structure=spec.structure.replace(
                    f"{spec.miles:g} miles", f"{miles:g} miles", 1
                ),
            )
        return spec, why
    return spec, None


def golf_rotation_off(d: datetime.date, history: History | None) -> str | None:
    """Why Session 2 leaves out its golf rotation on d, or None when it's in: your first week
    back, or a run in the last seven days that felt harder than planned."""
    if history is None:
        return None
    if days_off_before(d, history) is not None:
        return "first week back"
    hard = [r for r in history.runs_between(d - 7 * DAY, d) if _too_hard(r)]
    return f"{hard[-1].date:%a}'s run felt hard, RPE {hard[-1].rpe}" if hard else None


def ease_in(e: dict, *, sets: bool = True) -> dict:
    """An exercise in your first week back: 2 sets at most, RPE 6–7 and about 10 % lighter. A
    lighter week has already trimmed the sets, so then only the effort and the load change."""
    e = dict(e)
    if sets:
        e["sets"] = min(e["sets"], 2)
    e["rpe"] = "6–7"
    if e.get("load"):
        step = 2.5 if e["load"] < 40 else 5.0
        e["load"] = max(step, round(e["load"] * 0.9 / step) * step)
        e["load_note"] = "about 10 % lighter for your first week back"
    return e


def _planned(
    d: datetime.date,
    detail: dict,
    race: Race | None,
    easy_pace: int = EASY_PACE,
    history: History | None = None,
) -> tuple[RunSpec | None, str | None]:
    if race is None:
        return None, None
    if detail.get("run") == "RACE":
        return race_day_spec(race, easy_pace, history), None
    off = detail.get("offset")
    if off is not None:
        spec = RACE_TEMPLATE.get(off)
        return (spec if isinstance(spec, RunSpec) else None), None
    return build_run(race, d, detail.get("run"), history)


def planned_spec(
    d: datetime.date,
    detail: dict,
    race: Race | None,
    easy_pace: int = EASY_PACE,
    history: History | None = None,
) -> RunSpec | None:
    """The run a planned day carries: the build table by week (adapted to your log), the
    template by day from the race."""
    return _planned(d, detail, race, easy_pace, history)[0]


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
    adjusted: str | None = (
        None  # run | rest | golf | swap | move | shorten (your change)
    )
    detail: dict | None = None  # the pin: miles/minutes/session/id


def _pin_plan(d: datetime.date, pin: dict, travel: bool) -> DayPlan | None:
    """A day you changed: an outdoor run, a rest day or golf. Sessions (swap/move) are placed by the planner."""
    k = pin.get("kind")
    if k == "run":
        miles = pin.get("miles")
        mins = pin.get("minutes")
        label = (
            f"Outdoor run · {miles:g} mi"
            if miles
            else f"Run · {mins} min"
            if mins
            else "Outdoor run"
        )
        return DayPlan(d, "RUN", label, travel=travel, adjusted="run", detail=pin)
    if k == "rest":
        return DayPlan(
            d,
            None,
            pin.get("label") or "Rest (your call)",
            travel=travel,
            adjusted="rest",
            detail=pin,
        )
    if k == "golf":
        return DayPlan(
            d, None, "Golf (your call)", travel=travel, adjusted="golf", detail=pin
        )
    return None


def _big_run(pin: dict) -> bool:
    return pin.get("kind") == "run" and (
        (pin.get("miles") or 0) >= 3 or (pin.get("minutes") or 0) >= 30
    )


def _moved_onto(d: datetime.date, pin: dict, race: Race) -> DayPlan:
    """A session you swapped or moved onto a day of the race template."""
    sid = pin["session"]
    if sid in SESSIONS:
        return DayPlan(
            d,
            sid,
            session_title(sid, True),
            note="your change",
            adjusted=pin["kind"],
            detail=pin,
        )
    src = pin.get("from_date")
    off = (datetime.date.fromisoformat(src) - race.date).days if src else None
    if off is None or not isinstance(RACE_TEMPLATE.get(off), RunSpec):
        # swapped in without a source day: this week's run of that kind
        off = next(
            (
                o
                for o, t in sorted(RACE_TEMPLATE.items())
                if isinstance(t, RunSpec)
                and t.kind == sid
                and week_start(race.date + datetime.timedelta(days=o)) == week_start(d)
            ),
            None,
        )
    spec = RACE_TEMPLATE.get(off) if off is not None else None
    if not isinstance(spec, RunSpec):
        return DayPlan(d, None, "Rest or golf")
    return DayPlan(
        d,
        "RUN",
        run_label(spec),
        note="your change",
        adjusted=pin["kind"],
        detail={**pin, "planned": True, "run": sid, "offset": off},
    )


def _race_week(
    ws: datetime.date,
    race: Race,
    *,
    travel_days: set[datetime.date],
    pins: dict[datetime.date, dict],
) -> list[DayPlan]:
    """Taper week, race week and recovery week: a day-by-day template around race day. Travel
    days carry mobility (race day stays); your changes take their day, nothing is relocated."""
    out = []
    for d in (ws + datetime.timedelta(days=i) for i in range(7)):
        off = (d - race.date).days
        pin = pins.get(d)
        travel = d in travel_days
        pp = _pin_plan(d, pin, travel) if pin else None
        if pp:
            out.append(pp)
            continue
        if (
            pin
            and pin.get("kind") in ("swap", "move")
            and pin.get("session") in SWAPPABLE
            and not travel
        ):
            out.append(_moved_onto(d, pin, race))
            continue
        tpl = RACE_TEMPLATE.get(off)
        if travel and off != 0:
            dp = DayPlan(d, "MOB", "Travel · 8-min mobility", travel=True)
        elif tpl == "RACE":
            dp = DayPlan(
                d,
                "RUN",
                f"Race day · {race.name}",
                travel=travel,
                detail={"planned": True, "run": "RACE"},
            )
        elif tpl == "S1":
            dp = DayPlan(
                d,
                "S1",
                SESSIONS["S1"]["title"],
                note="short and familiar: the last lifting before the race",
            )
        elif isinstance(tpl, RunSpec):
            dp = DayPlan(
                d,
                "RUN",
                run_label(tpl),
                detail={"planned": True, "run": tpl.kind, "offset": off},
            )
        elif off in RECOVERY_DAYS:
            dp = DayPlan(d, "MOB", "Recovery · walk and mobility")
        else:
            dp = DayPlan(d, None, "Rest · mobility" if off < 0 else "Rest or golf")
        if pin and pin.get("kind") == "shorten" and dp.session not in (None, "MOB"):
            dp.adjusted = "shorten"
            dp.detail = {**(dp.detail or {}), **pin}
            dp.note = (
                dp.note + " · " if dp.note else ""
            ) + f"capped at {pin.get('minutes')} min"
        out.append(dp)
    return out


def plan_week(
    ws: datetime.date,
    *,
    travel_days: set[datetime.date],
    tournaments: list[datetime.date],
    five_sessions: bool = True,
    golf_days: set[datetime.date] | None = None,
    pins: dict[datetime.date, dict] | None = None,
    not_before: datetime.date | None = None,
    race: Race | None = None,
    history: History | None = None,
) -> list[DayPlan]:
    """Lay the week out around travel, tournaments and your own changes (pins).

    pins: {date: {"kind": run|rest|golf|swap|move|shorten, "session": "S3", "miles": 6, "minutes": 45, ...}}
      run/rest/golf take the day; the session that was there is moved to the nearest free day
      (lower-body sessions stay 48 h apart; nothing is stacked; nothing moves into the past).
      swap/move put the named session on that day. shorten keeps the session and caps its minutes.
      A run of 3+ miles (or 30+ min) covers the week's running, so Session 5 is dropped that week.

    With a race: its ten build weeks use the race layout (S1 Mon, easy run Tue, quality run Wed,
    S2 Thu, long run Sat; the quality and long runs stay 48 h apart and the easy run is the
    optional one), and taper week, race week and recovery week follow the race template.

    With a history (what you've logged), the build runs adapt to it and a day's note says why;
    so does a session in your first week back and a Session 2 without its golf rotation.
    """
    pins = {
        d: p
        for d, p in (pins or {}).items()
        if ws <= d <= ws + datetime.timedelta(days=6)
    }
    days = [ws + datetime.timedelta(days=i) for i in range(7)]

    # The programme has a first day. Nothing is planned before it, and it opens with Session 1
    # wherever in the week it falls, so the first thing you do is the first session. From the
    # following Monday the normal rhythm takes over untouched.
    if ws + datetime.timedelta(days=6) < PROGRAM_START:
        return [
            DayPlan(d, None, "Before the programme starts", travel=d in travel_days)
            for d in days
        ]
    if (
        ws <= PROGRAM_START <= ws + datetime.timedelta(days=6)
        and PROGRAM_START.weekday() != 0
    ):
        out = []
        for d in days:
            pp = _pin_plan(d, pins[d], d in travel_days) if d in pins else None
            if pp:
                out.append(pp)
            elif d < PROGRAM_START:
                out.append(
                    DayPlan(
                        d, None, "Before the programme starts", travel=d in travel_days
                    )
                )
            elif d in travel_days:
                # Away days carry mobility only, the same as in any other week.
                out.append(DayPlan(d, "MOB", "Travel · 8-min mobility", travel=True))
            elif d == PROGRAM_START:
                out.append(DayPlan(d, "S1", SESSIONS["S1"]["title"]))
            else:
                out.append(DayPlan(d, None, "Rest or golf"))
        return out

    if race_week_kind(ws, race):
        return _race_week(ws, race, travel_days=travel_days, pins=pins)

    t = tournament_in_week(ws, tournaments)
    if t is not None:
        out = []
        for d in days:
            pp = _pin_plan(d, pins[d], d in travel_days) if d in pins else None
            if pp:
                out.append(pp)
                continue
            off = (d - t).days
            tpl = TOURNAMENT_TEMPLATE.get(off)
            if d in travel_days and tpl and tpl[0] not in ("T-event",):
                out.append(DayPlan(d, "MOB", "Travel · 8-min mobility", travel=True))
            elif tpl:
                out.append(DayPlan(d, tpl[0], tpl[1], travel=d in travel_days))
            else:
                out.append(DayPlan(d, None, "Rest or golf", travel=d in travel_days))
        return out

    building = in_race_build(ws, race)
    layout = RACE_WEEK if building else DEFAULT_WEEK
    priority = RACE_PRIORITY if building else PRIORITY
    optional = "E" if building else "S5"
    valid = set(SESSIONS) | (set(RUN_IDS) if building else set())
    wanted = [
        layout[i] for i in sorted(layout) if five_sessions or layout[i] != optional
    ]
    optional_dropped_for_run = False
    if any(_big_run(p) for p in pins.values()) and optional in wanted:
        wanted.remove(optional)
        optional_dropped_for_run = True

    # sessions you pinned explicitly (swap / move) take their day first
    assigned: dict[datetime.date, str] = {}
    for d, pin in pins.items():
        sid = pin.get("session")
        if (
            pin.get("kind") in ("swap", "move")
            and sid in valid
            and d not in travel_days
        ):
            assigned[d] = sid
            if sid not in wanted:
                wanted.append(sid)
    blocked = set(travel_days) | {
        d for d, p in pins.items() if p.get("kind") in ("run", "rest", "golf")
    }
    free = [d for d in days if d not in blocked]
    # keep the default day when it is free; otherwise move to the nearest free day still unused
    for wd, sid in layout.items():
        if sid not in wanted or sid in assigned.values():
            continue
        d = ws + datetime.timedelta(days=wd)
        if d in free and d not in assigned:
            assigned[d] = sid
    relocatable = [d for d in free if not_before is None or d >= not_before]
    for sid in [s for s in priority if s in wanted and s not in assigned.values()]:
        default_d = ws + datetime.timedelta(
            days=next(k for k, v in layout.items() if v == sid)
        )
        candidates = sorted(
            (d for d in relocatable if d not in assigned),
            key=lambda d: (abs((d - default_d).days), d),
        )
        for d in candidates:
            # lower-body sessions want 48 h from each other, and so do the two hard runs
            if sid in LOWER_BODY and any(
                v in LOWER_BODY and abs((d - dd).days) < 2 for dd, v in assigned.items()
            ):
                continue
            if sid in HARD_RUNS and any(
                v in HARD_RUNS and abs((d - dd).days) < 2 for dd, v in assigned.items()
            ):
                continue
            assigned[d] = sid
            break
    out = []
    dropped = [s for s in wanted if s not in assigned.values()]
    for d in days:
        pp = _pin_plan(d, pins[d], d in travel_days) if d in pins else None
        if pp:
            out.append(pp)
        elif d in travel_days:
            out.append(DayPlan(d, "MOB", "Travel · 8-min mobility", travel=True))
        elif d in assigned:
            sid = assigned[d]
            pin = pins.get(d)
            moved = layout.get(d.weekday()) != sid
            note = None
            if pin and pin.get("kind") in ("swap", "move"):
                note = "your change"
            elif moved:
                note = (
                    "moved around travel" if travel_days else "moved around your change"
                )
            if sid in RUN_IDS:
                spec, why = build_run(race, d, sid, history)
                dp = DayPlan(
                    d,
                    "RUN",
                    run_label(spec),
                    note=" · ".join(x for x in (note, why) if x) or None,
                    detail={"planned": True, "run": sid},
                )
            else:
                dp = DayPlan(d, sid, session_title(sid, building), note=note)
                off = days_off_before(d, history)
                golf = (
                    golf_rotation_off(d, history)
                    if building and sid == "S2" and off is None
                    else None
                )
                why = (
                    "first week back: 2 sets each, RPE 6–7"
                    if off is not None and sid != "S5"  # S5 is easy work already
                    else f"golf rotation off: {golf}"
                    if golf
                    else None
                )
                if why:
                    dp.note = (dp.note + " · " if dp.note else "") + why
            if pin and pin.get("kind") == "shorten":
                dp.adjusted = "shorten"
                dp.detail = {**(dp.detail or {}), **pin}
                dp.note = (
                    dp.note + " · " if dp.note else ""
                ) + f"capped at {pin.get('minutes')} min"
            elif pin and pin.get("kind") in ("swap", "move"):
                dp.adjusted = pin["kind"]
                dp.detail = {**(dp.detail or {}), **pin}
            out.append(dp)
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
    # the day after a real run: heavy legs / no intervals
    for i, dp in enumerate(out[1:], start=1):
        prev = out[i - 1]
        if (
            prev.session == "RUN"
            and _big_run(prev.detail or {})
            and dp.session in SESSIONS
        ):
            extra = (
                "legs may be heavy after yesterday's run — hold loads, RPE 7"
                if dp.session in LOWER_BODY
                else "run block easy 15 min today, no intervals (you ran yesterday)"
                if dp.session == "S2" and not building
                else None
            )
            if extra:
                dp.note = (dp.note + " · " if dp.note else "") + extra
    notes = []
    if optional_dropped_for_run:
        notes.append(
            ("The easy run" if building else "Session 5")
            + " dropped this week — your run covers it"
        )
    if dropped:
        notes.append(
            "Not enough free days this week — dropped "
            + ", ".join(RUN_NAMES.get(s, s) for s in dropped)
            + " (no catch-up work)"
        )
    if notes:
        note = " · ".join(notes)
        target = next(
            (dp for dp in out if dp.session and dp.session.startswith("S")),
            next((dp for dp in out if dp.session and dp.session != "MOB"), None),
        )
        if target:
            target.note = (target.note + " · " if target.note else "") + note
    return out


def run_prescription(
    d: datetime.date,
    pin: dict,
    *,
    first_event: datetime.date = FIRST_EVENT_DEFAULT,
    lighter: bool | None = None,
    race: Race | None = None,
) -> dict:
    """An outdoor run you chose instead of the gym, in the same shape as a session prescription."""
    phase = phase_for(d, first_event, race)
    lighter = is_lighter_week(d, race=race) if lighter is None else lighter
    miles = pin.get("miles")
    minutes = pin.get("minutes") or (round(miles * 9.5) if miles else 40)
    intensity = pin.get("intensity") or "easy"
    if intensity == "hard":
        structure = "10 min easy · middle miles at a steady, strong effort (RPE 7–8) · last 5 min easy"
    elif intensity == "moderate":
        structure = "Steady, conversational-to-brisk (RPE 5–6); pick it up over the last mile if you feel good"
    else:
        structure = "Easy and conversational (RPE 3–5). Time on feet, not pace."
    title = f"Outdoor run · {miles:g} mi" if miles else f"Outdoor run · {minutes} min"
    rules = [
        "This replaces today's gym session; the session moves to the nearest free day (nothing is stacked).",
        "It counts as this week's easy run, which is dropped. Keep the long run as planned."
        if in_race_build(d, race)
        else "It counts as this week's running — Session 5 is dropped and tomorrow's intervals become easy running.",
        "Finish with the 8-minute mobility routine. If legs are heavy tomorrow, hold loads and keep RPE 7.",
    ]
    if lighter:
        rules.append("Lighter week: keep it genuinely easy.")
    if phase.key in ("pre_event", "in_season"):
        rules.append(
            "Pre-event/in-season: keep runs 20–40 min easy; freshness beats fitness now."
        )
    return {
        "session": "RUN",
        "title": title,
        "phase": phase.key,
        "phase_name": phase.name,
        "phase_notes": phase.notes,
        "week_kind": "lighter" if lighter else "normal",
        "rotation": rotation_week(d),
        "target_minutes": [max(15, minutes - 5), minutes + 5],
        "budget": f"Run {minutes} min · mobility 8 min",
        "warmup": ["Walk 3 min", "Leg swings 10/side", "Easy first half mile"],
        "blocks": [],
        "run": {
            "minutes": minutes,
            "miles": miles,
            "intensity": intensity,
            "structure": structure,
        },
        "mobility": DAILY_MOBILITY,
        "rules": rules,
        "estimated_duration_minutes": minutes + 8,
    }


def planned_run(
    d: datetime.date,
    detail: dict,
    *,
    race: Race,
    first_event: datetime.date = FIRST_EVENT_DEFAULT,
    lighter: bool | None = None,
    easy_pace: int = EASY_PACE,
    history: History | None = None,
) -> dict | None:
    """A run from the half-marathon block, in the same shape as a session prescription."""
    spec, why = _planned(d, detail, race, easy_pace, history)
    if spec is None:
        return None
    phase = phase_for(d, first_event, race)
    lighter = is_lighter_week(d, race=race) if lighter is None else lighter
    minutes = spec.minutes or round((spec.miles or 0) * easy_pace / 60)
    window = (
        [max(10, round(minutes * 0.9)), round(minutes * 1.1)]
        if spec.miles
        else [minutes, minutes + 5]
    )
    rules = {
        "E": [
            "Easy means easy: if you can't talk in full sentences, slow down or walk."
        ],
        "Q": [
            "By effort, not pace. Stop the hard pieces early if your form falls apart or anything hurts sharply."
        ],
        "L": [
            "Easy and conversational the whole way. Walk breaks are fine; the distance is the point."
        ],
        "RACE": [],
    }[spec.kind] + list(spec.notes)
    if spec.kind != "RACE":
        rules.append("Finish with the 8-minute mobility routine.")
    if why:
        rules.insert(0, f"Adapted to your log: {why}.")
    race_day = spec.kind == "RACE"
    return {
        "session": "RUN",
        "run_kind": spec.kind,
        "title": f"Race day · {spec.title}" if race_day else run_label(spec),
        "phase": phase.key,
        "phase_name": phase.name,
        "phase_notes": phase.notes,
        "week_kind": race_week_kind(d, race) or ("lighter" if lighter else "normal"),
        "rotation": rotation_week(d),
        "target_minutes": window,
        "budget": f"{spec.miles:g} miles"
        if race_day
        else f"Run {minutes} min · mobility 8 min",
        "warmup": []
        if spec.blocks
        else ["Walk 3 min", "Leg swings 10/side", "Start slower than you think"],
        "blocks": [
            {
                "name": name,
                "minutes": mins,
                "exercises": [
                    ex(what, sets, reps, "run", notes=notes)
                    for what, sets, reps, notes in rows
                ],
            }
            for name, mins, rows in spec.blocks
        ],
        "run": {
            "minutes": minutes,
            "miles": spec.miles,
            "intensity": spec.intensity,
            "structure": spec.structure,
            "kind": spec.kind,
        },
        "mobility": DAILY_MOBILITY,
        "rules": rules,
        "estimated_duration_minutes": minutes + (0 if race_day else 8),
        "adapted": why,
    }


def shorten_run(p: dict, cap: int) -> dict:
    """Cap a planned run at `cap` minutes: an easy or long run just gets shorter; a quality run
    keeps its warm-up and fits what it can of the main set. Nothing is made up later."""
    import copy

    p = copy.deepcopy(p)
    run = p["run"]
    if (run.get("minutes") or 0) <= cap:
        return p
    if run.get("kind") == "Q":
        run["structure"] = (
            f"Capped at {cap} min: 10 min easy, as much of the main set as fits, then a few "
            "easy minutes. " + run["structure"]
        )
    else:
        run["structure"] = f"Capped at {cap} min, easy and conversational."
        p["blocks"] = []
    run["minutes"] = cap
    run["miles"] = None
    p["target_minutes"] = [max(10, cap - 5), cap]
    p["estimated_duration_minutes"] = cap + 8
    p["rules"] = [f"Capped at {cap} min — no need to make it up."] + list(
        p.get("rules", [])
    )
    p["shortened_to"] = cap
    return p


def shorten(p: dict, cap: int) -> dict:
    """Cap a prescription at `cap` minutes the way the plan says: drop the last accessory exercises
    (omit-first ones go first), then a set from the main lifts. Warm-up and rests stay."""
    import copy

    p = copy.deepcopy(p)
    est = int(p.get("estimated_duration_minutes") or p["target_minutes"][1])
    if est <= cap:
        return p
    removed: list[str] = []
    if p.get("run") and cap < 60 and (p["run"].get("minutes") or 0) > 15:
        p["run"] = {
            **p["run"],
            "minutes": 15,
            "structure": "15 min easy — shortened day, no intervals",
        }
        est -= (p["run"].get("minutes") or 18) - 15 + 3
    order: list[tuple[int, int]] = []
    for bi, b in enumerate(p["blocks"]):
        for ei, e in enumerate(b["exercises"]):
            if e.get("kind") in ("accessory", "core", "carry"):
                order.append((bi, ei))
    order.sort(
        key=lambda t: (
            0 if p["blocks"][t[0]]["exercises"][t[1]].get("omit_first") else 1,
            -t[0],
            -t[1],
        )
    )
    for bi, ei in order:
        if est <= cap:
            break
        e = p["blocks"][bi]["exercises"][ei]
        e["_drop"] = True
        removed.append(e["name"])
        est -= max(4, int(e["sets"] * 1.5) + 1)
    for b in p["blocks"]:
        b["exercises"] = [e for e in b["exercises"] if not e.get("_drop")]
    p["blocks"] = [b for b in p["blocks"] if b["exercises"]]
    if est > cap:
        for b in p["blocks"]:
            for e in b["exercises"]:
                if e.get("kind") == "main" and e["sets"] > 2 and est > cap:
                    e["sets"] -= 1
                    est -= 3
                    removed.append(f"one set of {e['name']}")
    # The window sits below the cap, never above it: a 15-minute cap once produced a
    # "20-15 min" range because the floor ignored how short the day had become.
    p["target_minutes"] = [min(cap, max(10, cap - 10)), cap]
    p["estimated_duration_minutes"] = min(est, cap)
    p["rules"] = [
        f"Capped at {cap} min: dropped {', '.join(removed) if removed else 'nothing'}. Keep the warm-up and needed rest; never make it up after."
    ] + list(p.get("rules", []))
    p["shortened_to"] = cap
    return p


def after_run(p: dict) -> dict:
    """Session 2 the day after a real run: run block goes easy, no intervals."""
    import copy

    p = copy.deepcopy(p)
    if p.get("run"):
        p["run"] = {
            **p["run"],
            "minutes": 15,
            "structure": "15 min easy, conversational — you ran yesterday; no intervals",
        }
    p["rules"] = ["You ran yesterday: no intervals today, keep the run easy."] + list(
        p.get("rules", [])
    )
    return p


def describe_change(before: list[DayPlan], after: list[DayPlan]) -> list[str]:
    """Human lines for what a change did to the week."""
    lines = []
    for b, a in zip(before, after):
        if (b.session, b.label) == (a.session, a.label) and b.note == a.note:
            continue
        wd = a.date.strftime("%a")
        if (b.session, b.label) != (a.session, a.label):
            old = b.label if b.session else "rest"
            new = a.label if a.session else a.label
            lines.append(f"{wd}: {old} → {new}")
        elif a.note and a.note != b.note:
            lines.append(f"{wd}: {a.label} · {a.note}")
    return lines or ["No change to the week."]


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
    race: Race | None = None,
    history: History | None = None,
) -> dict:
    """The day's session as data: warm-up, blocks with dosed exercises and suggested loads, run, mobility.
    With a history, your first week back after time off is eased in and Session 2's golf rotation
    steps aside in a week a run felt hard."""
    profiles = profiles or {}
    phase = phase_for(d, first_event, race)
    lighter = is_lighter_week(d, race=race) if lighter is None else lighter
    rot = rotation_week(d)
    off = days_off_before(d, history)

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
    week_kind = race_week_kind(d, race) or ("lighter" if lighter else "normal")
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
        if phase.race and session_id == "S1" and b["name"] == "Core":
            items = items + [
                CALF_RAISE
            ]  # the running load lands on calves and Achilles
        dosed = [_with_load(_dose(i, phase, lighter=lighter), profiles) for i in items]
        if off is not None:
            dosed = [ease_in(e, sets=not lighter) for e in dosed]
        blocks.append({"name": b["name"], "minutes": b["minutes"], "exercises": dosed})
    golf_off = None
    if session_id == "S2" and in_race_build(d, race):
        golf_off = golf_rotation_off(d, history)
        if golf_off is None:
            blocks.append(
                {
                    "name": GOLF_ROTATION["name"],
                    "minutes": GOLF_ROTATION["minutes"],
                    "exercises": [
                        _with_load(
                            _dose(_pick_rotation(i, rot), phase, lighter=lighter),
                            profiles,
                        )
                        for i in GOLF_ROTATION["exercises"]
                    ],
                }
            )
    run = variant["run"] if variant else spec.get("run")
    if run and phase.race and session_id == "S2":
        run = None  # the race block's runs are days of their own
    if run:
        run = dict(run)
        if session_id == "S2":
            if phase.key == "baseline":
                run.update(minutes=16, structure="15–18 min easy run/walk", intervals=0)
            elif phase.key in ("build", "return"):
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
            elif off is not None and run.get("intervals"):
                run.update(
                    structure="18 min easy — your first week back, so no intervals yet",
                    intervals=0,
                )
        if session_id == "S5":
            run["minutes"] = {
                "baseline": 25,
                "build": 32,
                "strength": 35,
                "consolidate": 40,
                "return": 30,
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
    if phase.race:
        rules.insert(
            0,
            "Running comes first until the race: if your legs are heavy, cut lifting sets, never the long run.",
        )
    if off is not None:
        rules.insert(
            0,
            f"First week back after {off} days off: "
            + (
                "RPE 6–7 and about 10 % lighter (the lighter week already trims the sets)."
                if lighter
                else "2 sets of everything, RPE 6–7 and about 10 % lighter."
            )
            + " Full doses resume next week. Some soreness is normal; pain isn't.",
        )
    if golf_off:
        rules.append(
            f"Golf rotation left out today ({golf_off}); it comes back once the runs feel right."
        )
    target = list(variant["target_minutes"] if variant else spec["target_minutes"])
    budget = variant["budget"] if variant else spec["budget"]
    if phase.race and session_id == "S2":
        target, budget = (
            (
                [55, 65],
                "7 warm-up · 15 power · 25 upper body · 10 golf rotation · 5 transitions",
            )
            if any(b["name"] == GOLF_ROTATION["name"] for b in blocks)
            else ([45, 55], "7 warm-up · 15 power · 25 upper body · 5 transitions")
        )
    if phase.race and session_id == "S1":
        target, budget = (
            [55, 65],
            "8 warm-up · 5 jumps · 15 main lift · 17 accessories · 12 core and calves · 5 transitions",
        )
    if off is not None and not lighter and session_id != "S5":
        target = [max(30, target[0] - 10), max(40, target[1] - 10)]  # fewer sets
    return {
        "session": session_id,
        "title": session_title(session_id, phase.race),
        "phase": phase.key,
        "phase_name": phase.name,
        "phase_notes": phase.notes,
        "week_kind": week_kind,
        "rotation": rot,
        "target_minutes": target,
        "budget": budget,
        "warmup": spec["warmup"],
        "blocks": blocks,
        "run": run,
        "mobility": DAILY_MOBILITY + (spec.get("mobility_extra") or []),
        "rules": rules,
        "estimated_duration_minutes": target[1],
        "days_off": off,
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
