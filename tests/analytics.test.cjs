const { test } = require('node:test');
const assert = require('node:assert/strict');
const { summarize, calculate } = require('../analytics.js');
const { confusions } = require('../analytics.js');
const attempt = (id, semitones, correct) => ({ id: String(id), actualSemitones: semitones, correct,
    timestamp: new Date(1700000000000 + id * 1000).toISOString(), responseTimeMs: 2000, replayCount: 1 });
test('empty history is unknown accuracy, not zero percent', () => {
    const data = calculate([]);
    assert.equal(data.overall.recent.accuracy, null);
    assert.equal(data.overall.delta, null);
    assert.equal(data.intervals.length, 13);
    assert.equal(data.weakest.length, 0);
});
test('confusions preserve direction, diagonal counts, and per-heard denominators', () => {
    const records = [
        { ...attempt(1, 7, false), answeredSemitones: 9 },
        { ...attempt(2, 7, true), answeredSemitones: 7 },
        { ...attempt(3, 9, false), answeredSemitones: 7 }
    ];
    const data = confusions(records, 'all');
    assert.equal(data.matrix[7][9], 1);
    assert.equal(data.matrix[9][7], 1);
    assert.equal(data.matrix[7][7], 1);
    assert.equal(data.pairs.find(p => p.actual === 7).rate, 50);
    assert.equal(data.pairs.find(p => p.actual === 9).rate, 100);
    const recent = confusions(records.reverse(), 1);
    assert.equal(recent.matrix[7][9], 0);
    assert.equal(recent.matrix[7][7], 1);
    assert.equal(recent.matrix[9][7], 1);
    assert.equal(confusions([]).pairs.length, 0);
});
test('session streaks reset on errors and include correct answers at the end', () => {
    const s = summarize([true, true, false, true].map((correct, n) => attempt(n, 7, correct)));
    assert.deepEqual(s, { count: 4, correct: 3, accuracy: 75, streak: 1, bestStreak: 2, meanTimeMs: 2000, meanReplays: 1 });
});
test('per-interval windows use each interval own chronological history', () => {
    const records = Array.from({ length: 20 }, (_, n) => attempt(n, 0, n >= 10));
    records.push(...Array.from({ length: 30 }, (_, n) => attempt(n + 20, 7, true)));
    const data = calculate(records.reverse(), 10, 'all');
    assert.equal(data.overall.recent.count, 10);
    assert.equal(data.intervals[0].recent.accuracy, 100);
    assert.equal(data.intervals[0].longTerm.accuracy, 50);
    assert.equal(data.intervals[0].delta, 50);
    assert.equal(data.intervals[7].recent.count, 10);
});
test('bounded long-term window excludes older attempts; small samples are not ranked', () => {
    const records = Array.from({ length: 30 }, (_, n) => attempt(n, 7, n >= 10));
    records.push(attempt(31, 9, false));
    const data = calculate(records, 10, 20);
    assert.equal(data.intervals[7].longTerm.accuracy, 100);
    assert.equal(data.intervals[9].recent.accuracy, 0);
    assert.deepEqual(data.weakest.map(row => row.semitones), [7]);
});
test('weakest ranking uses accuracy then sample count; input remains unchanged', () => {
    const records = [
        ...Array.from({ length: 10 }, (_, n) => attempt(n, 7, n < 5)),
        ...Array.from({ length: 20 }, (_, n) => attempt(n + 10, 9, n < 10))
    ];
    const original = JSON.stringify(records);
    assert.deepEqual(calculate(records, 50).weakest.map(row => row.semitones), [9, 7]);
    assert.equal(JSON.stringify(records), original);
});
