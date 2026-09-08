'use strict';

const TrainingAnalytics = (() => {
    const names = ['Perfect Unison', 'Minor 2nd', 'Major 2nd', 'Minor 3rd', 'Major 3rd',
        'Perfect 4th', 'Tritone', 'Perfect 5th', 'Minor 6th', 'Major 6th', 'Minor 7th', 'Major 7th', 'Perfect Octave'];
    function summarize(attempts) {
        let correct = 0, streak = 0, bestStreak = 0, time = 0, replays = 0;
        for (const a of attempts) {
            if (a.correct) { correct++; streak++; bestStreak = Math.max(bestStreak, streak); }
            else streak = 0;
            time += a.responseTimeMs; replays += a.replayCount;
        }
        const count = attempts.length;
        return { count, correct, accuracy: count ? correct / count * 100 : null, streak, bestStreak,
            meanTimeMs: count ? time / count : null, meanReplays: count ? replays / count : null };
    }
    function compare(attempts, recent, longTerm) {
        const r = summarize(attempts.slice(-recent));
        const l = summarize(longTerm === 'all' ? attempts : attempts.slice(-Number(longTerm)));
        return { recent: r, longTerm: l, count: attempts.length,
            delta: r.accuracy === null || l.accuracy === null ? null : r.accuracy - l.accuracy };
    }
    function calculate(attempts, recent = 50, longTerm = 'all') {
        // Imported files need not be chronological. IDs break timestamp ties consistently.
        const ordered = [...attempts].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
        const groups = names.map(() => []);
        ordered.forEach(a => groups[a.actualSemitones].push(a));
        const intervals = groups.map((group, semitones) => ({ semitones, name: names[semitones], ...compare(group, recent, longTerm) }));
        const weakest = intervals.filter(row => row.recent.count >= 10)
            .sort((a, b) => a.recent.accuracy - b.recent.accuracy || b.recent.count - a.recent.count || a.semitones - b.semitones).slice(0, 3);
        return { overall: compare(ordered, recent, longTerm), intervals, weakest };
    }
    return { summarize, calculate };
})();

class StatisticsDashboard {
    constructor(loadRecords) {
        this.loadRecords = loadRecords;
        this.session = [];
        this.records = [];
        this.revision = 0;
        this.panel = document.getElementById('statisticsPanel');
        this.recent = document.getElementById('recentWindow');
        this.longTerm = document.getElementById('longWindow');
        this.status = document.getElementById('analyticsStatus');
        try {
            const preferences = JSON.parse(localStorage.getItem('interval-trainer-stats-windows'));
            for (const [key, select] of [['recent', this.recent], ['longTerm', this.longTerm]]) {
                if (preferences && [...select.options].some(o => o.value === String(preferences[key]))) select.value = String(preferences[key]);
            }
        } catch { /* Preferences are optional; history still uses IndexedDB. */ }
        for (const select of [this.recent, this.longTerm]) select.addEventListener('change', () => {
            try { localStorage.setItem('interval-trainer-stats-windows', JSON.stringify({ recent: this.recent.value, longTerm: this.longTerm.value })); } catch {}
            this.draw();
        });
        this.panel.addEventListener('toggle', () => { if (this.panel.open) this.refresh(this.session); });
    }
    async refresh(session) {
        this.session = [...session];
        const revision = ++this.revision;
        if (!this.panel.open) return;
        this.drawSession();
        this.status.textContent = 'Loading history…';
        try {
            const { records, temporary } = await this.loadRecords();
            if (revision !== this.revision) return;
            this.records = records;
            this.status.textContent = `${records.length} total attempts.${temporary ? ' Includes attempts kept only in this tab; export a backup before closing.' : ''}`;
            this.draw();
        } catch {
            if (revision === this.revision) this.status.textContent = 'Could not refresh history. Previously displayed results may be out of date. Close and reopen Statistics to retry.';
        }
    }
    drawSession() {
        const s = TrainingAnalytics.summarize(this.session);
        this.cards('sessionMetrics', [['Attempts', s.count], ['Correct', s.correct], ['Accuracy', this.percent(s.accuracy)],
            ['Current streak', s.streak], ['Best streak', s.bestStreak],
            ['Avg response time', s.meanTimeMs === null ? '—' : `${(s.meanTimeMs / 1000).toFixed(1)} s`],
            ['Avg replays', s.meanReplays === null ? '—' : s.meanReplays.toFixed(1)]]);
    }
    percent(value) { return value === null ? '—' : `${value.toFixed(1)}%`; }
    change(value) { return value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)} pp`; }
    cards(id, items) {
        document.getElementById(id).replaceChildren(...items.map(([label, value]) => {
            const card = document.createElement('div'); card.className = 'metric-card';
            const title = document.createElement('span'); title.textContent = label;
            const metric = document.createElement('strong'); metric.textContent = value;
            card.append(title, metric); return card;
        }));
    }
    draw() {
        this.drawSession();
        const data = TrainingAnalytics.calculate(this.records, Number(this.recent.value), this.longTerm.value);
        const overall = data.overall;
        this.cards('overallMetrics', [
            [`Recent · ${overall.recent.correct}/${overall.recent.count} correct`, this.percent(overall.recent.accuracy)],
            [`Long-term · ${overall.longTerm.correct}/${overall.longTerm.count} correct`, this.percent(overall.longTerm.accuracy)],
            ['Change', this.change(overall.delta)]
        ]);
        document.getElementById('intervalMetrics').replaceChildren(...data.intervals.map(row => {
            const tr = document.createElement('tr');
            const title = document.createElement('th'); title.scope = 'row'; title.textContent = row.name; tr.append(title);
            for (const metric of [row.recent, row.longTerm]) {
                const td = document.createElement('td'); td.textContent = this.percent(metric.accuracy);
                const count = document.createElement('small'); count.textContent = metric.count ? `${metric.correct}/${metric.count} correct` : 'No attempts';
                td.append(count); tr.append(td);
            }
            const delta = document.createElement('td'); delta.textContent = this.change(row.delta);
            if (row.delta) delta.className = row.delta > 0 ? 'correct-text' : 'incorrect-text';
            const total = document.createElement('td'); total.textContent = row.count;
            tr.append(delta, total); return tr;
        }));
        document.getElementById('weakestIntervals').replaceChildren(...data.weakest.map(row => {
            const li = document.createElement('li');
            li.textContent = `${row.name} — ${this.percent(row.recent.accuracy)} · ${row.recent.count} recent attempts`;
            return li;
        }));
        const early = data.intervals.filter(row => row.recent.count > 0 && row.recent.count < 10).map(row => `${row.name} (${row.recent.count}/10)`);
        document.getElementById('weakestNote').textContent = [
            !data.weakest.length ? 'No intervals have enough attempts to rank yet.' : '',
            early.length ? `Still building a sample: ${early.join(', ')}.` : '',
            !this.records.length ? 'Answer a few questions or import an existing backup to start.' : ''
        ].filter(Boolean).join(' ');
    }
}
if (typeof module !== 'undefined') module.exports = TrainingAnalytics;
