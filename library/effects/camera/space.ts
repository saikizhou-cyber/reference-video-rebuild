import type {LibraryEntry} from '../../core/types';
import {bulletTimeEntry} from './bullet-time';
import {cardFlurryEntry} from './card-flurry';
import {dollyZoomEntry} from './dolly-zoom';
import {kanadaSnapEntry} from './kanada-snap';
import {parallaxStackEntry} from './parallax-stack';
import {rackFocusEntry} from './rack-focus';

/** group 'space' of camera: one entry per effect file in this folder */
export const spaceGroup: LibraryEntry[] = [dollyZoomEntry, parallaxStackEntry, rackFocusEntry, cardFlurryEntry, bulletTimeEntry, kanadaSnapEntry];
