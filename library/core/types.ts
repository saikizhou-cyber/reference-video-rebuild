import type React from 'react';

export type Category = 'transitions' | 'text' | 'camera' | 'fx' | 'shapes' | 'timing';

/** Where an effect comes from. Ported code keeps its licence (see THIRD_PARTY_NOTICES.md). */
export type Source =
	| {kind: 'original'}
	| {kind: 'ported'; name: string; url: string; license: string}
	| {kind: 'inspired'; name: string; url: string};

export type EffectMeta = {
	/** kebab-case, unique; also the gallery composition id */
	id: string;
	title: string;
	category: Category;
	/** one line: what the viewer sees */
	looks: string;
	/** one line: when to reach for it in a PV / trailer */
	use: string;
	/** optional: the traps - which frame is the hit, defaults that hide or shrink content (the catalog shows it as "watch out") */
	notes?: string;
	/** the main export to copy into a project */
	exportName: string;
	/** length of the gallery demo */
	durationInFrames: number;
	/** npm packages the effect needs beyond react / remotion / @remotion/* (declare them in library/package.json too) */
	deps?: string[];
	source: Source;
};

export type LibraryEntry = {
	meta: EffectMeta;
	/** a 1280x720 / 30 fps demo of the effect, used by the gallery and the preview sheets */
	Demo: React.FC;
};
