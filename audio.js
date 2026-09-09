'use strict';

// Small sample player built directly on browser APIs. No library code required.
class PianoAudio {
    constructor({ urls, baseUrl, release = 1 }) {
        this.releaseSeconds = release;
        this.buffers = new Map();
        this.held = new Map();
        this.ready = this.load(urls, baseUrl);
    }

    static noteName(midi) {
        return ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midi % 12] + (Math.floor(midi / 12) - 1);
    }

    static midi(note) {
        const match = /^([A-G])(#?)(-?\d+)$/.exec(note);
        if (!match) throw new Error('Invalid piano note');
        return (Number(match[3]) + 1) * 12 + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]] + (match[2] ? 1 : 0);
    }

    async load(urls, baseUrl) {
        const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!Context) throw new Error('This browser does not support Web Audio.');
        this.context = new Context();
        await Promise.all(Object.entries(urls).map(async ([note, filename]) => {
            const response = await fetch(baseUrl + filename);
            if (!response.ok) throw new Error(`Piano sample could not load: ${filename}`);
            const buffer = await this.context.decodeAudioData(await response.arrayBuffer());
            this.buffers.set(PianoAudio.midi(note), buffer);
        }));
    }

    async resume() {
        if (this.context.state !== 'running') await this.context.resume();
    }

    now() { return this.context.currentTime + 0.02; }

    voice(note, when) {
        const midi = PianoAudio.midi(note);
        const pitches = [...this.buffers.keys()];
        if (!pitches.length) throw new Error('Piano samples are not ready.');
        const closest = pitches.reduce((best, pitch) => Math.abs(pitch - midi) < Math.abs(best - midi) ? pitch : best);
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        source.buffer = this.buffers.get(closest);
        source.playbackRate.value = 2 ** ((midi - closest) / 12);
        source.connect(gain);
        gain.connect(this.context.destination);
        gain.gain.setValueAtTime(1, when);
        const voice = { source, gain, when, ended: false };
        source.onended = () => {
            voice.ended = true;
            source.disconnect();
            gain.disconnect();
            if (this.held.get(note) === voice) this.held.delete(note);
        };
        source.start(when);
        return voice;
    }

    fade(voice, when) {
        if (voice.ended) return;
        const start = Math.max(when, voice.when);
        voice.gain.gain.setValueAtTime(1, start);
        // A smooth decay followed by a silent stop, one second by default.
        voice.gain.gain.setTargetAtTime(0, start, this.releaseSeconds / 5);
        voice.gain.gain.setValueAtTime(0, start + this.releaseSeconds);
        voice.source.stop(start + this.releaseSeconds);
    }

    play(notes, duration, when = this.now()) {
        for (const note of Array.isArray(notes) ? notes : [notes]) {
            this.fade(this.voice(note, when), when + duration);
        }
    }

    press(note) {
        this.release(note);
        this.held.set(note, this.voice(note, this.now()));
    }

    release(note) {
        const voice = this.held.get(note);
        if (!voice) return;
        this.held.delete(note);
        this.fade(voice, this.context.currentTime);
    }
}

if (typeof module !== 'undefined') module.exports = PianoAudio;
