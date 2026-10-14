/**
 * Cutting on the beat with @remotion/transitions.
 *
 * <TransitionSeries> overlaps the two scenes around a transition: scene i+1 starts `d` frames before scene i ends, and the
 * middle of that overlap is where the picture swaps. So with plain durations a cut that was planned on beat frame B lands
 * d / 2 frames early. Give each sequence the durations from this function and the middle of every overlap lands exactly on
 * its planned frame (a hard cut, d = 0, is the planned frame itself), while the whole film keeps its length:
 *
 *   const shots = [30, 45, 15, 30];            // frames per shot, cuts on beats
 *   const gaps  = [0, 8, 0];                   // transition after shot 0, 1, 2 (0 = hard cut)
 *   const {durations, pre} = transitionPlan(shots, gaps);
 *   <TransitionSeries>
 *     <TransitionSeries.Sequence durationInFrames={durations[0]}>...  then a <TransitionSeries.Transition> per non-zero gap
 *
 * Shots are padded by floor(d/2) at the start and ceil(d/2) at the end around each transition, which adds up to exactly d.
 *
 * Inside a shot, local frame 0 is therefore `pre[i]` frames BEFORE the planned first frame of the shot (those frames play
 * under the previous transition). Author a shot in planned time and add `pre[i]`: something that should happen k frames
 * after the cut is at local frame pre[i] + k. The presentation also has to swap in the middle of its overlap (impactCut's
 * default cutAt 0.3 does not: pass 0.5).
 *
 * Throws when a transition is longer than either of its two padded neighbours (Remotion would reject it too).
 */
export type TransitionPlan = {
	/** durationInFrames for each <TransitionSeries.Sequence> */
	durations: number[];
	/** frames of each shot that play inside the overlap with the previous shot (0 for the first shot and after a hard cut) */
	pre: number[];
};

export const transitionPlan = (frames: readonly number[], gaps: readonly number[]): TransitionPlan => {
	if (gaps.length !== frames.length - 1) {
		throw new Error(`transitionPlan: ${frames.length} shots need ${frames.length - 1} gaps, got ${gaps.length}`);
	}
	gaps.forEach((g, i) => {
		if (!Number.isInteger(g) || g < 0) {
			throw new Error(`transitionPlan: gap ${i} is ${g}; use a whole number of frames, 0 for a hard cut`);
		}
	});
	const pre = frames.map((_, i) => (i > 0 ? Math.floor(gaps[i - 1] / 2) : 0));
	const durations = frames.map((f, i) => f + pre[i] + (i < gaps.length ? Math.ceil(gaps[i] / 2) : 0));
	gaps.forEach((g, i) => {
		const shorter = Math.min(durations[i], durations[i + 1]);
		if (g > shorter) {
			throw new Error(`transitionPlan: transition ${i} is ${g} frames but its shorter neighbour has only ${shorter}; shorten it or lengthen the shot`);
		}
	});
	return {durations, pre};
};

/** Just the durations of transitionPlan(). */
export const transitionPadding = (frames: readonly number[], gaps: readonly number[]): number[] => transitionPlan(frames, gaps).durations;
