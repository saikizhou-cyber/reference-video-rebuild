import type {LibraryEntry} from '../../core/types';
import {blobRevealEntry} from './blob-reveal';
import {inkBlotEntry} from './ink-blot';
import {spiralCoverEntry} from './spiral-cover';
import {velvetCurtainEntry} from './velvet-curtain';

/** group 'codrops' of transitions: ports and reimplementations of MIT-licensed Codrops demos; one entry per effect file in this folder */
export const codropsGroup: LibraryEntry[] = [inkBlotEntry, spiralCoverEntry, velvetCurtainEntry, blobRevealEntry];
