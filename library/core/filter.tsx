import React from 'react';
import {AbsoluteFill, HtmlInCanvas, useVideoConfig, type EffectsProp} from 'remotion';

/**
 * Applies Remotion effects (e.g. the shader effects in effects/fx) to any React subtree, full frame.
 * Uses <HtmlInCanvas> (Chrome 149+, which Remotion 4.0.5xx ships and enables for rendering;
 * in the Studio enable chrome://flags/#canvas-draw-element).
 */
export const Filter: React.FC<{effects: EffectsProp; children: React.ReactNode}> = ({effects, children}) => {
	const {width, height} = useVideoConfig();
	return (
		<AbsoluteFill>
			<HtmlInCanvas width={width} height={height} effects={effects}>
				{children}
			</HtmlInCanvas>
		</AbsoluteFill>
	);
};
