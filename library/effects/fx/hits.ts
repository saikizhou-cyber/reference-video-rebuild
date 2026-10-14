import type {LibraryEntry} from '../../core/types';
import {sliceGlitchEntry} from './slice-glitch';
import {impactFrameEntry} from './impact-frame';
import {glowEntry} from './glow';
import {risoHitEntry} from './riso-hit';
import {screenTextureEntry} from './screen-texture';

/** group 'hits' of fx: one entry per effect file in this folder */
export const hitsGroup: LibraryEntry[] = [sliceGlitchEntry, impactFrameEntry, glowEntry, risoHitEntry, screenTextureEntry];
