import React, {useId} from 'react';

/** Deterministic 0..1 hash of a number (no Math.random): the same input gives the same output on every render. */
export const hash = (n: number): number => {
	const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
	return s - Math.floor(s);
};

/** Hash of two numbers, e.g. (seed, frame). */
export const hash2 = (a: number, b: number): number => hash(a * 127.1 + b * 311.7);

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** A DOM-safe, per-instance id for url(#...) references (React's useId has characters url() dislikes). */
export const useSafeId = (prefix: string): string => `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;

/**
 * Hidden SVG filter that flattens whatever it is applied to into a single flat colour while keeping its alpha
 * (a "plate" / silhouette). Use it as `filter: url(#id)`, optionally chained: `url(#id) blur(12px)`.
 * Works with any CSS colour string; place it once next to the layers that reference it.
 */
export const FlatColorFilter: React.FC<{id: string; color: string}> = ({id, color}) => (
	<svg width={0} height={0} style={{position: 'absolute', pointerEvents: 'none'}} aria-hidden>
		<defs>
			<filter id={id} x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
				<feFlood floodColor={color} result="flat" />
				<feComposite in="flat" in2="SourceAlpha" operator="in" />
			</filter>
		</defs>
	</svg>
);
