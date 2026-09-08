const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const stub = `window.audioCalls = []; window.Tone = {
 context: {state:'running'}, start: async () => {}, now: () => 0, loaded: async () => {},
 Frequency: midi => ({toNote: () => ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][midi%12] + (Math.floor(midi/12)-1)}),
 Sampler: class {toDestination(){return this} triggerAttackRelease(...args){audioCalls.push(args)} triggerAttack(){} triggerRelease(){}}
};`;
const server = http.createServer((req, res) => {
    const name = req.url === '/' ? 'index.html' : req.url.slice(1);
    if (!['index.html', 'app.js', 'analytics.js', 'styles.css', 'stats.js', 'storage.js'].includes(name)) { res.writeHead(404).end(); return; }
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
        const errors = []; page.on('pageerror', e => errors.push(e.message));
        await page.route('https://cdnjs.cloudflare.com/**', route => route.fulfill({ contentType: 'text/javascript', body: stub }));
        const url = `http://127.0.0.1:${server.address().port}/`;
        await page.goto(url);
        await page.waitForFunction(() => !document.getElementById('playBtn').disabled && !document.getElementById('exportStats').disabled);
        assert.equal(await page.locator('#modeSelect').count(), 0);
        assert.equal(await page.locator('#customCheckboxes input').count(), 13);
        assert.equal(await page.locator('.reference-btn').count(), 24);
        assert.equal(await page.locator('.key').count(), 37);
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
        assert.deepEqual(errors, []);
        console.log('PASS: custom-only UI, audio scheduling hooks, reference isolation, double-answer guard, abandonment, unison, persistence, session reset, export/import, duplicates, malformed import, clear confirmation, random timing, failed-save retry, answer during clear.');
        // Verify loading failure fallback on a fresh origin/context with IndexedDB denied.
        const offline = await browser.newContext();
        const unavailable = await offline.newPage();
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
