const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IntervalSelector } = require('../selection.js');
test('two-choice practice allows doubles but never longer runs', () => {
    const selector = new IntervalSelector(() => 0);
    assert.deepEqual(Array.from({ length: 6 }, () => selector.next([0, 7])), [0, 0, 7, 0, 0, 7]);
});
test('cap holds across pool changes and unselected intervals never appear', () => {
    const selector = new IntervalSelector(() => 0);
    assert.equal(selector.next([3, 4, 7]), 3);
    assert.equal(selector.next([3, 4, 7]), 3);
    assert.equal(selector.next([3, 9]), 9);
    assert.equal(selector.next([0, 12]), 0);
});
test('long run has no triples and no systematic interval preference', () => {
    let seed = 12345;
    const selector = new IntervalSelector(() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296));
    const counts = [0, 0, 0, 0]; let last = null, run = 0;
    for (let i = 0; i < 40000; i++) {
        const n = selector.next([0, 1, 2, 3]); counts[n]++;
        run = n === last ? run + 1 : 1; last = n;
        assert.ok(run <= 2);
    }
    counts.forEach(count => assert.ok(count > 9500 && count < 10500));
});
