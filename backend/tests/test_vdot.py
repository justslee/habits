"""Tests for VDOT calculator — validates Daniels formula implementation.

Note: The published Daniels formulas produce slightly faster predictions than
the lookup tables in his book (tables are empirically adjusted). These tests
validate the mathematical formulas, not the table values.
"""

from app.services.vdot import (
    FIVE_K,
    MARATHON,
    MILE,
    TEN_K,
    estimate_vdot,
    calculate_training_paces,
    format_pace,
    predict_race_time,
)


def test_vdot_50_5k_prediction():
    """VDOT 50 should predict 5K in the right ballpark (~19:56 from formulas)."""
    time_sec = predict_race_time(50, FIVE_K)
    assert 1170 < time_sec < 1220, f"VDOT 50 -> 5K={time_sec}s, expected ~1196s (19:56)"


def test_vdot_40_5k_prediction():
    """VDOT 40 should predict 5K ~24:06 from formulas."""
    time_sec = predict_race_time(40, FIVE_K)
    assert 1420 < time_sec < 1470, f"VDOT 40 -> 5K={time_sec}s, expected ~1446s (24:06)"


def test_estimate_vdot_roundtrip():
    """estimate_vdot then predict_race_time should roundtrip."""
    for t in [1200, 1500, 1800, 900]:
        vdot = estimate_vdot(FIVE_K, t)
        predicted = predict_race_time(vdot, FIVE_K)
        assert abs(predicted - t) < 5, f"Roundtrip failed: {predicted}s vs {t}s"


def test_vdot_increases_with_faster_times():
    """Faster race times should produce higher VDOT."""
    vdot_fast = estimate_vdot(FIVE_K, 1200)  # 20:00 5K
    vdot_slow = estimate_vdot(FIVE_K, 1500)  # 25:00 5K
    assert vdot_fast > vdot_slow


def test_training_paces_ordering():
    """Easy pace should be slower than threshold, which is slower than interval."""
    paces = calculate_training_paces(50)
    assert paces["Easy"]["low_seconds"] > paces["Threshold"]["low_seconds"]
    assert paces["Threshold"]["low_seconds"] > paces["Interval"]["low_seconds"]
    assert paces["Interval"]["low_seconds"] > paces["Repetition"]["low_seconds"]


def test_format_pace():
    assert format_pace(570) == "9:30"
    assert format_pace(480) == "8:00"
    assert format_pace(365) == "6:05"


def test_longer_distances_slower_pace():
    """Marathon prediction should be slower pace than 5K."""
    t_5k = predict_race_time(50, FIVE_K)
    t_marathon = predict_race_time(50, MARATHON)
    pace_5k = t_5k / (FIVE_K / 1609.34)
    pace_marathon = t_marathon / (MARATHON / 1609.34)
    assert pace_marathon > pace_5k


def test_higher_vdot_faster_times():
    """Higher VDOT should predict faster times at every distance."""
    for dist in [MILE, FIVE_K, TEN_K, MARATHON]:
        t_high = predict_race_time(55, dist)
        t_low = predict_race_time(45, dist)
        assert t_high < t_low, f"VDOT 55 should be faster than 45 at {dist}m"
