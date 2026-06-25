import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const sourcePath = new URL('../src/content/hooks/audioBarsDriver.ts', import.meta.url);

if (!fs.existsSync(sourcePath)) {
    throw new Error('audioBarsDriver.ts is missing');
}

const source = fs.readFileSync(sourcePath, 'utf8');
const transpiled = ts.transpileModule(source, {
    compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        strict: true,
    },
});

const context = {
    exports: {},
    module: { exports: {} },
};
context.exports = context.module.exports;
vm.runInNewContext(transpiled.outputText, context, { filename: 'audioBarsDriver.ts' });

const { createAudioBarsDriver } = context.module.exports;

assert.equal(typeof createAudioBarsDriver, 'function');

const driver = createAudioBarsDriver({
    barCount: 32,
    sampleRate: 44100,
    fftSize: 2048,
});

const silentFrame = new Uint8Array(1024);
const loudFrame = new Uint8Array(1024);
for (let i = 0; i < loudFrame.length; i++) {
    loudFrame[i] = i < 24 ? 255 : 18;
}

const first = driver.process(loudFrame, 33.33);
assert.equal(first.length, 32);
assert.ok(first.every((value) => value >= 0 && value <= 1));

const centerMax = Math.max(...first.slice(12, 20));
const edgeMax = Math.max(...first.slice(0, 4), ...first.slice(28));
assert.ok(centerMax > edgeMax, 'bass-heavy input should emphasize the mirrored center bars');

let decayed = first;
for (let i = 0; i < 50; i++) {
    decayed = driver.process(silentFrame, 33.33);
}

assert.ok(
    Math.max(...decayed) < 0.08,
    'silent frames should decay near rest instead of floating while playback continues',
);

const hotDriver = createAudioBarsDriver({
    barCount: 32,
    sampleRate: 44100,
    fftSize: 2048,
});
const hotFrame = new Uint8Array(1024).fill(255);
let hot = hotFrame;
let hotBars = [];
for (let i = 0; i < 40; i++) {
    hotBars = hotDriver.process(hot, 33.33);
}

assert.ok(Math.max(...hotBars) <= 1);
assert.ok(
    hotBars.filter((value) => value > 0.95).length < 24,
    'autosensitivity should avoid pinning nearly every bar at max height',
);
