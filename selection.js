'use strict';

// Keep random choices, but prevent runs of three or more identical intervals.
class IntervalSelector {
    constructor(random = Math.random) {
        this.random = random;
        this.last = null;
        this.run = 0;
    }
    next(pool) {
        if (pool.length < 2) throw new Error('Choose at least two intervals.');
        const choices = this.run >= 2 ? pool.filter(n => n !== this.last) : pool;
        const interval = choices[Math.floor(this.random() * choices.length)];
        this.run = interval === this.last ? this.run + 1 : 1;
        this.last = interval;
        return interval;
    }
}
if (typeof module !== 'undefined') module.exports = { IntervalSelector };
