import type {LibraryEntry} from '../../core/types';
import {gsapEasesEntry} from './gsap-eases';

/** group 'gsap' of timing: effects built on GSAP (core/gsap.ts); one entry per effect file in this folder */
export const gsapGroup: LibraryEntry[] = [gsapEasesEntry];
