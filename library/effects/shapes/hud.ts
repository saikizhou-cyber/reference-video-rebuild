import type {LibraryEntry} from '../../core/types';
import {hudFrameEntry} from './hud-frame';
import {lineUnfoldPanelEntry} from './line-unfold-panel';
import {pathDrawEntry} from './path-draw';
import {progressRingEntry} from './progress-ring';
import {recOverlayEntry} from './rec-overlay';
import {reticleLockEntry} from './reticle-lock';
import {shapeMorphEntry} from './shape-morph';
import {telemetryReadoutEntry} from './telemetry-readout';

/** group 'hud' of shapes: one entry per effect file in this folder */
export const hudGroup: LibraryEntry[] = [reticleLockEntry, hudFrameEntry, telemetryReadoutEntry, lineUnfoldPanelEntry, recOverlayEntry, progressRingEntry, pathDrawEntry, shapeMorphEntry];
