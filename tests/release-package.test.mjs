import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createReleasePackages } from '../scripts/package-release.mjs';

function writeFile(filePath, contents) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, contents);
}

function listZip(zipPath) {
    const buffer = fs.readFileSync(zipPath);
    let eocdOffset = -1;

    for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
        if (buffer.readUInt32LE(offset) === 0x06054b50) {
            eocdOffset = offset;
            break;
        }
    }

    assert.notEqual(eocdOffset, -1, 'zip end-of-central-directory record should exist');

    const entryCount = buffer.readUInt16LE(eocdOffset + 10);
    const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
    const names = [];
    let offset = centralDirectoryOffset;

    for (let index = 0; index < entryCount; index += 1) {
        assert.equal(buffer.readUInt32LE(offset), 0x02014b50, 'zip central-directory header should exist');
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const nameStart = offset + 46;

        names.push(buffer.subarray(nameStart, nameStart + nameLength).toString('utf8'));
        offset = nameStart + nameLength + extraLength + commentLength;
    }

    return names.sort();
}

test('creates separate Windows and Linux release zips with expected contents', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'streamlyrics-release-'));
    const distDir = path.join(root, 'dist');
    const linuxHelperDir = path.join(root, 'platform/linux/kwin');
    const outDir = path.join(root, 'release');

    writeFile(path.join(distDir, 'manifest.json'), '{"manifest_version":3}');
    writeFile(path.join(distDir, 'assets/panel.js'), 'console.log("panel");');
    writeFile(path.join(linuxHelperDir, 'install.sh'), '#!/usr/bin/env bash\n');
    writeFile(
        path.join(linuxHelperDir, 'streamlyrics-pip-keep-above/metadata.json'),
        '{"KPlugin":{"Id":"streamlyrics-pip-keep-above"}}',
    );

    const result = createReleasePackages({
        rootDir: root,
        distDir,
        linuxHelperDir,
        outDir,
    });

    assert.equal(path.basename(result.windowsZip), 'StreamLyrics-Windows.zip');
    assert.equal(path.basename(result.linuxZip), 'StreamLyrics-Linux.zip');

    const windowsFiles = listZip(result.windowsZip);
    const linuxFiles = listZip(result.linuxZip);

    assert.deepEqual(windowsFiles, ['StreamLyrics/assets/panel.js', 'StreamLyrics/manifest.json']);
    assert.deepEqual(linuxFiles, [
        'StreamLyrics/assets/panel.js',
        'StreamLyrics/manifest.json',
        'platform/linux/kwin/install.sh',
        'platform/linux/kwin/streamlyrics-pip-keep-above/metadata.json',
    ]);
});

test('fails when the extension build is missing', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'streamlyrics-release-missing-'));

    assert.throws(
        () => createReleasePackages({ rootDir: root }),
        /Run npm run build before packaging/,
    );
});
