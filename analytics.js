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
    function confusions(attempts, limit = 50) {
        const ordered = [...attempts].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
        const groups = names.map(() => []);
        ordered.forEach(a => groups[a.actualSemitones].push(a));
        const matrix = groups.map(group => {
            const row = names.map(() => 0);
            const window = limit === 'all' ? group : group.slice(-Number(limit));
            window.forEach(a => row[a.answeredSemitones]++);
            return row;
        });
        const totals = matrix.map(row => row.reduce((sum, count) => sum + count, 0));
        const pairs = [];
        matrix.forEach((row, actual) => row.forEach((count, answered) => {
            if (actual !== answered && count) pairs.push({ actual, answered, count,
                attempts: totals[actual], rate: count / totals[actual] * 100 });
        }));
        pairs.sort((a, b) => b.count - a.count || b.rate - a.rate || a.actual - b.actual || a.answered - b.answered);
        return { matrix, totals, pairs };
    }
    function conditions(attempts, interval = 'all', limit = 50) {
        const ordered = attempts.filter(a => interval === 'all' || a.actualSemitones === Number(interval))
            .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id));
        const selected = limit === 'all' ? ordered : ordered.slice(-Number(limit));
        const harmonic = a => a.playbackDirection === 'harmonic';
        const groups = [
            ['Playback direction', [
                ['Harmonic', harmonic], ['Ascending', a => a.playbackDirection === 'ascending'],
                ['Descending', a => a.playbackDirection === 'descending']
            ]],
            ['Time between note onsets', [
                ['Harmonic (simultaneous)', harmonic],
                ['Short (up to 0.30 s)', a => !harmonic(a) && Math.abs(a.playbackGap) <= 0.3],
                ['Medium (>0.30–1.00 s)', a => !harmonic(a) && Math.abs(a.playbackGap) > 0.3 && Math.abs(a.playbackGap) <= 1],
                ['Long (>1.00 s)', a => !harmonic(a) && Math.abs(a.playbackGap) > 1]
            ]],
            ['Root setting', [['Fixed C', a => !a.randomRoot], ['Random root', a => a.randomRoot]]],
            ['Octave setting', [['Locked to 4th octave', a => !a.randomOctave], ['Varying octave', a => a.randomOctave]]]
        ];
        return { count: selected.length, available: ordered.length, groups: groups.map(([name, rows]) => ({ name,
            rows: rows.map(([label, predicate]) => ({ label, ...summarize(selected.filter(predicate)) })) })) };
    }
    return { summarize, calculate, confusions, conditions, names };
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
        this.confusionWindow = document.getElementById('confusionWindow');
        this.confusionWindow.addEventListener('change', () => this.drawConfusions());
        this.conditionInterval = document.getElementById('conditionInterval');
        this.conditionWindow = document.getElementById('conditionWindow');
        TrainingAnalytics.names.forEach((name, value) => {
            const option = document.createElement('option'); option.value = value; option.textContent = name;
            this.conditionInterval.append(option);
        });
        for (const select of [this.conditionInterval, this.conditionWindow]) select.addEventListener('change', () => this.drawConditions());
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
        this.drawConfusions();
        this.drawConditions();
    }
    drawConditions() {
        const limit = this.conditionWindow.value === 'recent' ? this.recent.value : this.longTerm.value;
        const data = TrainingAnalytics.conditions(this.records, this.conditionInterval.value, limit);
        document.getElementById('conditionSummary').textContent = `${data.count} attempts in this window · ${data.available} available for this selection.${data.count ? '' : ' Practice this interval or import history to see results.'}`;
        const rows = [];
        for (const group of data.groups) {
            const heading = document.createElement('tr');
            const title = document.createElement('th'); title.colSpan = 5; title.scope = 'colgroup';
            title.className = 'condition-group'; title.textContent = group.name;
            heading.append(title); rows.push(heading);
            for (const row of group.rows) {
                const tr = document.createElement('tr');
                const label = document.createElement('th'); label.scope = 'row'; label.textContent = row.label; tr.append(label);
                const values = [this.percent(row.accuracy), `${row.correct} / ${row.count}`,
                    row.meanTimeMs === null ? '—' : `${(row.meanTimeMs / 1000).toFixed(1)} s`,
                    row.meanReplays === null ? '—' : row.meanReplays.toFixed(1)];
                values.forEach((value, i) => {
                    const td = document.createElement('td'); td.textContent = value;
                    if (i === 1 && row.count < 10) {
                        const note = document.createElement('small'); note.textContent = row.count ? 'Small sample' : 'No attempts'; td.append(note);
                    }
                    tr.append(td);
                }); rows.push(tr);
            }
        }
        document.getElementById('conditionMetrics').replaceChildren(...rows);
    }
    drawConfusions() {
        const limit = this.confusionWindow.value === 'recent' ? this.recent.value : this.longTerm.value;
        const data = TrainingAnalytics.confusions(this.records, limit);
        const names = TrainingAnalytics.names;
        document.getElementById('commonConfusions').replaceChildren(...data.pairs.slice(0, 10).map(pair => {
            const li = document.createElement('li');
            const description = document.createElement('span');
            description.textContent = `Heard ${names[pair.actual]} → answered ${names[pair.answered]}: ${pair.count}/${pair.attempts} attempts (${pair.rate.toFixed(1)}%)`;
            const button = document.createElement('button'); button.type = 'button';
            button.textContent = 'Practice this pair';
            button.setAttribute('aria-label', `Practice ${names[pair.actual]} and ${names[pair.answered]}`);
            button.addEventListener('click', () => document.dispatchEvent(new CustomEvent('request-pair-drill', { detail: [pair.actual, pair.answered] })));
            li.append(description, button); return li;
        }));
        document.getElementById('confusionEmpty').textContent = data.pairs.length
            ? `Showing ${Math.min(10, data.pairs.length)} most frequent directed confusions. Small counts are preliminary.`
            : data.totals.some(Boolean) ? 'No mistakes in this window.' : 'No attempts in this window yet.';
        const abbreviations = ['P1', 'm2', 'M2', 'm3', 'M3', 'P4', 'TT', 'P5', 'm6', 'M6', 'm7', 'M7', 'P8'];
        const head = document.createElement('thead'); const header = document.createElement('tr');
        ['Heard ↓ / Answered →', ...abbreviations].forEach((label, i) => {
            const th = document.createElement('th'); th.scope = 'col'; th.textContent = label;
            if (i) { th.title = names[i - 1]; th.setAttribute('aria-label', names[i - 1]); }
            header.append(th);
        }); head.append(header);
        const body = document.createElement('tbody');
        data.matrix.forEach((row, actual) => {
            const tr = document.createElement('tr'); const label = document.createElement('th'); label.scope = 'row';
            label.textContent = `${names[actual]} (${data.totals[actual]})`; tr.append(label);
            row.forEach((count, answered) => {
                const td = document.createElement('td'); td.textContent = count || '—';
                td.title = `Heard ${names[actual]}, answered ${names[answered]}: ${count} attempts`;
                td.setAttribute('aria-label', td.title);
                if (count) td.className = actual === answered ? 'matrix-correct' : 'matrix-error';
                tr.append(td);
            }); body.append(tr);
        });
        document.getElementById('confusionMatrix').replaceChildren(head, body);
    }
}
if (typeof module !== 'undefined') module.exports = TrainingAnalytics;
