import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {CURVES} from '../../core/easing';
import {Backdrop, DEMO, DISPLAY_FONT, useUnit} from '../../core/scene';
import type {LibraryEntry} from '../../core/types';
import {clamp01, kf} from './_reveal-utils';

export type NumberRollProps = {
	/** the number the strips land on (non-negative) */
	value: number;
	/** the number they start on; places `from` does not have start on 0 */
	from?: number;
	decimals?: number;
	/** thousands separator ('' = none) */
	separator?: string;
	prefix?: string;
	suffix?: string;
	/** frames the leftmost place takes to land */
	inFrames?: number;
	/** extra frames each further place to the right rolls: places stop left to right */
	stagger?: number;
	/** minimum full revolutions of every strip before it lands */
	spins?: number;
	/** rows per frame the strips are paced at: slower places to the right still get a long roll */
	pace?: number;
	/** rows a strip runs past its digit before it snaps back */
	overshoot?: number;
	/** frames of that snap back */
	settleFrames?: number;
	/** scale pop (as a fraction) when the last place locks */
	pulse?: number;
	/** how visible the two motion ghosts above and below a fast strip are (0 = none) */
	ghost?: number;
	color?: string;
	/** colour while a strip is still rolling (null = same as `color`) */
	spinColor?: string | null;
	/** px at 720p */
	fontSize?: number;
	fontFamily?: string;
	/** width of one digit cell in em (tabular) */
	digitWidth?: number;
	style?: React.CSSProperties;
};

const group = (intPart: string, sep: string): string => (sep ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : intPart);

const format = (v: number, decimals: number, sep: string): string => {
	const [i, f] = Math.max(0, v).toFixed(decimals).split('.');
	return f ? `${group(i, sep)}.${f}` : group(i, sep);
};

const isDigit = (c: string): boolean => c >= '0' && c <= '9';

const Strip: React.FC<{
	/** position in rows the strip has travelled */
	y: number;
	/** digit shown at y = 0 */
	d0: number;
	opacity?: number;
}> = ({y, d0, opacity = 1}) => {
	const out: React.ReactNode[] = [];
	for (let k = Math.floor(y) - 1; k <= Math.floor(y) + 2; k++) {
		const off = k - y;
		if (off <= -1.02 || off >= 1.02) {
			continue;
		}
		out.push(
			<div key={k} style={{position: 'absolute', left: 0, right: 0, top: `${off}em`, height: '1em', lineHeight: '1em', textAlign: 'center', opacity}}>
				{(((d0 + k) % 10) + 10) % 10}
			</div>,
		);
	}
	return <>{out}</>;
};

/**
 * Odometer: every digit is a 0-9 strip that rolls up and lands on its digit with a half-row snap, places stopping
 * left to right, fast strips smeared by two ghosts, and a scale pop when the last one locks.
 */
export const NumberRoll: React.FC<NumberRollProps> = ({
	value,
	from = 0,
	decimals = 0,
	separator = ',',
	prefix = '',
	suffix = '',
	inFrames = 26,
	stagger = 4,
	spins = 1,
	pace = 0.5,
	overshoot = 0.35,
	settleFrames = 6,
	pulse = 0.05,
	ghost = 1,
	color = DEMO.paper,
	spinColor = null,
	fontSize = 150,
	fontFamily = DISPLAY_FONT,
	digitWidth = 0.64,
	style,
}) => {
	const frame = useCurrentFrame();
	const u = useUnit();
	const target = format(value, decimals, separator);
	const targetDigits = Array.from(target).filter(isDigit);
	const m = targetDigits.length;
	const fromDigits = Array.from(format(from, decimals, separator)).filter(isDigit);
	// right-align the start value under the target: places it does not have start on 0
	const start = Array.from({length: m}, (_, c) => fromDigits[fromDigits.length - (m - c)] ?? '0');

	/** rows travelled by column c at frame f */
	const travel = (c: number, f: number): number => {
		const S = inFrames + c * stagger;
		const d0 = Number(start[c]);
		const diff = (Number(targetDigits[c]) - d0 + 10) % 10;
		const revs = Math.max(spins, Math.round((pace * S - diff) / 10));
		const R = diff + 10 * revs;
		if (f <= 0) {
			return 0;
		}
		if (f < S) {
			const a = 1 - f / S;
			return (R + overshoot) * (1 - a * a * a);
		}
		const b = clamp01((f - S) / Math.max(1, settleFrames));
		return R + overshoot * (1 - b * b * (3 - 2 * b));
	};

	const lastLock = inFrames + (m - 1) * stagger + settleFrames;
	const scale = kf(frame, [[lastLock - 1, 1], [lastLock + 2, 1 + pulse, CURVES.snap], [lastLock + 11, 1, CURVES.inOutCubic]]);
	let c = -1;
	return (
		<div
			style={{
				display: 'flex',
				alignItems: 'center',
				fontFamily,
				fontSize: fontSize * u,
				lineHeight: '1em',
				color,
				whiteSpace: 'pre',
				transform: `scale(${scale})`,
				...style,
			}}
		>
			{prefix ? <span>{prefix}</span> : null}
			{Array.from(target).map((ch, i) => {
				if (!isDigit(ch)) {
					return <span key={i}>{ch}</span>;
				}
				c++;
				const col = c;
				const S = inFrames + col * stagger;
				const y = travel(col, frame);
				const speed = Math.abs(y - travel(col, frame - 1));
				const g = ghost * clamp01(speed / 0.9);
				const d = Math.min(0.42, speed * 0.5);
				const rolling = frame < S + settleFrames;
				return (
					<span
						key={i}
						style={{
							position: 'relative',
							display: 'inline-block',
							width: `${digitWidth}em`,
							height: '1em',
							overflow: 'hidden',
							color: rolling && spinColor ? spinColor : undefined,
						}}
					>
						{g > 0.04 ? <Strip y={y - d} d0={Number(start[col])} opacity={0.22 * g} /> : null}
						{g > 0.04 ? <Strip y={y + d} d0={Number(start[col])} opacity={0.12 * g} /> : null}
						<Strip y={y} d0={Number(start[col])} />
					</span>
				);
			})}
			{suffix ? <span>{suffix}</span> : null}
		</div>
	);
};

const Demo: React.FC = () => (
	<Backdrop>
		<AbsoluteFill style={{alignItems: 'center', justifyContent: 'center'}}>
			<Sequence from={0} durationInFrames={54} layout="none">
				<NumberRoll value={2480317} fontSize={150} inFrames={22} stagger={3} spinColor={DEMO.yellow} />
			</Sequence>
			<Sequence from={54} layout="none">
				<NumberRoll value={38.5} decimals={1} prefix="+" suffix="%" fontSize={230} inFrames={18} stagger={4} color={DEMO.red} spinColor={DEMO.paper} />
			</Sequence>
		</AbsoluteFill>
	</Backdrop>
);

export const numberRollEntry: LibraryEntry = {
	meta: {
		id: 'number-roll',
		title: 'Number roll',
		category: 'text',
		looks: 'An odometer: each digit is a 0-9 strip that spins up and lands on its digit with a snap, places stopping left to right behind motion ghosts, the whole number popping when the last one locks.',
		use: 'Player counts, stats, damage and score reveals; prices and dates that should land with weight.',
		exportName: 'NumberRoll',
		durationInFrames: 96,
		source: {kind: 'inspired', name: 'HyperFrames', url: 'https://github.com/heygen-com/hyperframes/blob/main/registry/components/number-wheel/number-wheel.html'},
	},
	Demo,
};
