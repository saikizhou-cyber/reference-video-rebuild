import React from 'react';
import {Composition, Folder} from 'remotion';
import type {EffectMeta, LibraryEntry} from '../core/types';
import {CATEGORIES, LIBRARY} from './registry';

// the meta rides along as defaultProps so tools (gallery/previews.mjs) can read category and title
const withMeta = (Demo: LibraryEntry['Demo']): React.FC<{meta: EffectMeta}> => {
	const Wrapped: React.FC<{meta: EffectMeta}> = () => <Demo />;
	return Wrapped;
};
const WRAPPED = new Map(LIBRARY.map((e) => [e.meta.id, withMeta(e.Demo)] as const));

/** One composition per effect demo, grouped by category (open with `npx remotion studio gallery/index.ts`). */
export const GalleryRoot: React.FC = () => (
	<>
		{CATEGORIES.map((c) => (
			<Folder key={c} name={c}>
				{LIBRARY.filter((e) => e.meta.category === c).map((e) => (
					<Composition
						key={e.meta.id}
						id={e.meta.id}
						component={WRAPPED.get(e.meta.id)!}
						defaultProps={{meta: e.meta}}
						durationInFrames={e.meta.durationInFrames}
						fps={30}
						width={1280}
						height={720}
					/>
				))}
			</Folder>
		))}
	</>
);
