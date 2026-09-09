const { test } = require('node:test');
const assert = require('node:assert/strict');
const { IntervalSelector } = require('../selection.js');
test('even very long runs remain possible', () => {
    const selector = new IntervalSelector(() => 0);
    assert.deepEqual(Array.from({ length: 20 }, () => selector.next([0, 7])), Array(20).fill(0));
});
test('pool changes never select an unselected interval', () => {
    const selector = new IntervalSelector(() => 0);
    assert.equal(selector.next([3, 4, 7]), 3);
    assert.equal(selector.next([3, 4, 7]), 3);
    assert.equal(selector.next([3, 9]), 3);
    assert.equal(selector.next([0, 12]), 0);
});
test('seeded long run permits triples without systematic interval preference', () => {
    let seed = 12345;
    const selector = new IntervalSelector(() => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296));
    const counts = [0, 0, 0, 0]; let last = null, run = 0, triples = 0;
    for (let i = 0; i < 40000; i++) {
        const n = selector.next([0, 1, 2, 3]); counts[n]++;
        run = n === last ? run + 1 : 1; last = n;
        if (run === 3) triples++;
    }
    counts.forEach(count => assert.ok(count > 9500 && count < 10500));
    assert.ok(triples > 0 && triples < 1000);
});
test('repeat probability declines after a double but retains a nonzero floor', () => {
    for (const [run, probability] of [[1, 0.5], [2, 0.35 / 1.35], [3, 0.1225 / 1.1225], [20, 0.05 / 1.05]]) {
        const selector = new IntervalSelector(() => probability - 0.00001);
        selector.last = 0; selector.run = run;
        assert.equal(selector.next([0, 7]), 0);
        const other = new IntervalSelector(() => probability + 0.00001);
        other.last = 0; other.run = run;
        assert.equal(other.next([0, 7]), 7);
    }
});
