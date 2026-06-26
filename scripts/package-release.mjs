import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WINDOWS_ZIP = 'StreamLyrics-Windows.zip';
const LINUX_ZIP = 'StreamLyrics-Linux.zip';

function assertDirectory(dirPath, message) {
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        throw new Error(message);
    }
}

function assertFile(filePath, message) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        throw new Error(message);
    }
}

function copyDirectory(source, target) {
    fs.cpSync(source, target, { recursive: true, dereference: true });
}

function zipDirectory(sourceDir, zipPath) {
    fs.rmSync(zipPath, { force: true });
    execFileSync('zip', ['-q', '-X', '-D', '-r', zipPath, '.'], {
        cwd: sourceDir,
        stdio: 'inherit',
    });
}

export function createReleasePackages(options = {}) {
    const rootDir = options.rootDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const distDir = options.distDir ?? path.join(rootDir, 'dist');
    const linuxHelperDir = options.linuxHelperDir ?? path.join(rootDir, 'platform/linux/kwin');
    const outDir = options.outDir ?? path.join(rootDir, 'release');
    const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'streamlyrics-release-stage-'));

    assertDirectory(distDir, 'Run npm run build before packaging: dist/ is missing.');
    assertFile(path.join(distDir, 'manifest.json'), 'Run npm run build before packaging: dist/manifest.json is missing.');
    assertFile(path.join(linuxHelperDir, 'install.sh'), 'Linux helper installer is missing: platform/linux/kwin/install.sh.');
    assertDirectory(
        path.join(linuxHelperDir, 'streamlyrics-pip-keep-above'),
        'Linux KWin helper is missing: platform/linux/kwin/streamlyrics-pip-keep-above.',
    );

    fs.mkdirSync(outDir, { recursive: true });

    const windowsStage = path.join(stagingRoot, 'windows');
    const linuxStage = path.join(stagingRoot, 'linux');
    const windowsExtensionDir = path.join(windowsStage, 'StreamLyrics');
    const linuxExtensionDir = path.join(linuxStage, 'StreamLyrics');
    const linuxHelperStage = path.join(linuxStage, 'platform/linux/kwin');

    copyDirectory(distDir, windowsExtensionDir);
    copyDirectory(distDir, linuxExtensionDir);
    copyDirectory(linuxHelperDir, linuxHelperStage);

    const windowsZip = path.join(outDir, WINDOWS_ZIP);
    const linuxZip = path.join(outDir, LINUX_ZIP);

    zipDirectory(windowsStage, windowsZip);
    zipDirectory(linuxStage, linuxZip);

    fs.rmSync(stagingRoot, { recursive: true, force: true });

    return { windowsZip, linuxZip };
}

function isCliEntry() {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isCliEntry()) {
    const result = createReleasePackages();
    console.log(`Created ${path.relative(process.cwd(), result.windowsZip)}`);
    console.log(`Created ${path.relative(process.cwd(), result.linuxZip)}`);
}
