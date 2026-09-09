const { test } = require('node:test');
const assert = require('node:assert/strict');
const { AttemptTracker } = require('../stats.js');
const storage = require('../storage.js');
const settings = {
    actualSemitones: 9, rootMidi: 60, secondMidi: 69, rootNote: 'C4', secondNote: 'A4',
    playbackGap: -0.64, maxGap: 1.5, randomDirection: 'both', randomRoot: false,
    randomOctave: false, randomTiming: true, customPool: [7, 9]
};
function setup() {
    let clock = 100;
    const saved = [];
    const tracker = new AttemptTracker({ sessionId: 'session', now: () => clock,
        date: () => '2026-09-08T12:00:00.000Z', id: () => 'attempt', save: a => saved.push(a) });
    return { tracker, saved, tick: n => { clock += n; } };
}
test('one complete attempt snapshots settings, elapsed time, answer, and quiz replays', () => {
    const { tracker, saved, tick } = setup();
    const config = { ...settings, customPool: [7, 9] };
    tracker.begin(config); config.customPool.push(12);
    tick(1000); tracker.replay(); tick(2820);
    const a = tracker.answer(7);
    assert.equal(a.correct, false); assert.equal(a.responseTimeMs, 3820);
    assert.equal(a.replayCount, 1); assert.equal(a.playbackDirection, 'descending');
    assert.deepEqual(a.customPool, [7, 9]); assert.equal(saved.length, 1);
    assert.equal(tracker.answer(7), null); assert.equal(saved.length, 1);
    assert.deepEqual(storage.validateAttempt(a), a);
});
test('abandoned and unanswered questions do not create attempts', () => {
    const { tracker, saved } = setup();
    tracker.replay(); tracker.answer(9); tracker.begin(settings); tracker.abandon(); tracker.answer(9);
    assert.equal(saved.length, 0);
});
test('new question resets replays; unison and harmonic playback are recorded', () => {
    const { tracker } = setup();
    tracker.begin(settings); tracker.replay();
    tracker.begin({ ...settings, actualSemitones: 0, secondMidi: 60, secondNote: 'C4', playbackGap: 0, customPool: [0, 7] });
    const a = tracker.answer(0);
    assert.equal(a.replayCount, 0); assert.equal(a.correct, true); assert.equal(a.playbackDirection, 'harmonic');
    storage.validateAttempt(a);
});
test('versioned backup round trip preserves raw attempts', () => {
    const { tracker } = setup(); tracker.begin(settings);
    const a = tracker.answer(9);
    assert.deepEqual(storage.parseBackup(JSON.stringify(storage.makeBackup([a]))), [a]);
});
test('duration and sample set survive export/import while legacy records remain compatible', () => {
    const { tracker } = setup();
    tracker.begin({ ...settings, noteDurationSeconds: 10, audioSampleSet: 'salamander-17-v1' });
    const a = tracker.answer(9);
    assert.deepEqual(storage.parseBackup(JSON.stringify(storage.makeBackup([a]))), [a]);
    assert.throws(() => storage.validateAttempt({ ...a, noteDurationSeconds: 11 }));
    assert.throws(() => storage.validateAttempt({ ...a, noteDurationSeconds: null }));
});
test('reject incompatible backups, invalid records, and inconsistent answers before import', () => {
    const { tracker } = setup(); tracker.begin(settings); const a = tracker.answer(7);
    for (const change of [{ correct: true }, { responseTimeMs: -1 }, { customPool: [9] },
        { playbackDirection: 'ascending' }, { rootNote: 'G4' }, { replayCount: 1.5 }, { randomTiming: 'yes' }]) {
        assert.throws(() => storage.parseBackup(JSON.stringify(storage.makeBackup([a, { ...a, ...change }]))));
    }
    assert.throws(() => storage.parseBackup('{'));
    assert.throws(() => storage.parseBackup(JSON.stringify({ ...storage.makeBackup([]), version: 2 })));
});
