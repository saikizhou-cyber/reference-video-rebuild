import type {LibraryEntry} from '../../core/types';
import {halftoneEntry} from './halftone';
import {posterizeEntry} from './posterize';
import {gradientMapEntry} from './gradient-map';
import {inkEdgesEntry} from './ink-edges';
import {shockwaveEntry} from './shockwave';
import {lightStreakEntry} from './light-streak';
import {godRaysEntry} from './god-rays';
import {lightLeakEntry} from './light-leak';

/** group 'look' of fx: one entry per effect file in this folder */
export const lookGroup: LibraryEntry[] = [
	halftoneEntry,
	posterizeEntry,
	gradientMapEntry,
	inkEdgesEntry,
	shockwaveEntry,
	lightStreakEntry,
	godRaysEntry,
	lightLeakEntry,
];
