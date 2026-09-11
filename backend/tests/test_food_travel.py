"""Travel days are not cooking days: nothing is cooked on them and nothing is eaten from them."""

import datetime

from app.services import food_planner as fp


class _Cycle:
    """The shape layout_plan reads for dates, without touching the database."""

    start_date = datetime.date(2026, 9, 11)
    end_date = datetime.date(2026, 9, 24)
    travel_days = [
        "2026-09-17", "2026-09-18", "2026-09-19",
        "2026-09-20", "2026-09-21", "2026-09-22",
    ]
    eat_out_days = 2


def test_travel_days_leave_the_plan():
    cycle = _Cycle()
    days = fp.cycle_days(cycle)
    travel = fp.travel_set(cycle)

    assert len(days) == 14
    assert len(travel) == 6
    # 14 days − 6 away − 2 out = 6 days that actually need feeding.
    assert fp.eating_days(cycle) == 6

    slots = [d for d in days if d not in travel]
    slots = slots[: max(0, len(slots) - cycle.eat_out_days)]
    assert slots, "there should be days left to cook for"
    assert not any(d in travel for d in slots), "a travel day must never be a cooking or eating slot"


def test_a_batch_never_spans_a_trip():
    """Leftovers are cut at the gap, so nothing is left in the fridge over a trip."""
    cycle = _Cycle()
    travel = fp.travel_set(cycle)
    slots = [d for d in fp.cycle_days(cycle) if d not in travel]

    # Take a four-day span starting the day before the trip; it must stop at the gap.
    start = slots.index(datetime.date(2026, 9, 16))
    span = slots[start : start + 4]
    cut = [span[0]]
    for d in span[1:]:
        if (d - cut[-1]).days == 1:
            cut.append(d)
        else:
            break
    assert cut == [datetime.date(2026, 9, 16)], "the span must end where the trip begins"
