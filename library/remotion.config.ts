import {Config} from '@remotion/cli/config';

// png frames + bt709 give a standard yuv420p / bt709 video; jpeg frames end up yuvj420p full range with no colour tags
Config.setVideoImageFormat('png');
Config.setColorSpace('bt709');
Config.setOverwriteOutput(true);
// shader effects and transitions need a real GL backend (use 'swangle' on machines without a GPU)
Config.setChromiumOpenGlRenderer('angle');
