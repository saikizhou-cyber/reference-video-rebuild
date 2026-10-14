import {Easing, interpolate, type SpringConfig} from 'remotion';

/**
 * Motion-design curves as CSS cubic-bezier numbers (Remotion's Easing.bezier).
 * Remotion's own Easing already has quad / cubic / sin / exp / circle / back / elastic / bounce.
 */
export const CURVES = {
	/** fast out, long soft landing: most entrances */
	expoOut: Easing.bezier(0.16, 1, 0.3, 1),
	quintOut: Easing.bezier(0.22, 1, 0.36, 1),
	/** very fast start, hard stop: slams, stamps, cuts that land on a beat */
	snap: Easing.bezier(0.2, 0.9, 0.1, 1),
	/** symmetric: moves between two holds */
	inOutCubic: Easing.bezier(0.65, 0, 0.35, 1),
	/** pulls back a little before going */
	anticipate: Easing.bezier(0.36, 0, 0.66, -0.56),
	/** ~10 % overshoot then back */
	backOut: Easing.bezier(0.34, 1.56, 0.64, 1),
	/** slow start, violent end: exits, whip pans */
	expoIn: Easing.bezier(0.7, 0, 0.84, 0),
} as const;

/**
 * Spring presets for remotion's spring(). zeta = damping / (2 * sqrt(stiffness * mass)).
 * Remotion springs are critically damped once zeta >= 1; past that only stiffness changes the curve.
 */
export const SPRINGS = {
	/** zeta 0.45: clear overshoot, for hits */
	punch: {stiffness: 400, damping: 18, mass: 1},
	/** zeta 0.87: tiny overshoot, crisp */
	snap: {stiffness: 300, damping: 30, mass: 1},
	/** zeta 1.0: no overshoot */
	smooth: {stiffness: 100, damping: 20, mass: 1},
	/** zeta 0.3: jelly */
	wobble: {stiffness: 180, damping: 8, mass: 1},
} satisfies Record<string, Partial<SpringConfig>>;

/** Hold each pose for `every` frames ("on twos" = 2). Feed the result to interpolate / spring instead of frame. */
export const stepped = (frame: number, every = 2): number => Math.floor(frame / every) * every;

/** Eased 0..1 progress of a move that starts at `start` and lasts `duration` frames, clamped at both ends. */
export const progress = (
	frame: number,
	start: number,
	duration: number,
	easing: (t: number) => number = CURVES.expoOut,
): number =>
	interpolate(frame, [start, start + Math.max(1, duration)], [0, 1], {
		easing,
		extrapolateLeft: 'clamp',
		extrapolateRight: 'clamp',
	});

/** Start frame of item `i` in a cascade: `each` frames apart after `offset`. */
export const stagger = (i: number, each: number, offset = 0): number => offset + i * each;

/** Nearest beat frame to `frame` (beats = `beat_frames` from `beat_check.py grid --json`). */
export const nearestBeat = (frame: number, beats: readonly number[]): number => {
	let best = frame;
	let dist = Infinity;
	for (const b of beats) {
		const d = Math.abs(b - frame);
		if (d < dist) {
			dist = d;
			best = b;
		}
	}
	return best;
};

/** Frames since the last beat at or before `frame` (Infinity before the first beat): drives pulses that hit on every beat. */
export const sinceBeat = (frame: number, beats: readonly number[]): number => {
	let last = -Infinity;
	for (const b of beats) {
		if (b <= frame && b > last) {
			last = b;
		}
	}
	return frame - last;
};
