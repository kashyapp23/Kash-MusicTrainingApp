'use strict';

// Discourage long runs without ever making a selected interval impossible.
class IntervalSelector {
    constructor(random = Math.random) {
        this.random = random;
        this.last = null;
        this.run = 0;
    }
    next(pool) {
        if (pool.length < 2) throw new Error('Choose at least two intervals.');
        const repeatWeight = Math.max(0.05, Math.pow(0.35, Math.max(0, this.run - 1)));
        const weights = pool.map(n => n === this.last ? repeatWeight : 1);
        let target = this.random() * weights.reduce((sum, weight) => sum + weight, 0);
        let interval = pool[pool.length - 1];
        for (let i = 0; i < pool.length; i++) {
            target -= weights[i];
            if (target < 0) { interval = pool[i]; break; }
        }
        this.run = interval === this.last ? this.run + 1 : 1;
        this.last = interval;
        return interval;
    }
}
if (typeof module !== 'undefined') module.exports = { IntervalSelector };
