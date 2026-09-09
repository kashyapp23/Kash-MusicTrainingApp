'use strict';

// No server: records belong to this browser and Live Server origin.
const TrainingStorage = (() => {
    const FORMAT = 'interval-trainer';
    const VERSION = 1;
    let database;
    const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
    const finite = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
    const identifier = value => typeof value === 'string' && value.length > 0 && value.length <= 100;
    const midiNote = midi => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midi % 12] + (Math.floor(midi / 12) - 1);

    function validateAttempt(a) {
        if (!a || typeof a !== 'object' || a.schemaVersion !== VERSION || a.mode !== 'custom' ||
            !identifier(a.id) || !identifier(a.sessionId) ||
            typeof a.timestamp !== 'string' || !Number.isFinite(Date.parse(a.timestamp)) ||
            !integer(a.actualSemitones, 0, 12) || !integer(a.answeredSemitones, 0, 12) ||
            a.correct !== (a.actualSemitones === a.answeredSemitones) ||
            !integer(a.rootMidi, 36, 71) || a.secondMidi !== a.rootMidi + a.actualSemitones ||
            a.rootNote !== midiNote(a.rootMidi) || a.secondNote !== midiNote(a.secondMidi) ||
            !finite(a.playbackGap, -15, 15) || !finite(a.maxGap, 0, 15) || Math.abs(a.playbackGap) > a.maxGap ||
            a.playbackDirection !== (Math.abs(a.playbackGap) < 0.000001 ? 'harmonic' : a.playbackGap > 0 ? 'ascending' : 'descending') ||
            !['both', 'ascending', 'descending'].includes(a.randomDirection) ||
            !['randomRoot', 'randomOctave', 'randomTiming'].every(key => typeof a[key] === 'boolean') ||
            !finite(a.responseTimeMs, 0, Number.MAX_SAFE_INTEGER) || !integer(a.replayCount, 0, Number.MAX_SAFE_INTEGER) ||
            !Array.isArray(a.customPool) || a.customPool.length < 2 || a.customPool.length > 13 ||
            !a.customPool.every(n => integer(n, 0, 12)) || new Set(a.customPool).size !== a.customPool.length ||
            !a.customPool.includes(a.actualSemitones) || !a.customPool.includes(a.answeredSemitones)) {
            throw new Error('Invalid attempt record. No data was imported.');
        }
        // Keep only the documented fields from an imported file.
        if (a.noteDurationSeconds !== undefined && !finite(a.noteDurationSeconds, 0.5, 10)) {
            throw new Error('Invalid note duration. No data was imported.');
        }
        if (a.audioSampleSet !== undefined && !identifier(a.audioSampleSet)) {
            throw new Error('Invalid audio sample set. No data was imported.');
        }
        const fields = ['schemaVersion', 'mode', 'id', 'sessionId', 'timestamp', 'actualSemitones',
            'answeredSemitones', 'correct', 'rootMidi', 'secondMidi', 'rootNote', 'secondNote',
            'playbackGap', 'playbackDirection', 'maxGap', 'randomDirection', 'randomRoot',
            'randomOctave', 'randomTiming', 'responseTimeMs', 'replayCount', 'customPool'];
        // Optional additions keep existing version-1 backups compatible.
        if (a.noteDurationSeconds !== undefined) fields.push('noteDurationSeconds');
        if (a.audioSampleSet !== undefined) fields.push('audioSampleSet');
        return Object.fromEntries(fields.map(key => [key, key === 'customPool' ? [...a[key]] : a[key]]));
    }

    function parseBackup(text) {
        let data;
        try { data = JSON.parse(text); } catch { throw new Error('That file is not valid JSON.'); }
        if (!data || data.format !== FORMAT || data.version !== VERSION || !Array.isArray(data.attempts)) {
            throw new Error('Unsupported training backup format or version.');
        }
        return data.attempts.map(validateAttempt);
    }

    function open() {
        if (database) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('interval-trainer', VERSION);
            request.onupgradeneeded = () => {
                const store = request.result.createObjectStore('attempts', { keyPath: 'id' });
                store.createIndex('sessionId', 'sessionId');
                store.createIndex('timestamp', 'timestamp');
            };
            request.onsuccess = () => {
                database = request.result;
                database.onversionchange = () => { database.close(); database = null; };
                resolve();
            };
            request.onerror = () => reject(request.error);
            request.onblocked = () => reject(new Error('Close other trainer tabs and reload to open storage.'));
        });
    }

    function transaction(mode, action) {
        return new Promise((resolve, reject) => {
            if (!database) { reject(new Error('Local history is unavailable.')); return; }
            const tx = database.transaction('attempts', mode);
            let result;
            tx.oncomplete = () => resolve(result);
            tx.onabort = () => reject(tx.error || new Error('History update failed.'));
            tx.onerror = () => {}; // Abort handler reports the final transaction failure.
            try { action(tx.objectStore('attempts'), value => { result = value; }); }
            catch (error) { tx.abort(); reject(error); }
        });
    }

    function all() {
        return transaction('readonly', (store, done) => {
            store.getAll().onsuccess = event => done(event.target.result);
        });
    }

    function merge(attempts) {
        const records = attempts.map(validateAttempt);
        // Reads and writes share one transaction, including duplicates within a file.
        return transaction('readwrite', (store, done) => {
            const counts = { added: 0, skipped: 0 };
            for (const record of records) {
                const request = store.get(record.id);
                request.onsuccess = () => {
                    if (request.result) counts.skipped++;
                    else {
                        const add = store.add(record);
                        add.onsuccess = () => { counts.added++; };
                        add.onerror = event => {
                            if (add.error.name === 'ConstraintError') {
                                event.preventDefault(); event.stopPropagation(); counts.skipped++;
                            }
                        };
                    }
                };
            }
            done(counts);
        });
    }

    return {
        open, all, merge, parseBackup, validateAttempt,
        clear: () => transaction('readwrite', store => store.clear()),
        makeBackup: attempts => ({ format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), attempts })
    };
})();
if (typeof module !== 'undefined') module.exports = TrainingStorage;
