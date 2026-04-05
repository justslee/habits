"""VDOT Calculator — Jack Daniels' Running Formula.

Implements VDOT estimation, training pace calculation, and race time prediction
using the actual Daniels oxygen cost and %VO2max formulas.
"""

import math

# Standard race distances in meters
MILE = 1609.34
FIVE_K = 5000
TEN_K = 10000
HALF_MARATHON = 21097.5
MARATHON = 42195

DISTANCES = {
    "mile": MILE,
    "5k": FIVE_K,
    "10k": TEN_K,
    "half": HALF_MARATHON,
    "marathon": MARATHON,
}

# Training zone %VO2max ranges
TRAINING_ZONES = {
    "Easy":        (0.65, 0.79),
    "Marathon":    (0.75, 0.84),
    "Threshold":   (0.83, 0.88),
    "Interval":    (0.95, 1.00),
    "Repetition":  (1.05, 1.05),
}

METERS_PER_MILE = 1609.34


def _vo2_from_velocity(velocity: float) -> float:
    """Oxygen cost (ml/kg/min) from velocity (meters/min)."""
    return -4.60 + 0.182258 * velocity + 0.000104 * velocity ** 2


def _pct_max(time_min: float) -> float:
    """%VO2max sustained for a given race duration (minutes)."""
    return (
        0.8
        + 0.1894393 * math.exp(-0.012778 * time_min)
        + 0.2989558 * math.exp(-0.1932605 * time_min)
    )


def estimate_vdot(distance_meters: float, time_seconds: float) -> float:
    """Estimate VDOT from a race result.

    Args:
        distance_meters: Race distance in meters.
        time_seconds: Finish time in seconds.

    Returns:
        VDOT value (typically 30-85 for recreational to elite runners).
    """
    time_min = time_seconds / 60.0
    velocity = distance_meters / time_min  # meters per minute
    vo2 = _vo2_from_velocity(velocity)
    pct = _pct_max(time_min)
    return vo2 / pct


def _velocity_from_vo2(vo2: float) -> float:
    """Solve quadratic to get velocity (m/min) from VO2.

    VO2 = -4.60 + 0.182258*v + 0.000104*v^2
    => 0.000104*v^2 + 0.182258*v + (-4.60 - VO2) = 0
    """
    a = 0.000104
    b = 0.182258
    c = -4.60 - vo2
    discriminant = b ** 2 - 4 * a * c
    if discriminant < 0:
        raise ValueError(f"No real solution for VO2={vo2}")
    return (-b + math.sqrt(discriminant)) / (2 * a)


def _pace_from_pct_vo2max(vdot: float, pct: float) -> float:
    """Get pace in seconds/mile for a given %VO2max intensity.

    Args:
        vdot: Runner's VDOT.
        pct: Fraction of VO2max (e.g. 0.75 for 75%).

    Returns:
        Pace in seconds per mile.
    """
    vo2_target = vdot * pct
    velocity = _velocity_from_vo2(vo2_target)  # meters/min
    # Convert to seconds per mile
    return (METERS_PER_MILE / velocity) * 60


def calculate_training_paces(vdot: float) -> dict[str, dict[str, str]]:
    """Calculate training paces for all zones.

    Returns dict like:
        {"Easy": {"low": "9:30", "high": "10:15"}, ...}
    For Repetition (single value), low == high.
    """
    paces = {}
    for zone, (pct_low, pct_high) in TRAINING_ZONES.items():
        # Higher %VO2max = faster pace = lower sec/mile
        pace_fast = _pace_from_pct_vo2max(vdot, pct_high)
        pace_slow = _pace_from_pct_vo2max(vdot, pct_low)
        paces[zone] = {
            "low": format_pace(pace_fast),
            "high": format_pace(pace_slow),
            "low_seconds": round(pace_fast),
            "high_seconds": round(pace_slow),
        }
    return paces


def predict_race_time(vdot: float, distance_meters: float) -> int:
    """Predict race time for a given VDOT and distance using bisection.

    Returns predicted time in seconds.
    """
    # Search bounds: 2 minutes to 6 hours
    lo, hi = 120.0, 21600.0
    for _ in range(100):
        mid = (lo + hi) / 2
        estimated = estimate_vdot(distance_meters, mid)
        if estimated > vdot:
            lo = mid  # time too fast -> increase time to lower vdot
        else:
            hi = mid  # time too slow -> decrease time to raise vdot
    return round((lo + hi) / 2)


def format_pace(sec_per_mile: float) -> str:
    """Format pace as M:SS."""
    total = round(sec_per_mile)
    m, s = divmod(total, 60)
    return f"{m}:{s:02d}"


def format_time(seconds: int) -> str:
    """Format race time as H:MM:SS or MM:SS."""
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"
