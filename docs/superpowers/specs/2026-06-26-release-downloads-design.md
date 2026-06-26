# Release Downloads Design

## Goal

Publish the current local StreamLyrics UI and Linux compatibility work to GitHub with two clear release downloads: one Windows ZIP and one Linux ZIP. The release flow must avoid committing generated `dist/` output and must be repeatable from CI.

## Release Artifacts

- `StreamLyrics-Windows.zip` contains the built Chrome extension from `dist/`.
- `StreamLyrics-Linux.zip` contains the same built Chrome extension plus the Linux KWin helper under `platform/linux/kwin/`.

The extension code is shared across platforms. The Linux ZIP differs only by including the optional KDE/KWin Picture-in-Picture keep-above helper.

## Packaging

Add a Node packaging script that copies `dist/` into temporary staging folders and writes both ZIP files into a release output directory. Keeping the packaging logic in a script makes it testable locally and keeps the GitHub workflow small.

The script must fail if `dist/manifest.json` is missing, because that means the extension was not built first. It must also fail if Linux helper files are missing before making the Linux ZIP.

## GitHub Release Workflow

Add a GitHub Actions workflow that runs on version tags matching `v*`. It will:

1. Install dependencies with `npm ci`.
2. Run package and helper tests.
3. Build with `npm run build`.
4. Create both release ZIPs.
5. Upload both ZIPs to a GitHub Release for the tag.

The workflow will not commit build output. Release assets are produced only in CI.

## README

Update installation docs to lead with release downloads. Use expandable sections for Windows and Linux so the page stays compact. Keep source-build instructions as a fallback.

The Windows flow loads the extracted extension folder from Chrome's `Load unpacked` screen. The Linux flow does the same and then shows the optional KWin helper install command for KDE users. The Linux instructions explicitly avoid `sudo`.

## Verification

Run the packaging test before implementation to confirm missing behavior is caught, then run it after implementation. Final verification is `npm run test:release-package`, existing helper tests, font verification, and `npm run build`. If possible, run local packaging after the build and inspect both ZIP file lists.
