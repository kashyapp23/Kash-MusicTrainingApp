const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const stub = `window.audioCalls = []; window.Tone = {
 context: {state:'running'}, start: async () => {}, now: () => 0, loaded: async () => {},
 Frequency: midi => ({toNote: () => ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi%12] + (Math.floor(midi/12)-1)}),
 Sampler: class {constructor(options){window.sampleOptions=options} toDestination(){return this} triggerAttackRelease(...args){audioCalls.push(args)} triggerAttack(){} triggerRelease(){}}
};`;
const server = http.createServer((req, res) => {
    const name = req.url === '/' ? 'index.html' : req.url.slice(1);
    if (!['index.html', 'app.js', 'ui.js', 'nordic.css', 'selection.js', 'analytics.js', 'styles.css', 'stats.js', 'storage.js'].includes(name)) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(fs.readFileSync(path.join(root, name)));
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ headless: true, channel: 'msedge', args: ['--autoplay-policy=no-user-gesture-required'] });
        const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
        const page = await context.newPage();
        // Legacy core regression scenarios expose the original DOM order. The real
        // navigation layer is tested separately below with ui.js enabled.
        await page.route('**/ui.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
        await page.route('**/nordic.css', route => route.fulfill({ contentType: 'text/css', body: '' }));
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'text/javascript', body: stub }));
        const url = `http://127.0.0.1:${server.address().port}/`;
        await page.goto(url);
        await page.waitForFunction(() => !document.getElementById('playBtn').disabled && !document.getElementById('exportStats').disabled);
        assert.equal(await page.locator('#modeSelect').count(), 0);
        assert.equal(await page.locator('#customCheckboxes input').count(), 13);
        assert.equal(await page.locator('.reference-btn').count(), 24);
        assert.equal(await page.locator('.key').count(), 37);
        const samples = await page.evaluate(() => sampleOptions.urls);
        assert.equal(Object.keys(samples).length, 17);
        assert.equal(samples['F#4'], 'Fs4.mp3');
        assert.equal(samples['D#2'], 'Ds2.mp3');
        assert.equal(samples.C6, 'C6.mp3');
        await page.locator('#statisticsPanel > summary').click();
        await page.waitForFunction(() => document.getElementById('analyticsStatus').textContent.startsWith('0 total'));
        assert.match(await page.locator('#weakestNote').innerText(), /No intervals/);
        assert.match(await page.locator('#sessionMetrics').innerText(), /Current streak/);
        await page.locator('#statisticsPanel > summary').click();
        const records = () => page.evaluate(() => TrainingStorage.all());
        await page.locator('#playBtn').click();
        await page.locator('#playBtn').click();
        await page.locator('.reference-btn').first().click();
        await page.locator('.key.white').first().click();
        assert.equal((await records()).length, 0);
        await page.locator('.option-btn').first().dblclick();
        await page.waitForFunction(async () => (await TrainingStorage.all()).length === 1);
        let saved = await records(); assert.equal(saved[0].replayCount, 1);
        const initialSession = saved[0].sessionId;
        // Settings changes abandon a question.
        await page.locator('#playBtn').click();
        await page.locator('#rootSelect').selectOption('fixed-c');
        await page.locator('.option-btn').first().click();
        assert.equal((await records()).length, 1);
        // Too few intervals disables training; adding unison enables it again.
        await page.locator('#customCheckboxes input[value="10"]').uncheck();
        assert.equal(await page.locator('#playBtn').isDisabled(), true);
        await page.locator('#customCheckboxes input[value="0"]').check();
        await page.locator('#customCheckboxes input[value="8"]').uncheck();
        await page.locator('#customCheckboxes input[value="7"]').check();
        await page.locator('#octaveSelect').selectOption('locked');
        await page.evaluate(() => { Math.random = () => 0; });
        await page.locator('#playBtn').click();
        await page.locator('.option-btn').first().click();
        await page.waitForFunction(async () => (await TrainingStorage.all()).length === 2);
        saved = await records();
        const unison = saved.find(a => a.actualSemitones === 0);
        assert.equal(unison.correct, true); assert.equal(unison.replayCount, 0);
        assert.equal(unison.rootMidi, 60); assert.equal(unison.playbackDirection, 'harmonic');
        // Actual export file, then reload and import through the user control.
        const downloadEvent = page.waitForEvent('download');
        await page.locator('#exportStats').click();
        const download = await downloadEvent;
        const backup = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
        assert.equal(backup.attempts.length, 2);
        await page.reload();
        await page.waitForFunction(() => !document.getElementById('importStats').disabled);
        assert.equal((await records()).length, 2);
        assert.match(await page.locator('#sessionStats').innerText(), /0 attempts/);
        async function upload(data) {
            await page.locator('#importFile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
        }
        await upload(backup);
        await page.waitForFunction(() => document.getElementById('storageStatus').textContent.includes('skipped 2'));
        assert.equal((await records()).length, 2);
        await upload({ ...backup, attempts: [backup.attempts[0], { ...backup.attempts[1], correct: 'bad' }] });
        await page.waitForFunction(() => document.getElementById('storageStatus').textContent.includes('Invalid attempt'));
        assert.equal((await records()).length, 2);
        page.once('dialog', dialog => dialog.dismiss());
        await page.locator('#clearStats').click();
        assert.equal((await records()).length, 2);
        page.once('dialog', dialog => dialog.accept());
        await page.locator('#clearStats').click();
        await page.waitForFunction(() => document.getElementById('storageStatus').textContent.includes('history cleared'));
        assert.equal((await records()).length, 0);
        await upload({ ...backup, attempts: [...backup.attempts, backup.attempts[0]] });
        await page.waitForFunction(() => document.getElementById('storageStatus').textContent.includes('Imported 2 attempts; skipped 1'));
        assert.equal((await records()).length, 2);
        await page.locator('#playBtn').click(); await page.locator('.option-btn').first().click();
        await page.waitForFunction(async () => (await TrainingStorage.all()).length === 3);
        saved = await records(); assert.ok(saved.some(a => a.sessionId !== initialSession));
        // Exercise random direction and timing settings.
        await page.locator('#randomPlaybackToggle').check();
        await page.locator('#randomDirectionSelect').selectOption('descending');
        await page.locator('#maxGapInput').fill('0.4'); await page.locator('#maxGapInput').blur();
        await page.locator('#playBtn').click(); await page.locator('.option-btn').first().click();
        await page.waitForFunction(async () => (await TrainingStorage.all()).length === 4);
        assert.ok((await records()).some(a => a.randomTiming && a.playbackGap < 0 && a.playbackGap >= -0.4));
        // A failed write remains exportable and retries with the next answer.
        await page.evaluate(() => {
            window.originalMerge = TrainingStorage.merge;
            TrainingStorage.merge = async () => { throw new Error('simulated quota failure'); };
        });
        await page.locator('#playBtn').click(); await page.locator('.option-btn').first().click();
        await page.waitForFunction(() => document.getElementById('storageStatus').textContent.includes('Could not save'));
        assert.equal((await records()).length, 4);
        await page.evaluate(() => { TrainingStorage.merge = window.originalMerge; });
        await page.locator('#playBtn').click(); await page.locator('.option-btn').first().click();
        await page.waitForFunction(async () => (await TrainingStorage.all()).length === 6);
        // Answering while the asynchronous clear finishes keeps the new answer.
        await page.evaluate(() => {
            const clear = TrainingStorage.clear;
            TrainingStorage.clear = async () => {
                await new Promise(resolve => { window.finishClear = resolve; });
                return clear();
            };
        });
        page.once('dialog', dialog => dialog.accept());
        await page.locator('#clearStats').click();
        await page.waitForFunction(() => typeof window.finishClear === 'function');
        await page.locator('#playBtn').click(); await page.locator('.option-btn').first().click();
        await page.evaluate(() => window.finishClear());
        await page.waitForFunction(async () => (await TrainingStorage.all()).length === 1);
        assert.match(await page.locator('#sessionStats').innerText(), /1 attempts/);
        // Seed uneven per-interval histories through the real importer.
        const example = backup.attempts.find(a => a.actualSemitones === 0);
        const history = Array.from({ length: 50 }, (_, n) => ({
            ...example, id: `analytics-${n}`, sessionId: 'historical',
            timestamp: new Date(Date.UTC(2026, 0, 1, 0, n)).toISOString(),
            actualSemitones: n < 20 ? 0 : 7, secondMidi: n < 20 ? 60 : 67,
            secondNote: n < 20 ? 'C4' : 'G4', answeredSemitones: n < 10 ? 7 : n < 20 ? 0 : 7,
            correct: n >= 10
        }));
        await upload({ ...backup, attempts: history.reverse() });
        await page.waitForFunction(() => document.getElementById('storageStatus').textContent.includes('Imported 50'));
        await page.locator('#statisticsPanel > summary').click();
        await page.locator('#recentWindow').selectOption('10');
        await page.waitForFunction(() => document.getElementById('analyticsStatus').textContent.startsWith('51 total'));
        const unisonRow = page.locator('#intervalMetrics tr').first();
        assert.match(await unisonRow.innerText(), /100.0%/);
        assert.match(await unisonRow.innerText(), /50.0%/);
        assert.match(await unisonRow.innerText(), /\+50.0 pp/);
        assert.equal(await page.locator('#weakestIntervals li').count(), 2);
        assert.match(await page.locator('#sessionMetrics').innerText(), /Attempts\s+1/);
        await page.locator('#longWindow').selectOption('500');
        await page.screenshot({ path: path.join(root, 'tests', 'trainer-desktop.png'), fullPage: true });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: path.join(root, 'tests', 'trainer-mobile.png'), fullPage: true });
        await page.reload();
        await page.locator('#statisticsPanel > summary').click();
        await page.waitForFunction(() => document.getElementById('analyticsStatus').textContent.startsWith('51 total'));
        assert.equal(await page.locator('#recentWindow').inputValue(), '10');
        assert.equal(await page.locator('#longWindow').inputValue(), '500');
        assert.match(await page.locator('#sessionMetrics').innerText(), /Attempts\s+0/);
        await page.locator('#confusionWindow').selectOption('longTerm');
        const pairButton = page.getByRole('button', { name: 'Practice Perfect Unison and Perfect 5th', exact: true });
        assert.equal(await pairButton.count(), 1);
        assert.match(await page.locator('#commonConfusions').innerText(), /10\/20 attempts \(50.0%\)/);
        const pool = () => page.locator('#customCheckboxes input:checked').evaluateAll(nodes => nodes.map(n => Number(n.value)));
        assert.deepEqual(await pool(), [8, 10]);
        await page.locator('#playBtn').click();
        await pairButton.click();
        assert.deepEqual(await pool(), [8, 10]);
        assert.match(await page.locator('#pairDrillStatus').innerText(), /Queued/);
        await page.locator('#cancelPairDrill').click();
        assert.equal(await page.locator('#cancelPairDrill').isVisible(), false);
        await pairButton.click();
        await page.locator('#playBtn').click();
        await page.locator('.reference-btn').first().click();
        await page.locator('.option-btn').first().click();
        await page.waitForFunction(async () => (await TrainingStorage.all()).length === 52);
        assert.deepEqual(await pool(), [8, 10]);
        await page.locator('#playBtn').click();
        assert.deepEqual(await pool(), [0, 7]);
        await page.locator('.option-btn').first().click();
        await page.waitForFunction(async () => (await TrainingStorage.all()).length === 53);
        const newSession = (await records()).filter(a => !history.some(h => h.id === a.id) && a.sessionId !== initialSession);
        assert.ok(newSession.some(a => a.customPool.join(',') === '8,10' && a.replayCount === 1));
        assert.ok(newSession.some(a => a.customPool.join(',') === '0,7'));
        assert.match(await page.locator('#sessionStats').innerText(), /2 attempts/);
        // Browsing windows never changes the selected pair or session.
        await page.locator('#confusionWindow').selectOption('recent');
        assert.deepEqual(await pool(), [0, 7]);
        await page.locator('#confusionWindow').selectOption('longTerm');
        await page.locator('.confusion-matrix-panel summary').click();
        assert.equal(await page.locator('#confusionMatrix tbody tr').count(), 13);
        await page.locator('#statisticsPanel').screenshot({ path: path.join(root, 'tests', 'trainer-confusions.png') });
        // Manual checkbox selection cancels a queued drill.
        await page.locator('#playBtn').click(); await pairButton.click();
        await page.locator('#customCheckboxes input[value="8"]').check();
        assert.equal(await page.locator('#cancelPairDrill').isVisible(), false);
        console.log('PASS: confusion counts/matrix, optional pair queue/cancel, current answer/replay preservation, next-question pool, session continuity, manual override.');
        const conditionHistory = [0, 0.3, -0.3, 0.31, -1, 1.01].map((gap, n) => ({
            ...example, id: `condition-${n}`, sessionId: 'condition-history',
            timestamp: new Date(Date.UTC(2026, 2, 1, 0, n)).toISOString(), actualSemitones: 9,
            secondMidi: 69, secondNote: 'A4', customPool: [7, 9], answeredSemitones: n % 2 === 0 ? 9 : 7,
            correct: n % 2 === 0, playbackGap: gap,
            playbackDirection: gap === 0 ? 'harmonic' : gap > 0 ? 'ascending' : 'descending',
            randomRoot: n % 2 === 0, randomOctave: n < 2, responseTimeMs: (n + 1) * 1000, replayCount: n
        }));
        await upload({ ...backup, attempts: conditionHistory });
        await page.waitForFunction(() => document.getElementById('storageStatus').textContent.includes('Imported 6'));
        await page.locator('#playBtn').click();
        const beforeConditions = await pool();
        await page.locator('#conditionsPanel > summary').click();
        await page.locator('#conditionInterval').selectOption('9');
        await page.waitForFunction(() => document.getElementById('conditionSummary').textContent.startsWith('6 attempts'));
        assert.match(await page.locator('#conditionMetrics').innerText(), /Small sample/);
        const shortRow = page.locator('#conditionMetrics tr').filter({ hasText: 'Short (up to 0.30 s)' });
        assert.match(await shortRow.innerText(), /50.0%/);
        assert.match(await shortRow.innerText(), /2.5 s/);
        assert.match(await shortRow.innerText(), /1.5/);
        await page.locator('#conditionWindow').selectOption('longTerm');
        await page.locator('#conditionInterval').selectOption('12');
        assert.match(await page.locator('#conditionSummary').innerText(), /^0 attempts/);
        assert.match(await page.locator('#conditionMetrics').innerText(), /No attempts/);
        await page.locator('#conditionInterval').selectOption('9');
        assert.deepEqual(await pool(), beforeConditions);
        assert.match(await page.locator('#playBtn').innerText(), /Replay Current/);
        assert.match(await page.locator('#sessionStats').innerText(), /2 attempts/);
        await page.setViewportSize({ width: 1280, height: 1000 });
        await page.locator('#conditionsPanel').screenshot({ path: path.join(root, 'tests', 'trainer-conditions-desktop.png') });
        await page.setViewportSize({ width: 390, height: 844 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.locator('#conditionsPanel').screenshot({ path: path.join(root, 'tests', 'trainer-conditions-mobile.png') });
        console.log('PASS: condition history import, interval/window controls, boundary summaries, empty/small samples, mobile layout, active-question isolation.');
        const beforeDuration = (await records()).length;
        for (const duration of [0.5, 1, 5, 10]) {
            await page.locator('#noteDurationSlider').fill(String(duration));
            assert.match(await page.locator('#noteDurationLabel').innerText(), new RegExp(duration.toFixed(1)));
            await page.locator('.reference-btn').first().click();
            assert.equal(await page.evaluate(() => audioCalls.at(-1)[1]), duration);
        }
        // Changing duration abandons the old question; reference playback never adds attempts.
        await page.locator('.option-btn').first().click();
        assert.equal((await records()).length, beforeDuration);
        await page.locator('#playBtn').click();
        await page.locator('#playBtn').click();
        assert.equal(await page.evaluate(() => audioCalls.at(-1)[1]), 10);
        await page.locator('.option-btn').first().click();
        await page.waitForFunction(async n => (await TrainingStorage.all()).length === n + 1, beforeDuration);
        assert.ok((await records()).some(a => a.noteDurationSeconds === 10 && a.audioSampleSet === 'salamander-17-v1' && a.replayCount === 1));
        const durationDownload = page.waitForEvent('download');
        await page.locator('#exportStats').click();
        const durationBackup = JSON.parse(fs.readFileSync(await (await durationDownload).path(), 'utf8'));
        assert.ok(durationBackup.attempts.some(a => a.noteDurationSeconds === 10));
        console.log('PASS: 17-note mapping, duration boundaries, quiz/replay/reference durations, abandonment, recorded duration and export.');
        assert.deepEqual(errors, []);
        console.log('PASS: custom-only UI, audio scheduling hooks, reference isolation, double-answer guard, abandonment, unison, persistence, session reset, export/import, duplicates, malformed import, clear confirmation, random timing, failed-save retry, answer during clear.');
        // Verify loading failure fallback on a fresh origin/context with IndexedDB denied.
        const offline = await browser.newContext();
        const unavailable = await offline.newPage();
        await unavailable.route('**/ui.js', route => route.fulfill({ contentType: 'text/javascript', body: '' }));
        await unavailable.addInitScript(() => Object.defineProperty(window, 'indexedDB', { get() { throw new Error('denied'); } }));
        await unavailable.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'text/javascript', body: stub }));
        await unavailable.goto(url);
        await unavailable.waitForFunction(() => document.getElementById('storageStatus').textContent.includes('unavailable'));
        await unavailable.locator('#playBtn').click(); await unavailable.locator('.option-btn').first().click();
        const offlineDownload = unavailable.waitForEvent('download'); await unavailable.locator('#exportStats').click();
        const fallbackFile = await offlineDownload;
        assert.equal(JSON.parse(fs.readFileSync(await fallbackFile.path(), 'utf8')).attempts.length, 1);
        console.log('PASS: storage unavailable retains and exports attempts.');
        await offline.close();
        const redesigned = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
        const ui = await redesigned.newPage();
        const uiErrors = []; ui.on('pageerror', e => uiErrors.push(e.message));
        await ui.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'text/javascript', body: stub }));
        await ui.goto(url);
        assert.deepEqual(uiErrors, []);
        await ui.waitForFunction(() => !document.getElementById('playBtn').disabled);
        assert.equal(await ui.locator('#progressView').isVisible(), false);
        await ui.screenshot({ path: path.join(root, 'tests', 'trainer-nordic-light.png'), fullPage: true });
        await ui.locator('#themeToggle').click();
        assert.equal(await ui.locator('html').getAttribute('data-theme'), 'dark');
        await ui.waitForFunction(() => getComputedStyle(document.querySelector('.option-btn')).color === 'rgb(237, 240, 232)');
        await ui.screenshot({ path: path.join(root, 'tests', 'trainer-nordic-dark.png'), fullPage: true });
        await ui.locator('#soundSettings > summary').click();
        await ui.locator('#rootSelect').selectOption('fixed-c');
        await ui.locator('#octaveSelect').selectOption('locked');
        await ui.evaluate(() => { Math.random = () => 0.2; });
        // Original signed slider controls both direction and the actual gap.
        for (const [gap, first] of [[-0.5, 'G#4'], [0, null], [0.5, 'C4']]) {
            await ui.locator('#playbackSlider').fill(String(gap));
            await ui.locator('#playBtn').click();
            const calls = await ui.evaluate(() => audioCalls);
            if (gap === 0) assert.deepEqual(calls.at(-1)[0], ['C4', 'G#4']);
            else { assert.equal(calls.at(-2)[0], first); assert.equal(calls.at(-1)[2], 0.5); }
        }
        await ui.locator('#randomPlaybackToggle').check();
        await ui.locator('#randomDirectionSelect').selectOption('descending');
        await ui.locator('#maxGapInput').fill('2'); await ui.locator('#maxGapInput').blur();
        assert.equal(await ui.locator('#playbackSlider').isDisabled(), true);
        await ui.locator('#playBtn').click();
        const current = await ui.evaluate(() => ({ interval: currentInterval, root: currentRootNote, gap: currentPlaybackGap }));
        assert.equal(current.gap, -0.4);
        await ui.locator('#progressTab').click();
        await ui.waitForFunction(() => document.getElementById('analyticsStatus').textContent.startsWith('0 total'));
        await ui.locator('#themeToggle').click();
        await ui.locator('#practiceTab').click();
        assert.deepEqual(await ui.evaluate(() => ({ interval: currentInterval, root: currentRootNote, gap: currentPlaybackGap })), current);
        await ui.locator('#playBtn').click();
        await ui.locator('[data-reference="variable"]').first().click();
        await ui.locator('#referenceRandomRoot').check();
        await ui.locator('.reference-btn:visible').first().click();
        assert.deepEqual(await ui.evaluate(() => ({ interval: currentInterval, root: currentRootNote, gap: currentPlaybackGap })), current);
        await ui.locator('.option-btn').first().click();
        await ui.waitForFunction(async () => (await TrainingStorage.all()).length === 1);
        assert.equal(await ui.evaluate(async () => (await TrainingStorage.all())[0].replayCount), 1);
        await ui.locator('#progressTab').click();
        await ui.locator('#backupPanel > summary').click();
        const exported = ui.waitForEvent('download'); await ui.locator('#exportStats').click();
        const uiBackup = JSON.parse(fs.readFileSync(await (await exported).path(), 'utf8')); assert.equal(uiBackup.attempts.length, 1);
        await ui.locator('#importFile').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(uiBackup)) });
        await ui.waitForFunction(() => document.getElementById('storageStatus').textContent.includes('skipped 1'));
        await ui.screenshot({ path: path.join(root, 'tests', 'trainer-nordic-progress.png'), fullPage: true });
        await ui.locator('#practiceTab').click();
        await ui.setViewportSize({ width: 390, height: 844 });
        await ui.screenshot({ path: path.join(root, 'tests', 'trainer-nordic-settings-mobile.png'), fullPage: true });
        assert.equal(await ui.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await ui.locator('#soundSettings > summary').click();
        await ui.screenshot({ path: path.join(root, 'tests', 'trainer-nordic-mobile.png'), fullPage: true });
        await ui.locator('#themeToggle').click(); await ui.reload();
        assert.equal(await ui.locator('html').getAttribute('data-theme'), 'dark');
        assert.equal(await ui.evaluate(async () => (await TrainingStorage.all()).length), 1);
        assert.deepEqual(uiErrors, []);
        console.log('PASS: Nordic UI, signed gap slider, random timing/direction, theme persistence, navigation preserves question, reference isolation, session/replays, backup/import, responsive settings.');
        await redesigned.close();
        if (process.env.TEST_REAL_AUDIO) {
            const live = await browser.newContext();
            const realPage = await live.newPage();
            const liveErrors = [];
            realPage.on('pageerror', error => liveErrors.push(error.message));
            await realPage.goto(url);
            await realPage.waitForFunction(() => !document.getElementById('playBtn').disabled, null, { timeout: 25000 });
            await realPage.locator('#playBtn').click();
            await realPage.locator('.option-btn').first().click();
            await realPage.waitForFunction(async () => (await TrainingStorage.all()).length === 1);
            assert.equal(await realPage.evaluate(() => Tone.context.state), 'running');
            assert.deepEqual(liveErrors, []);
            console.log('PASS: real Tone.js, piano samples, audio context, playback and persisted answer.');
            await live.close();
        }
    } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
