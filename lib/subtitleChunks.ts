import type { SubtitleEntry } from './types';

export type SubtitleChunk = { text: string; start: number; end: number };

/**
 * Splits one subtitle entry's text into timed chunks according to the
 * selected Text Mode, evenly dividing the entry's [start, end] duration.
 * Used by BOTH the live preview (VideoPlayer) and the real export engine
 * (exportEngine) so what you see is genuinely what gets burned in.
 */
export function chunkSubtitle(sub: SubtitleEntry, textMode: string): SubtitleChunk[] {
  const words = sub.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  if (textMode === 'Full Kalimat' || textMode === 'Karaoke Style') {
    return [{ text: sub.text.trim(), start: sub.start, end: sub.end }];
  }

  const chunkSize = textMode === '1 Kata (Word-by-word)' ? 1 : 3; // '2-3 Kata (Phrase)'
  const groups: string[][] = [];
  for (let i = 0; i < words.length; i += chunkSize) groups.push(words.slice(i, i + chunkSize));

  const duration = Math.max(0.01, sub.end - sub.start);
  const step = duration / groups.length;
  return groups.map((g, i) => ({
    text: g.join(' '),
    start: sub.start + i * step,
    end: sub.start + (i + 1) * step,
  }));
}

/** Which chunk of `sub` should be showing right now, given Text Mode + currentTime. */
export function activeChunkText(sub: SubtitleEntry, textMode: string, currentTime: number): string {
  const chunks = chunkSubtitle(sub, textMode);
  if (chunks.length === 0) return '';
  const found = chunks.find((c) => currentTime >= c.start && currentTime <= c.end);
  return (found ?? chunks[chunks.length - 1]).text;
}

/** For "Karaoke Style": which word index (into the full sentence) is active right now. */
export function karaokeWordIndex(sub: SubtitleEntry, currentTime: number): number {
  const words = sub.text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return -1;
  const duration = Math.max(0.01, sub.end - sub.start);
  const progress = Math.min(1, Math.max(0, (currentTime - sub.start) / duration));
  return Math.min(words.length - 1, Math.floor(progress * words.length));
}
