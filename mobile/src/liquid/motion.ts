/**
 * Liquid motion — the easings and timings from the refinement pass, as Reanimated configs.
 *
 * Principle from the notes: motion begins with the touch rather than playing independently,
 * frequent actions carry no ornamental delay, and Quiet mode or Reduce Motion removes spatial
 * animation while keeping the state change immediate.
 */

import { Easing, ReduceMotion, WithSpringConfig, WithTimingConfig } from 'react-native-reanimated';
import { motion } from './tokens';

/** cubic-bezier(.22,1,.36,1) — the release curve for cards, details and presses. */
export const EASE = Easing.bezier(0.22, 1, 0.36, 1);
/** cubic-bezier(.32,.72,0,1) — the settle curve for selection and sheets. */
export const SETTLE = Easing.bezier(0.32, 0.72, 0, 1);
/** cubic-bezier(.2,.8,.2,1) — the base screen curve. */
export const BASE = Easing.bezier(0.2, 0.8, 0.2, 1);
/** cubic-bezier(.4,0,1,1) — a sheet leaving downward. */
export const EXIT = Easing.bezier(0.4, 0, 1, 1);

type Ease = WithTimingConfig['easing'];

const timing = (duration: number, easing: Ease): WithTimingConfig => ({
  duration,
  easing,
  reduceMotion: ReduceMotion.System,
});

export const T = {
  press: timing(motion.press, EASE),
  context: timing(motion.context, EASE),
  cardRelease: timing(motion.cardRelease, Easing.in(Easing.ease)),
  sheetExit: timing(motion.sheetExit, EXIT),
  detail: timing(motion.detail, EASE),
  selection: timing(motion.selection, SETTLE),
  selectionSlow: timing(motion.selectionSlow, SETTLE),
  sheet: timing(motion.sheet, SETTLE),
  northWell: timing(motion.northWell, Easing.bezier(0.2, 0.85, 0.2, 1.06)),
  instant: timing(1, EASE),
};

/** A spring that settles quickly, for a sheet returning after an incomplete drag. */
export const SPRING: WithSpringConfig = {
  damping: 32,
  stiffness: 320,
  mass: 0.9,
  overshootClamping: false,
  reduceMotion: ReduceMotion.System,
};

/** Pick a timing config, collapsing to instant when motion is off. */
export function m(moves: boolean, config: WithTimingConfig): WithTimingConfig {
  return moves ? config : T.instant;
}
