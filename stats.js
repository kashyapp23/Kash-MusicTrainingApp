'use strict';

class AttemptTracker {
    constructor({ sessionId, now = () => performance.now(), date = () => new Date().toISOString(), id = () => crypto.randomUUID(), save }) {
        Object.assign(this, { sessionId, now, date, id, save });
        this.pending = null;
    }
    begin(settings) {
        this.pending = { ...settings, customPool: [...settings.customPool], started: this.now(), replayCount: 0 };
    }
    abandon() { this.pending = null; }
    replay() { if (this.pending) this.pending.replayCount++; }
    answer(answeredSemitones) {
        if (!this.pending || !this.pending.customPool.includes(answeredSemitones)) return null;
        const { started, ...settings } = this.pending;
        this.pending = null; // Consume synchronously so double-clicks cannot create two records.
        const attempt = {
            ...settings, schemaVersion: 1, mode: 'custom', id: this.id(), sessionId: this.sessionId,
            timestamp: this.date(), answeredSemitones,
            correct: settings.actualSemitones === answeredSemitones,
            responseTimeMs: Math.max(0, Math.round(this.now() - started)),
            playbackDirection: Math.abs(settings.playbackGap) < 0.000001 ? 'harmonic' : settings.playbackGap > 0 ? 'ascending' : 'descending'
        };
        this.save(attempt);
        return attempt;
    }
}

function initializeStatistics() {
    const sessionId = crypto.randomUUID();
    const summary = document.getElementById('sessionStats');
    const status = document.getElementById('storageStatus');
    const exportButton = document.getElementById('exportStats');
    const importButton = document.getElementById('importStats');
    const clearButton = document.getElementById('clearStats');
    const input = document.getElementById('importFile');
    let sessionAttempts = [];
    const unsaved = new Map();
    let available = false;
    let busy = false;
    let queue = TrainingStorage.open().then(() => {
        available = true;
        status.textContent = 'History saved in this browser. Export a JSON backup to keep a separate copy.';
    }).catch(() => {
        status.textContent = 'Local storage unavailable. Attempts stay in this tab only; export before closing.';
    }).finally(updateButtons);

    function updateButtons() {
        exportButton.disabled = busy;
        importButton.disabled = busy || !available;
        clearButton.disabled = busy || !available;
    }
    function render() {
        const count = sessionAttempts.length;
        const correct = sessionAttempts.filter(a => a.correct).length;
        summary.textContent = `Session: ${count} attempts · ${count ? Math.round(correct / count * 100) + '%' : '—'} accuracy`;
    }
    function enqueue(action) {
        queue = queue.then(action).catch(error => { status.textContent = error.message; });
        return queue;
    }
    const tracker = new AttemptTracker({ sessionId, save(attempt) {
        sessionAttempts.push(attempt);
        unsaved.set(attempt.id, attempt);
        render();
        enqueue(async () => {
            if (!available) return;
            try {
                // Always include this answer: an earlier queued flush may already have
                // saved it before a subsequently queued clear operation ran.
                const pending = [...new Map([...unsaved, [attempt.id, attempt]]).values()];
                await TrainingStorage.merge(pending);
                pending.forEach(a => unsaved.delete(a.id));
                status.textContent = 'Training history saved locally.';
            } catch {
                status.textContent = 'Could not save locally. Keep this tab open and export a backup; saving will retry on your next answer.';
            }
        });
    }});

    async function operation(action) {
        if (busy) return;
        busy = true; updateButtons();
        try { await enqueue(action); }
        finally { busy = false; updateButtons(); }
    }

    exportButton.addEventListener('click', () => operation(async () => {
        let persisted = [];
        if (available) persisted = await TrainingStorage.all();
        const records = new Map(persisted.map(a => [a.id, a]));
        unsaved.forEach((a, id) => records.set(id, a));
        const backup = TrainingStorage.makeBackup([...records.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)));
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `interval-training-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status.textContent = `Exported ${records.size} attempts. Keep the backup in your chosen folder or Google Drive.${unsaved.size ? ' Some attempts are still only in this tab and the backup.' : ''}`;
    }));
    importButton.addEventListener('click', () => input.click());
    input.addEventListener('change', () => {
        const file = input.files[0]; input.value = '';
        if (!file) return;
        operation(async () => {
            const records = TrainingStorage.parseBackup(await file.text());
            const counts = await TrainingStorage.merge(records);
            status.textContent = `Imported ${counts.added} attempts; skipped ${counts.skipped} duplicates. Session totals track answers in this tab.`;
        });
    });
    clearButton.addEventListener('click', () => {
        if (!confirm('Delete all training history in this browser, including this session? Export a backup first if you want to keep it.')) return;
        const clearedIds = new Set(sessionAttempts.map(a => a.id));
        operation(async () => {
            await TrainingStorage.clear();
            clearedIds.forEach(id => unsaved.delete(id));
            sessionAttempts = sessionAttempts.filter(a => !clearedIds.has(a.id)); render();
            status.textContent = 'Training history cleared. Existing backup files are unchanged.';
        });
    });
    window.addEventListener('beforeunload', event => {
        if (unsaved.size) { event.preventDefault(); event.returnValue = ''; }
    });
    return tracker;
}

const trainingStats = typeof document !== 'undefined' ? initializeStatistics() : null;
if (typeof module !== 'undefined') module.exports = { AttemptTracker };
