import {useLayoutEffect, useRef, type DependencyList} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import gsap from 'gsap';

/**
 * GSAP inside Remotion, frame-exact. Needs the `gsap` package (npm i gsap; free incl. commercial use and all plugins,
 * under GSAP's own "no charge" licence - https://gsap.com/standard-license).
 *
 * Build a PAUSED timeline once, then seek it to frame / fps on every frame. GSAP never runs on its own clock, so
 * any frame renders the same in any order, tab or machine:
 *
 *   const scope = useGsapTimeline((tl, q) => {
 *     tl.from(q('.word'), {yPercent: 110, stagger: 0.05, ease: 'expo.out', duration: 0.6});
 *   });
 *   return <div ref={scope}>...</div>;
 *
 * Rules
 * - Put every tween on `tl`. A bare gsap.to() would play on GSAP's ticker, i.e. on wall-clock time.
 * - No randomness: stagger {from: 'random'}, "random(...)" string values, gsap.utils.random, RoughEase,
 *   CustomWiggle {type: 'random'} and ScrambleText use Math.random, so every render tab would differ. Use explicit
 *   values or remotion random(seed) instead (gallery/lint.py flags the common cases).
 * - Times are seconds: the timeline's 1.0 is frame `fps`. Register plugins at module level (gsap.registerPlugin).
 * - The timeline is rebuilt when `deps` change; gsap.context() reverts its inline styles on unmount.
 */
export const useGsapTimeline = <T extends Element = HTMLDivElement>(
	build: GsapBuild<T>,
	deps: DependencyList = [],
) => {
	const frame = useCurrentFrame();
	const {fps} = useVideoConfig();
	return useGsapAt<T>(build, frame / fps, deps);
};

export type GsapBuild<T extends Element> = (tl: gsap.core.Timeline, q: (selector: string) => Element[], root: T) => void;

/**
 * Same as useGsapTimeline, but seeks to `time` (seconds) instead of the frame: use it where the clock is not the
 * frame, e.g. inside a @remotion/transitions presentation: useGsapAt(build, presentationProgress * tl.duration()).
 * Tip: build timelines that last exactly 1 s and pass the progress (0..1) as the time.
 */
export const useGsapAt = <T extends Element = HTMLDivElement>(build: GsapBuild<T>, time: number, deps: DependencyList = []) => {
	const scope = useRef<T>(null);
	const tl = useRef<gsap.core.Timeline | null>(null);
	useLayoutEffect(() => {
		const root = scope.current;
		if (!root) {
			return;
		}
		const ctx = gsap.context(() => {
			// force3D: false keeps transforms 2D: GSAP's default GPU layers rasterise glyph and mask edges slightly
			// differently from tab to tab (measured: SplitText chars inside line masks), 2D transforms are pixel-identical
			const t = gsap.timeline({paused: true, defaults: {force3D: false}});
			build(t, gsap.utils.selector(root), root);
			tl.current = t;
		}, root);
		return () => {
			ctx.revert();
			tl.current = null;
		};
		// the caller decides when the timeline is rebuilt
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, deps);
	// declared after the build effect, so on mount the timeline exists before the first seek
	useLayoutEffect(() => {
		tl.current?.seek(time, false);
	});
	return scope;
};

/**
 * Any GSAP ease as a plain (t) => value function for remotion's interpolate() / spring-free moves:
 *   interpolate(frame, [0, 20], [0, 1], {easing: gsapEase('elastic.out(1, 0.35)')})
 * Works with built-in eases and anything registered by CustomEase / CustomBounce / EasePack (ExpoScaleEase, SlowMo).
 */
export const gsapEase = (ease: string | gsap.EaseFunction): ((t: number) => number) => {
	const fn = gsap.parseEase(ease);
	if (!fn) {
		throw new Error(`unknown GSAP ease: ${String(ease)}`);
	}
	return fn;
};
