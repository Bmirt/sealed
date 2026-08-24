import type { AudioEngine } from './AudioEngine';

/**
 * Views cue sounds through this bus at the exact moment their visual fires, so audio and visuals
 * can never drift apart. The engine appears after the first user gesture (autoplay policy);
 * until then every cue is a silent no-op.
 */
export const audioBus: { engine: AudioEngine | null } = { engine: null };
