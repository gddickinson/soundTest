// Decode a sound (or WAV bytes) to Float32 channels at its own sample rate for analysis (OfflineAudioContext, so
// nothing is resampled). Small sounds use the exact WAV; long ones the best compressed copy (trimmed to the WAV).
import { decodeAs, formats } from './loader.js';

export const WAV_LIMIT_KB = 4096;

const channelsOf = buf => [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));

export async function decodeForAnalysis(s) {
  const kb = Math.round((s.formats?.wav ?? 0) / 1024) || s.kb || 0;
  const order = kb <= WAV_LIMIT_KB ? ['wav'] : [...new Set([...(await formats()), 'wav'])];
  let err = null;
  for (const fmt of order) {
    try {
      const ctx = new OfflineAudioContext(s.channels ?? s.ch, 1, s.rate ?? s.sr);
      const { buffer } = await decodeAs(ctx, s.file, fmt);
      return { channels: channelsOf(buffer), rate: buffer.sampleRate, format: fmt };
    } catch (e) { err = e; }
  }
  throw err;
}

export async function decodeBytes(bytes, channels, rate) {
  const buf = await new OfflineAudioContext(channels, 1, rate).decodeAudioData(bytes);
  return { channels: channelsOf(buf), rate: buf.sampleRate };
}
