'use strict';

// Reorganize existing controls without replacing their state or event handlers.
(() => {
    const existing = new Map([...document.querySelectorAll('[id]')].map(element => [element.id, element]));
    const byId = id => document.getElementById(id) || existing.get(id);
    const container = document.querySelector('.container');
    const header = document.createElement('header'); header.className = 'app-header';
    header.innerHTML = `<a class="brand" href="#" aria-label="Interval, practice home"><span class="brand-mark" aria-hidden="true"><b></b><b></b><b></b></span> interval</a>
        <nav aria-label="Main navigation"><button id="practiceTab" type="button" aria-pressed="true" aria-controls="practiceView">Practice</button><button id="progressTab" type="button" aria-pressed="false" aria-controls="progressView">Progress</button></nav>
        <button id="themeToggle" type="button" aria-pressed="false">Dark mode</button>`;
    const intro = document.createElement('div'); intro.className = 'page-intro';
    intro.innerHTML = '<div><p class="eyebrow">A practice in listening</p><h1 id="pageTitle">Find the space between.</h1></div>';
    intro.append(byId('sessionStats'));
    const practice = document.createElement('section'); practice.id = 'practiceView'; practice.className = 'practice-layout';
    practice.setAttribute('aria-label', 'Practice');
    const main = document.createElement('div'); main.className = 'practice-main';
    const exercise = document.createElement('section'); exercise.className = 'exercise'; exercise.setAttribute('aria-label', 'Interval exercise');
    const exerciseHeader = document.createElement('div'); exerciseHeader.className = 'exercise-header';
    exerciseHeader.innerHTML = '<span>Custom practice</span><span id="poolCount"></span>';
    const listen = document.createElement('div'); listen.className = 'listen-area'; listen.append(byId('playBtn'));
    const playCaption = document.createElement('span'); playCaption.className = 'play-caption'; listen.append(playCaption);
    function playbackCaption() {
        const text = byId('playBtn').textContent;
        playCaption.textContent = text.replace(/^[▶↻]\s*/, '');
        byId('playBtn').dataset.replay = String(text.includes('Replay'));
        byId('playBtn').setAttribute('aria-label', text.replace(/^[▶↻]\s*/, ''));
    }
    new MutationObserver(playbackCaption).observe(byId('playBtn'), { childList: true, characterData: true, subtree: true }); playbackCaption();
    const hint = document.createElement('p'); hint.className = 'listen-hint'; hint.textContent = 'Listen, then choose the distance you hear.'; listen.append(hint);
    exercise.append(exerciseHeader, listen, byId('options'), byId('feedback'), byId('details'));
    const settings = document.createElement('details'); settings.id = 'soundSettings'; settings.className = 'sound-settings';
    settings.innerHTML = '<summary>Sound & intervals<span id="settingsSummary"></span></summary>';
    settings.append(byId('customSelectionContainer'), document.querySelector('.controls-group'), document.querySelector('.toggle-container'));
    settings.querySelector('.training-mode').remove();
    byId('rootSelect').setAttribute('aria-label', 'Root note'); byId('octaveSelect').setAttribute('aria-label', 'Octave register');
    byId('randomDirectionSelect').setAttribute('aria-label', 'Random playback direction');
    const piano = document.createElement('details'); piano.className = 'keyboard-panel'; piano.id = 'keyboardPanel';
    piano.innerHTML = '<summary>Explore the piano keyboard</summary>'; piano.append(document.querySelector('.piano-container'));
    main.append(exercise, settings, piano);
    const reference = document.querySelector('.reference-panel'); reference.querySelector('h2').textContent = 'Listen & compare';
    reference.querySelector('p').textContent = 'Reference sounds, independent of your current question.';
    const modes = document.createElement('div'); modes.className = 'reference-tabs';
    modes.innerHTML = '<button type="button" data-reference="fixed" aria-pressed="true">Fixed C4</button><button type="button" data-reference="variable" aria-pressed="false">Variable</button>';
    reference.insertBefore(modes, byId('referenceGrid'));
    const variableControls = document.querySelector('.reference-random-controls'); variableControls.id = 'variableReferenceControls'; variableControls.hidden = true;
    reference.insertBefore(variableControls, byId('referenceGrid'));
    document.querySelectorAll('.reference-column-header').forEach(el => el.remove());
    const more = document.createElement('details'); more.id = 'moreReferences'; more.innerHTML = '<summary>All other intervals</summary><div id="otherReferenceGrid"></div>'; reference.append(more);
    let referenceMode = 'fixed';
    function refreshReferences() {
        const pool = Array.from(byId('customCheckboxes').querySelectorAll('input:checked'), input => Number(input.value));
        exerciseHeader.querySelector('#poolCount').textContent = `${pool.length} intervals`;
        // Buttons keep their listeners and last-played note labels when moved.
        [...document.querySelectorAll('.reference-btn')].sort((a, b) => Number(a.dataset.semitone) - Number(b.dataset.semitone)).forEach(button => {
            button.hidden = button.dataset.reference !== referenceMode;
            (pool.includes(Number(button.dataset.semitone)) ? byId('referenceGrid') : more.querySelector('#otherReferenceGrid')).append(button);
        });
    }
    modes.querySelectorAll('button').forEach(button => button.addEventListener('click', () => {
        referenceMode = button.dataset.reference; modes.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
        variableControls.hidden = referenceMode !== 'variable'; refreshReferences();
    }));
    document.addEventListener('custom-pool-updated', refreshReferences); refreshReferences();
    practice.append(main, reference);
    const progress = document.querySelector('.stats-bar'); progress.id = 'progressView'; progress.hidden = true;
    const backup = document.createElement('details'); backup.id = 'backupPanel'; backup.innerHTML = '<summary>Your data & backups</summary><p class="stats-note">History stays in this browser. Export a separate copy to keep it safe or move to another device.</p>';
    backup.append(document.querySelector('.stats-actions'), byId('storageStatus')); progress.append(backup);
    const footer = document.createElement('footer'); footer.className = 'app-footer';
    footer.innerHTML = '<span id="saveState" role="status">Opening local history…</span><span>Piano: Salamander · <a href="https://github.com/Tonejs/audio/tree/master/salamander" target="_blank" rel="noreferrer">Alexander Holm</a> · CC BY 3.0</span>';
    container.replaceChildren(header, intro, practice, progress, footer);
    function saveStatus() {
        const message = byId('storageStatus').textContent;
        const failure = /unavailable|could not|only in this tab|failed/i.test(message);
        const label = failure ? message : /Opening/.test(message) ? 'Opening local history…' : 'Saved in this browser. No account needed.';
        if (byId('saveState').textContent !== label) byId('saveState').textContent = label;
        byId('saveState').classList.toggle('incorrect-text', failure);
    }
    new MutationObserver(saveStatus).observe(byId('storageStatus'), { childList: true, characterData: true, subtree: true });
    saveStatus();
    function navigate(view) {
        const showProgress = view === 'progress'; practice.hidden = showProgress; progress.hidden = !showProgress;
        byId('practiceTab').setAttribute('aria-pressed', String(!showProgress)); byId('progressTab').setAttribute('aria-pressed', String(showProgress));
        byId('pageTitle').textContent = showProgress ? 'Notice what’s changing.' : 'Find the space between.';
        byId('statisticsPanel').open = showProgress;
    }
    byId('practiceTab').onclick = () => navigate('practice'); byId('progressTab').onclick = () => navigate('progress');
    header.querySelector('.brand').onclick = event => { event.preventDefault(); navigate('practice'); };
    const theme = byId('themeToggle');
    function applyTheme(dark) { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; theme.textContent = dark ? 'Light mode' : 'Dark mode'; theme.setAttribute('aria-pressed', String(dark)); }
    let dark = false; try { dark = localStorage.getItem('interval-trainer-theme') === 'dark'; } catch {}
    applyTheme(dark);
    theme.onclick = () => { dark = !dark; applyTheme(dark); try { localStorage.setItem('interval-trainer-theme', dark ? 'dark' : 'light'); } catch {} };
    function updateSummary() { byId('settingsSummary').textContent = byId('sliderLabel').textContent.replace('Playback: ', '') + ' · ' + byId('noteDurationSlider').value + ' s notes'; }
    settings.addEventListener('input', updateSummary); settings.addEventListener('change', updateSummary); updateSummary();
})();
