import { useEffect, useState } from 'react';

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function useAudioBars(barCount = 32) {
  const [bars, setBars] = useState<number[]>(
    Array.from({ length: barCount }, () => 0.12)
  );

  useEffect(() => {
    let raf = 0;
    let audioCtx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let source: MediaElementAudioSourceNode | null = null;
    let data: Uint8Array | null = null;
    let mediaEl: HTMLMediaElement | null = null;

    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      try {
        source?.disconnect();
        analyser?.disconnect();
      } catch {}
      if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.close().catch(() => {});
      }
    };

    const start = async () => {
      mediaEl = document.querySelector('video');
      if (!mediaEl) {
        raf = requestAnimationFrame(start);
        return;
      }

      audioCtx = new window.AudioContext();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }

      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.82;

      try {
        source = audioCtx.createMediaElementSource(mediaEl);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
      } catch (e) {
        console.warn('[StreamLyrics] Audio analyser failed', e);
        return;
      }

      data = new Uint8Array(analyser.frequencyBinCount);
      let smoothBars = Array.from({ length: barCount }, () => 0);

      const tick = () => {
        if (!analyser || !data) return;

        analyser.getByteFrequencyData(data as any);

        const usefulBins = Math.floor(data!.length * 0.6); // Use up to 60% of frequencies
        const nextBars = Array.from({ length: barCount }, (_, i) => {
          const half = barCount / 2;
          
          // Determine normalized distance from the center (0 = center, 1 = edge)
          const centerDist = (i < half) 
             ? (half - 1 - i) / (half - 1)
             : (i - half) / (half - 1);
          
          // Exponential mapping: dedicates more bars to bass frequencies (logarithmic human hearing)
          const binIndex = Math.floor(Math.pow(centerDist, 1.5) * usefulBins);
          
          // Average adjacent bins. We use a wider window for higher frequencies (edges) to smooth them
          const windowSize = Math.max(1, Math.floor(centerDist * 3)); 
          let sum = 0;
          let count = 0;
          for (let j = Math.max(0, binIndex - windowSize); j <= Math.min(data!.length - 1, binIndex + windowSize); j++) {
            sum += data![j];
            count++;
          }
          const avg = count ? sum / count : 0;
          
          // Gentle EQ boost for treble (outer edges) so they aren't completely dead
          const eqBoost = 1 + (centerDist * 0.8); 
          
          const raw = (avg / 255) * eqBoost;
          const normalized = clamp01(raw);
          
          // Base height of 0.05 so bars never disappear
          return 0.05 + normalized * 0.95;
        });
        
        // Smooth interpolation
        smoothBars = smoothBars.map((prev, i) => prev * 0.8 + nextBars[i] * 0.2);

        setBars(smoothBars);
        raf = requestAnimationFrame(tick);
      };

      tick();
    };

    start();

    return cleanup;
  }, [barCount]);

  return bars;
}
