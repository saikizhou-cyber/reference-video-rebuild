import type {LibraryEntry} from '../../core/types';
import {cameraShakeEntry} from './camera-shake';
import {crashZoomEntry} from './crash-zoom';
import {dutchRollEntry} from './dutch-roll';
import {handheldEntry} from './handheld';
import {letterboxEntry} from './letterbox';
import {slowPushEntry} from './slow-push';
import {smearFramesEntry} from './smear-frames';

/** group 'moves' of camera: one entry per effect file in this folder */
export const movesGroup: LibraryEntry[] = [
	cameraShakeEntry,
	crashZoomEntry,
	handheldEntry,
	slowPushEntry,
	dutchRollEntry,
	letterboxEntry,
	smearFramesEntry,
];
