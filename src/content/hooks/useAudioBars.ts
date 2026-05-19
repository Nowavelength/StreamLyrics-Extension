import { useEffect, useState, useRef } from 'react';

// GLOBAL CACHE: Ties the Audio Graph to the physical DOM node, not the React lifecycle.
// This prevents the dreaded "InvalidStateError" when YouTube reuses the <video> element.
const audioGraphCache = new WeakMap<HTMLMediaElement, {
  audioCtx: AudioContext;
  analyser: AnalyserNode;
  source: MediaElementAudioSourceNode;
}>();

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function useAudioBars(barCount = 32) {
  // Initialize with a baseline height so bars are always visible
  const [bars, setBars] = useState<number[]>(Array.from({ length: barCount }, () => 0.05));
  
  // Use a ref to track the mathematical state without waiting for React renders in the RAF loop
  const barsRef = useRef<number[]>(Array.from({ length: barCount }, () => 0.05));

  useEffect(() => {
    let rafId: number;
    let analyser: AnalyserNode;
    let data: Uint8Array;
    let mediaEl: HTMLMediaElement | null = null;
    let isActive = true;

    const initAudio = () => {
      mediaEl = document.querySelector('video.html5-main-video, video') as HTMLMediaElement;
      
      if (!mediaEl) {
        if (isActive) rafId = requestAnimationFrame(initAudio);
        return;
      }

      // --- 1. SINGLETON AUDIO GRAPH ---
      if (!audioGraphCache.has(mediaEl)) {
        try {
          const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
          const newAnalyser = audioCtx.createAnalyser();
          newAnalyser.fftSize = 256;
          newAnalyser.smoothingTimeConstant = 0.8; 

          const source = audioCtx.createMediaElementSource(mediaEl);
          source.connect(newAnalyser);
          newAnalyser.connect(audioCtx.destination);

          audioGraphCache.set(mediaEl, { audioCtx, analyser: newAnalyser, source });
          console.log('[StreamLyrics] Audio Graph successfully mounted to DOM node.');
        } catch (e) {
          console.error('[StreamLyrics] Audio Graph Error - likely a CORS or state issue:', e);
          return;
        }
      }

      const cached = audioGraphCache.get(mediaEl)!;
      analyser = cached.analyser;
      data = new Uint8Array(analyser.frequencyBinCount);

      // --- 2. THE RENDER LOOP ---
      const tick = () => {
        if (!isActive || !analyser || !data) return;

        // Auto-resume context if browser suspended it during SPA nav
        if (cached.audioCtx.state === 'suspended' && !mediaEl?.paused) {
            cached.audioCtx.resume();
        }

        if (mediaEl?.paused) {
          // SOFTWARE DECAY: Smoothly drop bars to baseline when paused instead of CSS freezing
          let settled = true;
          barsRef.current = barsRef.current.map(val => {
            const nextVal = Math.max(0.05, val * 0.85); // 15% decay per frame
            if (nextVal > 0.051) settled = false;
            return nextVal;
          });

          setBars([...barsRef.current]);

          // Sleep the RAF loop completely if all bars have visually settled
          if (!settled) {
            rafId = requestAnimationFrame(tick);
          }
          return; 
        }

        // --- FFT Math ---
        analyser.getByteFrequencyData(data as any);
        const usefulBins = Math.floor(data.length * 0.6);

        const nextBars = Array.from({ length: barCount }, (_, i) => {
          const half = barCount / 2;
          const centerDist = (i < half) ? (half - 1 - i) / (half - 1) : (i - half) / (half - 1);
          
          const binIndex = Math.floor(Math.pow(centerDist, 1.5) * usefulBins);
          const windowSize = Math.max(1, Math.floor(centerDist * 3)); 
          
          let sum = 0, count = 0;
          const start = Math.max(0, binIndex - windowSize);
          const end = Math.min(data.length - 1, binIndex + windowSize);
          
          for (let j = start; j <= end; j++) {
            sum += data[j];
            count++;
          }
          
          const avg = count ? sum / count : 0;
          const eqBoost = 1 + (centerDist * 0.8); 
          const raw = (avg / 255) * eqBoost;
          
          return 0.05 + clamp01(raw) * 0.95;
        });
        
        // Mathematical interpolation
        barsRef.current = barsRef.current.map((prev, i) => prev * 0.7 + nextBars[i] * 0.3);
        setBars([...barsRef.current]);

        rafId = requestAnimationFrame(tick);
      };

      // Start the loop
      rafId = requestAnimationFrame(tick);

      // Event listener to wake up the RAF loop if it went to sleep during pause
      const handlePlay = () => {
        if (cached.audioCtx.state === 'suspended') cached.audioCtx.resume();
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(tick);
      };

      mediaEl.addEventListener('play', handlePlay);

      // Cleanup listener attached directly to the element we captured
      return () => mediaEl?.removeEventListener('play', handlePlay);
    };

    const cleanupListener = initAudio();

    return () => {
      isActive = false;
      cancelAnimationFrame(rafId);
      if (cleanupListener) cleanupListener();
      // WE DO NOT DISCONNECT THE AUDIO GRAPH HERE. It belongs to the DOM node now.
    };
  }, [barCount]);

  return bars;
}
