# Custom interval trainer

Open **index.html** with VS Code Live Server. No installation, build step, account, or paid service is required. The original `intervalsPractice.html` is preserved for reference and does not include tracking.

## Files

- `index.html` — trainer page
- `styles.css` — existing styling and compact stats controls
- `app.js` — custom quiz, piano audio, keyboard, and interval references
- `selection.js` — weighted random interval selection. After a double, the repeated interval's weight decreases by a factor of 0.35 per additional occurrence, with a 0.05 minimum; other intervals have weight 1. Long runs remain possible, but become less likely. Replays and reference playback do not advance selection.
- `stats.js` — attempt lifecycle, session display, backup controls
- `analytics.js` — session summaries, history windows, and the statistics panel
- `storage.js` — IndexedDB and versioned JSON validation/import/export

Tone.js and Salamander piano samples are free external resources, as in the original trainer. They require an internet connection to load. Training data stays in the browser; no data is sent to those hosts.

The piano now loads 17 MP3 recordings from C2 through C6: C, D-sharp, F-sharp, and A in octaves 2–5, plus C6. Missing pitches are at most one semitone from a recording. The audio download is approximately 1.25 MB. Samples are Salamander Grand Piano by Alexander Holm (Yamaha C5), [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/), distributed by the [Tone.js audio repository](https://github.com/Tonejs/audio/tree/master/salamander).

**Note duration** controls the hold time for quiz and reference playback, from 0.5 to 10 seconds in 0.1-second steps; the default remains 2.5 seconds. Release has the existing 1-second fade. This does not loop or sustain the sample at constant volume: recorded piano notes decay and can finish before the chosen time. Interactive piano keys still use press/release. Changing duration abandons the current question, as with the other playback settings. New attempts include `noteDurationSeconds` and `audioSampleSet`; existing version-1 backups without these optional fields still import unchanged. Historical attempts without these fields used the previous 2.5-second duration and five-C-note sample mapping.

## History and backups

Only completed custom quiz answers are recorded. The first playback starts response timing; answering stops it. Listening, reference comparisons, and quiz replays are included in elapsed time. Only quiz replays increment the replay counter. Changed settings abandon the current question without recording it. Reference playback and piano keys never create attempts.

A session starts on each page load. Session totals show answers from that page session; importing historical records does not inflate them. All completed attempts are kept in IndexedDB, including exact intervals (semitones), answer, MIDI pitches and note names, direction, signed playback gap in seconds, settings, interval pool, response time in milliseconds, replay count, timestamp, session ID, and unique attempt ID. Octave and pitch class can be derived exactly from the stored MIDI pitch.

Use **Export Training Data** to download a JSON backup. Save or move it to a folder you know, a synced Google Drive folder, or upload it to Drive yourself. This app does not automatically sync to Drive or write to an arbitrary folder. Your browser download settings choose the destination.

**Import Training Data** merges a compatible backup and skips existing attempt IDs. Invalid files are rejected before any records are written. **Clear Statistics** asks for confirmation and clears browser history and current session totals; backup files are unaffected.

Use the same browser/profile and the same Live Server hostname and port (for example, always `http://127.0.0.1:5500`). Different origins have separate browser storage. Export before changing origin, clearing browser data, or moving computers. If a save fails, the page retains pending attempts in memory for export and retries on the next answer.

## Statistics

Open **View Statistics** beneath the backup controls. Session metrics reset on reload; history comparisons include saved attempts and any unsaved answers still in this tab. Imported history appears in comparisons without increasing session totals.

Recent windows offer 10, 25, 50, 100, 250, or 500 attempts. Long-term offers 500, 1,000, 2,000, 4,000, or all attempts. Choices are saved locally as optional preferences. Overall windows use the last N answers across all intervals; each interval row uses that interval's own last N attempts. Counts show the actual available sample, even when it is smaller than the chosen window.

Long-term includes recent attempts. Change is a percentage-point difference between these overlapping windows, not a comparison of matched practice conditions. All custom pools, directions, and pitch settings are combined for now. Weakest intervals require at least 10 recent attempts and are ranked by accuracy, with larger samples breaking ties. Unpracticed intervals show no accuracy rather than 0%.

### Confusion analysis

Inside Statistics, Common Confusions shows up to 10 directed mistakes ranked by count. Choose recent or long-term to reuse the configured window size for each interval heard. Rates divide that specific wrong answer count by all attempts for the interval heard, including correct answers. The expandable matrix shows all 13 intervals, with heard intervals as rows and answers as columns. Counts combine different custom sets and practice settings.

**Practice this pair** is always your choice. If a question is unanswered, the pair is queued for the next new question; current notes, answer options, replays, and the recorded pool stay intact. Cancel the queued choice in Statistics, or manually change the interval checkboxes to override it. If no question is active, the pair is selected immediately without playing audio. Session totals never reset, and no recommendations appear after mistakes.

### Practice conditions

Expand **Performance by practice conditions** inside Statistics. Choose all intervals or a specific heard interval, and recent or long-term history using the window sizes above. The app first selects the last N matching attempts, then divides that sample by direction, gap, root setting, and octave setting. It does not take a separate last N for every condition.

Gap means time between note onsets: simultaneous, up to 0.30 seconds, over 0.30 through 1.00 seconds, or over 1.00 second, regardless of ascending/descending order. Root and octave groups reflect the configured randomization settings, even when a random draw happens to be C or octave 4. Response time and replay means include both correct and wrong answers. Each row shows actual counts; fewer than 10 attempts is marked as a small sample. Other conditions and custom sets can differ, so these comparisons describe history rather than isolate a cause. No training state changes when using these controls.

## Verification commands

Run `node --check app.js`, `node --check stats.js`, `node --check storage.js`, and `node --test tests/tracking.test.cjs`.
Also run `node --check analytics.js` and `node --test tests/analytics.test.cjs`.
Selection checks: `node --check selection.js` and `node --test tests/selection.test.cjs`.

`tests/browser.cjs` provides browser integration checks using Playwright when available. Playwright is only a development test tool; the app has no npm dependencies.
