'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PianoAudio = require('../audio.js');

function player() {
    const sources = [];
    const engine = Object.create(PianoAudio.prototype);
    engine.releaseSeconds = 1;
    engine.held = new Map();
    engine.buffers = new Map([[60, { note: 'C4' }], [63, { note: 'D#4' }]]);
    engine.context = {
        currentTime: 10, destination: {},
        createBufferSource() {
            const source = { playbackRate: {}, connect() {}, disconnect() { this.disconnected = true; },
                start(t) { this.startTime = t; }, stop(t) { this.stopTime = t; } };
            sources.push(source); return source;
        },
        createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, setTargetAtTime() {} } }; }
    };
    return { engine, sources };
}

test('pitches round trip and adjacent notes use the nearest recording at the correct rate', () => {
    const { engine, sources } = player();
    for (let midi = 36; midi <= 84; midi++) assert.equal(PianoAudio.midi(PianoAudio.noteName(midi)), midi);
    engine.play(['C#4', 'D4'], 2.5, 12);
    assert.equal(sources[0].buffer.note, 'C4');
    assert.equal(sources[1].buffer.note, 'D#4');
    assert.equal(sources[0].playbackRate.value, 2 ** (1 / 12));
    assert.equal(sources[1].playbackRate.value, 2 ** (-1 / 12));
    assert.equal(sources[0].startTime, 12);
    assert.equal(sources[1].startTime, 12);
    assert.equal(sources[0].stopTime, 15.5);
});

test('keyboard release does not stop quiz or reference voices on the same pitch', () => {
    const { engine, sources } = player();
    engine.play('C4', 5, 11);
    engine.play('C4', 2, 12);
    engine.press('C4');
    engine.release('C4');
    assert.equal(sources[0].stopTime, 17);
    assert.equal(sources[1].stopTime, 15);
    assert.equal(sources[2].stopTime, 11.02);
    assert.equal(engine.held.size, 0);
});

test('an old voice ending cannot discard a newer key press; finished nodes disconnect', () => {
    const { engine, sources } = player();
    engine.press('C4');
    engine.press('C4');
    sources[0].onended();
    assert.equal(engine.held.size, 1);
    assert.equal(sources[0].disconnected, true);
    sources[1].onended();
    assert.equal(engine.held.size, 0);
});

test('failed sample requests reject loading instead of enabling incomplete audio', async () => {
    const originalContext = globalThis.AudioContext;
    const originalFetch = globalThis.fetch;
    try {
        globalThis.AudioContext = class {};
        globalThis.fetch = async () => ({ ok: false });
        const engine = new PianoAudio({ urls: { C4: 'C4.mp3' }, baseUrl: 'https://example.invalid/' });
        await assert.rejects(engine.ready, /could not load/);
    } finally {
        globalThis.AudioContext = originalContext;
        globalThis.fetch = originalFetch;
    }
});
