# Publication review — native audio version

The current trainer has **no third-party JavaScript dependencies**. Tone.js and its bundled helpers have been removed, along with their unused license files and the two superseded publication snapshots. The preserved original baseline remains unchanged.

## What needs credit

The Salamander Grand Piano recordings by Alexander Holm are licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/). The app includes creator/title credit, source and license links, a description of playback modifications, and the upstream notice (including its retuning credit). See credits.html and THIRD_PARTY_NOTICES.md. The recordings still load from the Tone.js audio hosting site; using that sample host does not require the Tone.js library.

## Checks

- Own audio.js uses browser Web Audio APIs for decoding, pitch shifting, scheduling and release. No library code was copied into the replacement.
- Same 17 recordings, playback directions/gaps, duration controls and independent piano/reference playback retained. The one-second fade now uses the native player's smooth decay envelope.
- All 22 unit tests and JavaScript syntax checks passed. Browser regression tests passed, including real sample loading, persisted answers, and offline rendering of actual audio to verify sound output, onset timing and silence after release. Browser integration was run in Edge; this is not certification of every browser/device.
- Import validation, duplicate-safe merging, local-only training records and manual backups remain unchanged. Network metadata still reaches the website/sample host, as described on the credits page.
- Publication uses an explicit file list, excluding backups, test artifacts, original baseline and Git history. No credentials were found by the earlier source/history pattern scan; such scans cannot guarantee detection of every secret.

## Publish

Run node scripts/prepare-release.cjs to make a fresh publication folder under release/. Use that snapshot for a new repository, keeping the credits and sample notice. Do not use an old Tone-based snapshot or copy the development .git history.

Original code was user-supplied; ownership of that starting material cannot be independently established from the workspace. The release excludes the old baseline and its undocumented teaching prose, and uses rewritten hints. No open-source license has been selected for your own code. This review is not a legal ownership certification.

## Verification commands

- node --test tests/audio.test.cjs tests/tracking.test.cjs tests/analytics.test.cjs tests/selection.test.cjs
- node tests/browser.cjs (with Playwright available; set TEST_REAL_AUDIO=1 for real downloads/rendering)
- node scripts/prepare-release.cjs --check
