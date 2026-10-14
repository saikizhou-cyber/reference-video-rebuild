import React from 'react';
import {TransitionSeries, linearTiming, type TransitionPresentation, type TransitionTiming} from '@remotion/transitions';
import {SceneA, SceneB} from '../../core/scene';

/** One transition in a gallery demo: how long it runs and how it is timed. */
export type DemoStep = {
	presentation: TransitionPresentation<any>;
	durationInFrames: number;
	timing?: TransitionTiming;
	/** frames of the incoming scene shown cleanly before the next transition starts */
	hold?: number;
};

/**
 * Gallery demo for shader transitions: A -> B (-> A ...). `lead` frames of the first scene, then each step's
 * transition, `hold` clean frames between steps, `tail` clean frames at the end.
 * Total length = lead + sum(durations) + sum(holds between) + tail.
 */
export const makeTransitionDemo = (steps: DemoStep[], lead: number, tail: number): React.FC => {
	const Demo: React.FC = () => {
		const nodes: React.ReactNode[] = [];
		steps.forEach((s, i) => {
			const prevT = i === 0 ? 0 : steps[i - 1].durationInFrames;
			const before = i === 0 ? lead : (steps[i - 1].hold ?? 12);
			const scene = i % 2 === 0 ? <SceneA /> : <SceneB />;
			// a scene lives for: the transition that brings it in + its clean hold + the transition that takes it out
			nodes.push(
				<TransitionSeries.Sequence key={`s${i}`} durationInFrames={prevT + before + s.durationInFrames}>
					{scene}
				</TransitionSeries.Sequence>,
			);
			nodes.push(
				<TransitionSeries.Transition
					key={`t${i}`}
					presentation={s.presentation}
					timing={s.timing ?? linearTiming({durationInFrames: s.durationInFrames})}
				/>,
			);
		});
		const last = steps[steps.length - 1];
		nodes.push(
			<TransitionSeries.Sequence key="end" durationInFrames={last.durationInFrames + tail}>
				{steps.length % 2 === 0 ? <SceneA /> : <SceneB />}
			</TransitionSeries.Sequence>,
		);
		return <TransitionSeries>{nodes}</TransitionSeries>;
	};
	return Demo;
};

/** '#rrggbb' / '#rgb' -> [r, g, b] in 0..1 (falls back to white) */
export const hexToRgb = (hex: string): [number, number, number] => {
	const v = hex.replace('#', '');
	const full = v.length === 3 ? v.split('').map((c) => c + c).join('') : v;
	const n = Number.parseInt(full, 16);
	if (Number.isNaN(n)) {
		return [1, 1, 1];
	}
	return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
