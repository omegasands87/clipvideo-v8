import type {
  AudioSettings,
  ExportSettings,
  SubtitleEntry,
  TypographySettings,
  VisualFxSettings,
} from './types';
import { chunkSubtitle } from './subtitleChunks';
import { FONT_REGISTRY } from './fonts';
import { getCachedFont, setCachedFont } from './fontCache';

export type ExportInput = {
  videoUrl: string;
  videoWidth: number;
  videoHeight: number;
  bgmUrl: string | null;
  startTime: number;
  endTime: number;
  cropX: number; // 0-100, in DISPLAYED (mirror-corrected) coordinate space — same as the preview
  subtitles: SubtitleEntry[];
  typography: TypographySettings;
  visualFx: VisualFxSettings;
  audio: AudioSettings;
  exportSettings: ExportSettings;
  onProgress: (pct: number) => void;
};

export type ExportResult = { blob: Blob; filename: string; warning?: string };

const STYLE_DRAWTEXT: Record<string, string> = {
  '3D Bevel Gold': 'fontcolor=0xF59E0B:bordercolor=0x78350F:borderw=3:shadowcolor=black@0.6:shadowx=0:shadowy=3',
  'TikTok Yellow': 'fontcolor=0xFDE047:bordercolor=black:borderw=3',
  'Netflix White': 'fontcolor=white:bordercolor=black@0.8:borderw=2:shadowy=2',
  'Neon Glow': 'fontcolor=0xE879F9:bordercolor=0xE879F9:borderw=1:shadowcolor=0xE879F9@0.8:shadowx=0:shadowy=0',
  'Minimal Clean': 'fontcolor=0xF4F4F5:shadowcolor=black@0.6:shadowx=0:shadowy=1',
  'Bold Black Outline': 'fontcolor=white:bordercolor=black:borderw=4',
};

/** Fetches a URL with a timeout so a slow/unresponsive host can't hang the whole export. */
async function fetchWithTimeout(url: string, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches a real .ttf for the chosen font via the google-webfonts-helper API,
 * for burning subtitles with the SAME font shown in the preview.
 *
 * The result is cached in IndexedDB (see fontCache.ts) keyed by font+weight,
 * so this network round-trip only ever happens ONCE per font per browser —
 * every export after the first reuses the cached bytes, even fully offline,
 * instead of depending on gwfh.mranftl.com being reachable every single time.
 */
async function fetchFontTtf(fontFamily: string): Promise<Uint8Array | null> {
  const entry = FONT_REGISTRY[fontFamily] ?? FONT_REGISTRY.Inter;
  const cacheKey = `${entry.gwfhId}@${entry.weight}`;

  const cached = await getCachedFont(cacheKey);
  if (cached) return cached;

  try {
    const metaRes = await fetchWithTimeout(`https://gwfh.mranftl.com/api/fonts/${entry.gwfhId}?subsets=latin`);
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    const variants: any[] = meta.variants ?? [];
    const variant =
      variants.find((v) => String(v.id) === entry.weight || String(v.fontWeight) === entry.weight) ??
      variants.find((v) => v.id === 'regular' || v.id === '400') ??
      variants[0];
    const ttfUrl: string | undefined = variant?.ttf ?? variant?.fontUrl?.ttf;
    if (!ttfUrl) return null;
    const fontRes = await fetchWithTimeout(ttfUrl);
    if (!fontRes.ok) return null;
    const bytes = new Uint8Array(await fontRes.arrayBuffer());
    await setCachedFont(cacheKey, bytes);
    return bytes;
  } catch {
    return null;
  }
}

function escapeDrawtext(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\u2019");
}

/**
 * Renders the final clip for real using ffmpeg.wasm: trims to the selected
 * clip range, crops to 9:16 at the chosen crop position, applies mirror /
 * color grading / speed / pitch, burns in the subtitles (respecting Text
 * Mode + style + font + position), mixes in the uploaded BGM if any, and
 * returns a downloadable video Blob. Runs entirely in the browser.
 */
export async function renderExport(input: ExportInput): Promise<ExportResult> {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util');

  const ffmpeg = new FFmpeg();
  let warning: string | undefined;

  ffmpeg.on('progress', ({ progress }: { progress: number }) => {
    input.onProgress(Math.min(99, Math.max(0, Math.round(progress * 100))));
  });

  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  await ffmpeg.writeFile('input.mp4', await fetchFile(input.videoUrl));
  const hasBgm = !!input.bgmUrl && input.audio.bgmVolume > 0;
  if (hasBgm) await ffmpeg.writeFile('bgm.audio', await fetchFile(input.bgmUrl as string));

  // Try to get a real .ttf matching the chosen Font Family so burned-in
  // subtitles use the same typeface as the live preview.
  let fontfileArg = '';
  const ttf = await fetchFontTtf(input.typography.fontFamily);
  if (ttf) {
    await ffmpeg.writeFile('subfont.ttf', ttf);
    fontfileArg = ':fontfile=subfont.ttf';
  } else {
    warning =
      'Font khusus gagal diunduh untuk proses render (butuh koneksi internet) — subtitle dibakar memakai font default.';
  }

  const clipDuration = Math.max(0.1, input.endTime - input.startTime);

  // --- Crop geometry: identical math to the live preview, so the exported
  // frame matches exactly what you saw while editing. ---
  const cropH = input.videoHeight;
  const cropW = Math.round(cropH * (9 / 16));
  const rawX = Math.round((input.cropX / 100) * input.videoWidth - cropW / 2);
  const cropXPx = Math.max(0, Math.min(input.videoWidth - cropW, rawX));

  // --- Video filter chain ---
  const vf: string[] = [];
  if (input.visualFx.horizontalMirror) vf.push('hflip'); // must happen BEFORE crop — cropX is in mirrored/displayed space
  vf.push(`crop=${cropW}:${cropH}:${cropXPx}:0`);
  if (input.visualFx.colorGrading) vf.push('eq=saturation=1.25:contrast=1.08:brightness=0.02');
  const speed = Math.max(0.5, Math.min(2, input.audio.playbackSpeed));
  if (speed !== 1) vf.push(`setpts=${(1 / speed).toFixed(4)}*PTS`);

  // --- Burn in subtitles: one drawtext filter per timed chunk, matching
  // the Text Mode (word-by-word / phrase / full sentence), style preset,
  // font, size and vertical position exactly like the preview. ---
  const styleArgs = STYLE_DRAWTEXT[input.typography.visualStyle] ?? STYLE_DRAWTEXT['Netflix White'];
  const yExpr = `(h*${(input.typography.verticalPosition / 100).toFixed(3)})-(text_h/2)`;
  for (const sub of input.subtitles) {
    // Only burn chunks that fall (at least partly) inside the exported clip range.
    if (sub.end < input.startTime || sub.start > input.endTime) continue;
    const chunks = chunkSubtitle(sub, input.typography.textMode);
    for (const chunk of chunks) {
      const relStart = Math.max(0, chunk.start - input.startTime);
      const relEnd = Math.min(clipDuration, chunk.end - input.startTime);
      if (relEnd <= relStart) continue;
      const text = escapeDrawtext(chunk.text);
      vf.push(
        `drawtext=text='${text}'${fontfileArg}:fontsize=${input.typography.fontSize}:` +
          `${styleArgs}:x=(w-text_w)/2:y=${yExpr}:enable='between(t,${relStart.toFixed(2)},${relEnd.toFixed(2)})'`
      );
    }
  }

  // --- Audio filter chain: voice volume, pitch shift (independent of
  // speed via asetrate/atempo), speed, EQ enhancer, then optionally mix
  // with the uploaded BGM. ---
  const semitone = (input.audio.pitchShift - 3) * 3;
  const pitchFactor = Math.pow(2, semitone / 12);
  const sampleRate = 48000;
  const tempoAfterPitch = Math.max(0.5, Math.min(2, speed / pitchFactor));

  const enhancerPresets: Record<string, string> = {
    Normal: '',
    'Vocal Pro': 'equalizer=f=150:width_type=h:width=100:g=-3,equalizer=f=2500:width_type=h:width=1000:g=6',
    'Deep Bass': 'equalizer=f=150:width_type=h:width=100:g=8',
    Warmth: 'equalizer=f=150:width_type=h:width=100:g=3,equalizer=f=2500:width_type=h:width=1000:g=2',
  };
  const enhancer = enhancerPresets[input.typography.audioEnhancer] ?? '';

  const voiceChain = [
    `volume=${(input.audio.voiceVolume / 100).toFixed(2)}`,
    `asetrate=${sampleRate}*${pitchFactor.toFixed(4)}`,
    `aresample=${sampleRate}`,
    `atempo=${tempoAfterPitch.toFixed(3)}`,
    ...(enhancer ? [enhancer] : []),
  ].join(',');

  const format = input.exportSettings.format;
  const isGif = format === 'gif';
  const quality = input.exportSettings.quality === 'high' ? 18 : 26;

  const args: string[] = ['-ss', String(input.startTime), '-i', 'input.mp4'];
  if (hasBgm) {
    args.push('-stream_loop', '-1', '-i', 'bgm.audio');
  }
  args.push('-t', String(clipDuration));

  if (isGif) {
    // GIFs are silent — video-only pipeline with a proper palette pass for
    // decent color quality instead of the default (banded) GIF palette.
    args.push(
      '-vf',
      `${vf.join(',')},fps=15,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      '-loop',
      '0',
      'output.gif'
    );
  } else {
    args.push('-vf', vf.join(','));
    if (hasBgm) {
      args.push(
        '-filter_complex',
        `[0:a]${voiceChain}[voice];[1:a]volume=${(input.audio.bgmVolume / 100).toFixed(2)}[bgm];` +
          `[voice][bgm]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
        '-map',
        '0:v',
        '-map',
        '[aout]'
      );
    } else {
      args.push('-af', voiceChain);
    }

    if (format === 'webm') {
      args.push('-c:v', 'libvpx-vp9', '-crf', String(quality), '-b:v', '0', '-c:a', 'libopus');
    } else {
      // mp4 and mov both mux as H.264 + AAC (ffmpeg.wasm's default build has
      // no ProRes encoder, so .mov is H.264-in-MOV rather than true ProRes).
      args.push('-c:v', 'libx264', '-crf', String(quality), '-pix_fmt', 'yuv420p', '-c:a', 'aac');
    }
    if (input.exportSettings.stripMetadata) args.push('-map_metadata', '-1');
  }

  const outName = isGif ? 'output.gif' : `output.${format === 'mov' ? 'mov' : format}`;
  args.push(outName);

  await ffmpeg.exec(args);

  const data = await ffmpeg.readFile(outName);
  const mime = isGif ? 'image/gif' : format === 'webm' ? 'video/webm' : 'video/mp4';
  const blob = new Blob([data as Uint8Array], { type: mime });
  input.onProgress(100);

  return { blob, filename: `cutclip-export.${format}`, warning };
}
