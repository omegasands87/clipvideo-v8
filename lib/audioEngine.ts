import { useEffect, useRef } from 'react';
import type { AudioSettings } from './types';

/**
 * Wires the Audio Modification Studio controls to a REAL Web Audio graph
 * on top of the given <video>, instead of just holding React state that
 * nothing reads.
 *
 * Signal path: video element -> MediaElementSource -> PitchShift (Tone.js,
 * true pitch shift independent of speed) -> Gain (Original Voice Volume)
 * -> [optional randomized EQ] -> destination (speakers).
 *
 * video.playbackRate is set directly (that's what actually changes speed);
 * preservesPitch is forced OFF so Pitch Shifting and Playback Speed are
 * two independent controls, matching the two separate sliders in the UI.
 *
 * IMPORTANT: createMediaElementSource() can only ever be called ONCE per
 * <video> element for its whole lifetime, or the browser throws — and this
 * is true regardless of how many times the element's `src`/`videoUrl`
 * changes (loading a second, third, ... clip re-uses the SAME <video> DOM
 * node). So the graph is built ONCE per mounted <video> element (guarded by
 * a ref), never rebuilt on subsequent videoUrl changes — the existing
 * MediaElementSourceNode keeps working automatically when the element's src
 * changes, since it's bound to the element, not to a particular src.
 */
export function useAudioEngine(
  videoRef: React.RefObject<HTMLVideoElement>,
  videoUrl: string | null,
  settings: AudioSettings,
  audioEnhancer: string = 'Normal'
) {
  const graphRef = useRef<{
    ctx: AudioContext;
    pitchNode: any;
    gainNode: GainNode;
    eqNodes: BiquadFilterNode[];
    enhancerNodes: BiquadFilterNode[];
  } | null>(null);
  const builtRef = useRef(false);

  // Build the graph exactly once for the lifetime of the <video> element —
  // NOT once per videoUrl, since createMediaElementSource() would throw on
  // the 2nd+ call and silently disable all audio FX for every video loaded
  // after the first one.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;
    if (builtRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        const Tone = await import('tone');
        if (cancelled) return;
        const ctx = Tone.getContext().rawContext as unknown as AudioContext;

        const source = ctx.createMediaElementSource(video);
        const pitchNode = new Tone.PitchShift({ context: Tone.getContext() });
        const gainNode = ctx.createGain();
        // A small chain of peaking filters at randomized frequencies/gains —
        // toggled on/off by the "Audio Frequency Equalizer Randomizer" switch.
        const eqNodes = [200, 1000, 4000].map((f) => {
          const filt = ctx.createBiquadFilter();
          filt.type = 'peaking';
          filt.frequency.value = f;
          filt.Q.value = 1;
          filt.gain.value = 0;
          return filt;
        });
        // Two-band "Audio Enhancer" preset chain (Vocal Pro / Deep Bass /
        // Warmth / Normal) — a real, named EQ curve rather than a decorative
        // button that does nothing when clicked.
        const enhancerLow = ctx.createBiquadFilter();
        enhancerLow.type = 'lowshelf';
        enhancerLow.frequency.value = 150;
        enhancerLow.gain.value = 0;
        const enhancerMid = ctx.createBiquadFilter();
        enhancerMid.type = 'peaking';
        enhancerMid.frequency.value = 2500;
        enhancerMid.Q.value = 1;
        enhancerMid.gain.value = 0;
        const enhancerNodes = [enhancerLow, enhancerMid];

        // source -> pitchShift -> eq(randomizer) chain -> enhancer chain -> gain -> speakers
        Tone.connect(source, pitchNode);
        let node: any = pitchNode;
        eqNodes.forEach((f) => {
          Tone.connect(node, f);
          node = f;
        });
        enhancerNodes.forEach((f) => {
          Tone.connect(node, f);
          node = f;
        });
        Tone.connect(node, gainNode);
        gainNode.connect(ctx.destination);

        video.preservesPitch = false;

        graphRef.current = { ctx, pitchNode, gainNode, eqNodes, enhancerNodes };
        builtRef.current = true;
      } catch {
        // If Web Audio graph setup fails (e.g. unsupported browser), the
        // video simply falls back to its native, unprocessed audio.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [videoRef, videoUrl]);

  // Apply Playback Speed directly to the <video> element.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = settings.playbackSpeed;
  }, [videoRef, settings.playbackSpeed]);

  // Apply Pitch Shifting (in semitones) independent of speed.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    // Map the 1–5% UI range onto a musically noticeable ±6 semitone range.
    graph.pitchNode.pitch = (settings.pitchShift - 3) * 3;
  }, [settings.pitchShift]);

  // Apply Original Voice Volume.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.gainNode.gain.value = settings.voiceVolume / 100;
  }, [settings.voiceVolume]);

  // Apply the EQ Randomizer toggle — regenerate random bumps/cuts each time
  // it's switched on, or flatten the filters when off.
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    graph.eqNodes.forEach((filt) => {
      filt.gain.value = settings.eqRandomizer ? (Math.random() * 12 - 6) : 0;
      filt.frequency.value = settings.eqRandomizer
        ? 150 + Math.random() * 6000
        : filt.frequency.value;
    });
  }, [settings.eqRandomizer]);

  // Apply the named Audio Enhancer preset (Normal / Vocal Pro / Deep Bass / Warmth).
  useEffect(() => {
    const graph = graphRef.current;
    if (!graph) return;
    const [low, mid] = graph.enhancerNodes;
    const presets: Record<string, { lowGain: number; midGain: number }> = {
      Normal: { lowGain: 0, midGain: 0 },
      'Vocal Pro': { lowGain: -3, midGain: 6 },
      'Deep Bass': { lowGain: 8, midGain: 0 },
      Warmth: { lowGain: 3, midGain: 2 },
    };
    const p = presets[audioEnhancer] ?? presets.Normal;
    low.gain.value = p.lowGain;
    mid.gain.value = p.midGain;
  }, [audioEnhancer]);
}
