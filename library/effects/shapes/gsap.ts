import type {LibraryEntry} from '../../core/types';
import {motionPathEntry} from './motion-path';
import {svgMorphEntry} from './svg-morph';

/** group 'gsap' of shapes: effects built on GSAP (core/gsap.ts); one entry per effect file in this folder */
export const gsapGroup: LibraryEntry[] = [motionPathEntry, svgMorphEntry];
