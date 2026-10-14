import React from 'react';
import {useUnit} from './scene';

export type Anchor = 'center' | 'top-left' | 'top' | 'top-right' | 'left' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right';

const ORIGIN: Record<Anchor, [number, number]> = {
	'center': [0.5, 0.5],
	'top-left': [0, 0],
	'top': [0.5, 0],
	'top-right': [1, 0],
	'left': [0, 0.5],
	'right': [1, 0.5],
	'bottom-left': [0, 1],
	'bottom': [0.5, 1],
	'bottom-right': [1, 1],
};

/**
 * Puts any effect in an explicit box, so it can sit off-centre and never collapses.
 * Most text and shape effects fill the frame and centre themselves; wrap them in <Place> instead of editing them:
 *
 *   <Place x={90} y={560} w={600} h={160} anchor="bottom-left"><BarReveal text="ONE LAST" /></Place>
 *
 * x, y, w, h are px at 720p (scaled with the composition). (x, y) is where `anchor` of the box lands; w / h default to the
 * full frame. The box has a real size, which matters for children that are absolutely positioned and would otherwise
 * collapse to 0 x 0 (e.g. glow layers). `shift` moves the content inside the box without changing the box.
 */
export const Place: React.FC<{
	x?: number;
	y?: number;
	w?: number;
	h?: number;
	anchor?: Anchor;
	shift?: [number, number];
	children: React.ReactNode;
	style?: React.CSSProperties;
}> = ({x = 640, y = 360, w = 1280, h = 720, anchor = 'center', shift = [0, 0], children, style}) => {
	const u = useUnit();
	const [ax, ay] = ORIGIN[anchor];
	return (
		<div
			style={{
				position: 'absolute',
				left: (x - ax * w + shift[0]) * u,
				top: (y - ay * h + shift[1]) * u,
				width: w * u,
				height: h * u,
				...style,
			}}
		>
			{children}
		</div>
	);
};
