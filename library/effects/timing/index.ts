import type {LibraryEntry} from '../../core/types';
import {editsGroup} from './edits';
import {gsapGroup} from './gsap';

export const timing: LibraryEntry[] = [...editsGroup, ...gsapGroup];
