export interface AudioBarsDriverOptions {
    barCount: number;
    sampleRate: number;
    fftSize: number;
    lowerCutoffHz?: number;
    upperCutoffHz?: number;
    noiseReduction?: number;
}

interface FrequencyBand {
    startBin: number;
    endBin: number;
    gain: number;
}

const DEFAULT_LOWER_CUTOFF_HZ = 50;
const DEFAULT_UPPER_CUTOFF_HZ = 10_000;
const DEFAULT_NOISE_REDUCTION = 77;
const SIGNAL_GATE = 0.025;
const MIN_SENSITIVITY = 0.35;
const MAX_SENSITIVITY = 5;
const CAVA_REFERENCE_FPS = 66;

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function createBands(
    halfBarCount: number,
    sampleRate: number,
    fftSize: number,
    lowerCutoffHz: number,
    upperCutoffHz: number,
): FrequencyBand[] {
    const nyquist = sampleRate / 2;
    const safeLower = clamp(lowerCutoffHz, 1, nyquist - 1);
    const safeUpper = clamp(Math.max(upperCutoffHz, safeLower + 1), safeLower + 1, nyquist);
    const binHz = sampleRate / fftSize;
    const ratio = safeUpper / safeLower;

    return Array.from({ length: halfBarCount }, (_, index) => {
        const lower = safeLower * Math.pow(ratio, index / halfBarCount);
        const upper = safeLower * Math.pow(ratio, (index + 1) / halfBarCount);
        const center = Math.sqrt(lower * upper);
        const startBin = Math.max(1, Math.floor(lower / binHz));
        const endBin = Math.max(startBin, Math.ceil(upper / binHz));

        // CAVA applies per-band EQ after logarithmic grouping. This lighter
        // browser-side version lifts mids/highs without letting noise dominate.
        const gain = clamp(Math.pow(center / 1_000, 0.32), 0.55, 2.35);

        return { startBin, endBin, gain };
    });
}

export function createAudioBarsDriver({
    barCount,
    sampleRate,
    fftSize,
    lowerCutoffHz = DEFAULT_LOWER_CUTOFF_HZ,
    upperCutoffHz = DEFAULT_UPPER_CUTOFF_HZ,
    noiseReduction = DEFAULT_NOISE_REDUCTION,
}: AudioBarsDriverOptions) {
    const halfBarCount = Math.ceil(barCount / 2);
    const bands = createBands(
        halfBarCount,
        sampleRate,
        fftSize,
        lowerCutoffHz,
        upperCutoffHz,
    );
    const previous = Array.from({ length: halfBarCount }, () => 0);
    const memory = Array.from({ length: halfBarCount }, () => 0);
    const peak = Array.from({ length: halfBarCount }, () => 0);
    const fall = Array.from({ length: halfBarCount }, () => 0);
    const smoothed = Array.from({ length: halfBarCount }, () => 0);
    const bars = Array.from({ length: barCount }, () => 0);
    const smoothing = clamp(noiseReduction, 0, 100) / 100;
    let sensitivity = 1.35;

    const process = (frequencyData: Uint8Array, deltaMs = 1000 / 30): number[] => {
        const frameScale = clamp(deltaMs / (1000 / 30), 0.25, 3);
        const framerate = 1000 / Math.max(deltaMs, 1);
        const framerateMod = clamp(CAVA_REFERENCE_FPS / framerate, 0.35, 3);
        let maxRaw = 0;

        for (let i = 0; i < bands.length; i++) {
            const band = bands[i];
            const endBin = Math.min(band.endBin, frequencyData.length - 1);
            let sum = 0;
            let count = 0;

            for (let bin = Math.min(band.startBin, endBin); bin <= endBin; bin++) {
                sum += frequencyData[bin] ?? 0;
                count++;
            }

            const average = count ? sum / count / 255 : 0;
            const gated = average <= SIGNAL_GATE
                ? 0
                : (average - SIGNAL_GATE) / (1 - SIGNAL_GATE);
            const raw = clamp(gated * band.gain, 0, 2.5);
            smoothed[i] = raw;
            if (raw > maxRaw) maxRaw = raw;
        }

        if (maxRaw > 0.001) {
            if (maxRaw * sensitivity > 1) {
                sensitivity *= 1 - 0.025 * framerateMod;
            } else {
                sensitivity *= 1 + 0.0014 * framerateMod;
            }
            sensitivity = clamp(sensitivity, MIN_SENSITIVITY, MAX_SENSITIVITY);
        }

        const integralWeight = 0.16 + smoothing * 0.3;
        const gravity = (0.48 + (1 - smoothing) * 0.52) * Math.pow(framerateMod, 0.85);

        for (let i = 0; i < smoothed.length; i++) {
            const target = clamp(smoothed[i] * sensitivity, 0, 1);
            let shaped: number;

            if (target >= previous[i]) {
                fall[i] = 0;
                peak[i] = target;
                shaped = previous[i] + (target - previous[i]) * 0.68;
            } else {
                fall[i] += 0.07 * frameScale;
                shaped = Math.max(target, peak[i] * (1 - fall[i] * fall[i] * gravity));
                if (shaped <= target + 0.01) peak[i] = target;
            }

            let next = memory[i] * integralWeight + shaped * (1 - integralWeight);
            if (target === 0 && next < 0.006) next = 0;
            memory[i] = next;
            previous[i] = next;
            smoothed[i] = clamp(next, 0, 1);
        }

        const half = barCount / 2;
        for (let i = 0; i < barCount; i++) {
            const bandIndex = i < half
                ? Math.floor(half - 1 - i)
                : Math.floor(i - half);
            bars[i] = smoothed[clamp(bandIndex, 0, smoothed.length - 1)] ?? 0;
        }

        return [...bars];
    };

    return { process };
}
