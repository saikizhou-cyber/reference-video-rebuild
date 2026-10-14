import type {LibraryEntry} from '../../core/types';
import {tileWipeEntry} from './tile-wipe';

/** group 'gsap' of transitions: effects built on GSAP (core/gsap.ts); one entry per effect file in this folder */
export const gsapGroup: LibraryEntry[] = [tileWipeEntry];
