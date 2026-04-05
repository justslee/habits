"""Centralized constants and configuration values.

Keeps magic numbers out of routers and services.
"""

# --- Workout ---

# Exercises the athlete cannot do (injury / equipment limitations)
BANNED_EXERCISES = [
    "med ball rotational slam",
    "medicine ball rotational slam",
    "med ball slam",
    "rotational slam",
    "tricep dip",
    "tricep dips",
    "dips",
]

# Weight increments (lbs)
MIN_INCREMENT = 2.5
STANDARD_INCREMENT = 5.0

# Stall thresholds
STALL_SESSION_THRESHOLD = 3  # sessions at same weight before stall
DELOAD_CYCLE_WEEKS = 4  # deload every N weeks

# Volume landmarks (sets per muscle group per week)
MEV = {"push": 10, "pull": 10, "legs": 10}  # Minimum Effective Volume
MRV = {"push": 22, "pull": 22, "legs": 22}  # Maximum Recoverable Volume

# --- Running ---

# Standard PR distances in miles
PR_DISTANCES = {
    "mile": 1.0,
    "5k": 3.107,
    "10k": 6.214,
    "half_marathon": 13.109,
    "marathon": 26.219,
}
