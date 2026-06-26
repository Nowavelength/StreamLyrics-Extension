import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const helperPath = 'platform/linux/kwin/streamlyrics-pip-keep-above/contents/code/main.js';
const source = fs.readFileSync(helperPath, 'utf8');

function createSignal() {
    const handlers = [];
    return {
        connect(handler) {
            handlers.push(handler);
        },
        emit(...args) {
            for (const handler of handlers) handler(...args);
        },
        get count() {
            return handlers.length;
        },
    };
}

function createWindow(overrides = {}) {
    return {
        caption: 'StreamLyrics',
        width: 400,
        height: 600,
        keepAbove: false,
        captionChanged: createSignal(),
        frameGeometryChanged: createSignal(),
        ...overrides,
    };
}

function runHelper({ initialWindows = [], intervalRuns = 0 } = {}) {
    const windowAdded = createSignal();
    const intervals = [];
    const workspace = {
        windowList() {
            return initialWindows;
        },
        windowAdded,
    };

    const context = vm.createContext({
        workspace,
        print() {},
        setInterval(callback) {
            intervals.push(callback);
            return intervals.length;
        },
    });

    vm.runInContext(source, context, { filename: helperPath });

    for (let i = 0; i < intervalRuns; i += 1) {
        for (const callback of intervals) callback();
    }

    return { windowAdded, intervals };
}

function testExistingMatchingWindowIsKeptAbove() {
    const pip = createWindow({ caption: 'Song - Artist - StreamLyrics' });

    runHelper({ initialWindows: [pip] });

    assert.equal(pip.keepAbove, true);
}

function testNewMatchingWindowIsKeptAbove() {
    const pip = createWindow({ caption: 'StreamLyrics' });
    const { windowAdded } = runHelper();

    windowAdded.emit(pip);

    assert.equal(pip.keepAbove, true);
}

function testHugeWindowWithStreamLyricsCaptionIsIgnored() {
    const browser = createWindow({
        caption: 'StreamLyrics - YouTube Music - Google Chrome',
        width: 1400,
        height: 900,
    });

    runHelper({ initialWindows: [browser] });

    assert.equal(browser.keepAbove, false);
}

function testFrameGeometryFallbackIsUsedForSize() {
    const browser = createWindow({
        caption: 'StreamLyrics - YouTube Music - Google Chrome',
        width: undefined,
        height: undefined,
        frameGeometry: { width: 1400, height: 900 },
    });

    runHelper({ initialWindows: [browser] });

    assert.equal(browser.keepAbove, false);
}

function testKeepAboveIsReappliedAfterReset() {
    const pip = createWindow({ caption: 'StreamLyrics' });
    const { intervals } = runHelper({ initialWindows: [pip] });

    assert.ok(intervals.length > 0, 'helper should install a periodic reapply pass');
    pip.keepAbove = false;

    for (const callback of intervals) callback();

    assert.equal(pip.keepAbove, true);
}

testExistingMatchingWindowIsKeptAbove();
testNewMatchingWindowIsKeptAbove();
testHugeWindowWithStreamLyricsCaptionIsIgnored();
testFrameGeometryFallbackIsUsedForSize();
testKeepAboveIsReappliedAfterReset();

console.log('KWin helper tests passed');
