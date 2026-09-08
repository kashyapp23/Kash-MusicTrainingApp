# Custom interval trainer

Open **index.html** with VS Code Live Server. No installation, build step, account, or paid service is required. The original `intervalsPractice.html` is preserved for reference and does not include tracking.

## Files

- `index.html` — trainer page
- `styles.css` — existing styling and compact stats controls
- `app.js` — custom quiz, piano audio, keyboard, and interval references
- `stats.js` — attempt lifecycle, session display, backup controls
- `storage.js` — IndexedDB and versioned JSON validation/import/export

Tone.js and Salamander piano samples are free external resources, as in the original trainer. They require an internet connection to load. Training data stays in the browser; no data is sent to those hosts.

## History and backups

Only completed custom quiz answers are recorded. The first playback starts response timing; answering stops it. Listening, reference comparisons, and quiz replays are included in elapsed time. Only quiz replays increment the replay counter. Changed settings abandon the current question without recording it. Reference playback and piano keys never create attempts.

A session starts on each page load. Session totals show answers from that page session; importing historical records does not inflate them. All completed attempts are kept in IndexedDB, including exact intervals (semitones), answer, MIDI pitches and note names, direction, signed playback gap in seconds, settings, interval pool, response time in milliseconds, replay count, timestamp, session ID, and unique attempt ID. Octave and pitch class can be derived exactly from the stored MIDI pitch.

Use **Export Training Data** to download a JSON backup. Save or move it to a folder you know, a synced Google Drive folder, or upload it to Drive yourself. This app does not automatically sync to Drive or write to an arbitrary folder. Your browser download settings choose the destination.

**Import Training Data** merges a compatible backup and skips existing attempt IDs. Invalid files are rejected before any records are written. **Clear Statistics** asks for confirmation and clears browser history and current session totals; backup files are unaffected.

Use the same browser/profile and the same Live Server hostname and port (for example, always `http://127.0.0.1:5500`). Different origins have separate browser storage. Export before changing origin, clearing browser data, or moving computers. If a save fails, the page retains pending attempts in memory for export and retries on the next answer.

## Verification

Run `node --check app.js`, `node --check stats.js`, `node --check storage.js`, and `node --test tests/tracking.test.cjs`.

`tests/browser.cjs` provides browser integration checks using Playwright when available. Playwright is only a development test tool; the app has no npm dependencies.
