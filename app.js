
    // --- Audio Setup using Tone.js (Real Piano Samples) ---
    const playBtn = document.getElementById('playBtn');
    let isToneLoaded = false;

    const sampler = new Tone.Sampler({
        urls: {
            "C2": "C2.mp3",
            "D#2": "Ds2.mp3",
            "F#2": "Fs2.mp3",
            "A2": "A2.mp3",
            "C3": "C3.mp3",
            "D#3": "Ds3.mp3",
            "F#3": "Fs3.mp3",
            "A3": "A3.mp3",
            "C4": "C4.mp3",
            "D#4": "Ds4.mp3",
            "F#4": "Fs4.mp3",
            "A4": "A4.mp3",
            "C5": "C5.mp3",
            "D#5": "Ds5.mp3",
            "F#5": "Fs5.mp3",
            "A5": "A5.mp3",
            "C6": "C6.mp3",
        },
        release: 1,
        baseUrl: "https://tonejs.github.io/audio/salamander/"
    }).toDestination();

    Tone.loaded().then(() => {
        isToneLoaded = true;
        if (customPool.length >= 2) {
            playBtn.disabled = false;
            playBtn.textContent = currentInterval ? "↻ Replay Current Interval" : "▶ Play New Interval";
        }
    }).catch(() => {
        playBtn.textContent = "Piano sounds could not load. Check your connection and reload.";
    });

    // --- PLAYBACK TIMING / RANDOMIZATION LOGIC ---
    const playbackSlider = document.getElementById('playbackSlider');
    const sliderLabel = document.getElementById('sliderLabel');
    const randomPlaybackToggle = document.getElementById('randomPlaybackToggle');
    const randomDirectionSelect = document.getElementById('randomDirectionSelect');
    const maxGapInput = document.getElementById('maxGapInput');
    const noteDurationSlider = document.getElementById('noteDurationSlider');
    const noteDurationLabel = document.getElementById('noteDurationLabel');

    function getNoteDuration() {
        const value = Number(noteDurationSlider.value);
        return Number.isFinite(value) ? Math.min(10, Math.max(0.5, value)) : 2.5;
    }

    function getMaxGap() {
        const parsed = parseFloat(maxGapInput.value);
        if (!Number.isFinite(parsed)) return 1.5;
        return Math.min(15, Math.max(0, parsed));
    }

    function updatePlaybackLabel() {
        const maxGap = getMaxGap();

        if (randomPlaybackToggle.checked) {
            const directionText = {
                both: "Both Directions",
                descending: "Descending Only",
                ascending: "Ascending Only"
            }[randomDirectionSelect.value];

            sliderLabel.textContent = `Playback: Random ${directionText} (0.00–${maxGap.toFixed(2)}s gap)`;
            return;
        }

        const val = parseFloat(playbackSlider.value);
        if (val === 0) {
            sliderLabel.textContent = "Playback: Harmonic (0.00s gap)";
        } else if (val < 0) {
            sliderLabel.textContent = `Playback: Descending (${Math.abs(val).toFixed(2)}s gap)`;
        } else {
            sliderLabel.textContent = `Playback: Ascending (${val.toFixed(2)}s gap)`;
        }
    }

    function updatePlaybackControls() {
        const maxGap = getMaxGap();
        maxGapInput.value = maxGap.toFixed(2);

        playbackSlider.min = -maxGap;
        playbackSlider.max = maxGap;

        const currentValue = parseFloat(playbackSlider.value) || 0;
        playbackSlider.value = Math.min(maxGap, Math.max(-maxGap, currentValue));

        playbackSlider.disabled = randomPlaybackToggle.checked;
        randomDirectionSelect.disabled = !randomPlaybackToggle.checked;
        updatePlaybackLabel();
    }

    function generatePlaybackGap() {
        if (!randomPlaybackToggle.checked) {
            return parseFloat(playbackSlider.value) || 0;
        }

        const maxGap = getMaxGap();
        if (maxGap === 0) return 0;

        const magnitude = Math.random() * maxGap;

        if (randomDirectionSelect.value === 'descending') return -magnitude;
        if (randomDirectionSelect.value === 'ascending') return magnitude;
        return Math.random() < 0.5 ? -magnitude : magnitude;
    }

    function triggerPlayback(rootNote, secondNote, playbackGap) {
        const now = Tone.now();
        const duration = getNoteDuration();

        if (Math.abs(playbackGap) < 0.000001) {
            if (rootNote === secondNote) {
                sampler.triggerAttackRelease(rootNote, duration, now);
            } else {
                sampler.triggerAttackRelease([rootNote, secondNote], duration, now);
            }
        } else if (playbackGap > 0) {
            sampler.triggerAttackRelease(rootNote, duration, now);
            sampler.triggerAttackRelease(secondNote, duration, now + playbackGap);
        } else {
            const delay = Math.abs(playbackGap);
            sampler.triggerAttackRelease(secondNote, duration, now);
            sampler.triggerAttackRelease(rootNote, duration, now + delay);
        }
    }

    // --- Piano UI Generation ---
    const pianoDiv = document.getElementById('piano');
    const notesArr = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const totalOctaves = 3; 
    const startOctave = 3;
    const totalWhiteKeys = (totalOctaves * 7) + 1; 
    let whiteKeyCount = 0;

    async function playInteractiveNote(note, keyElement) {
        if (!isToneLoaded) return;
        if (Tone.context.state !== 'running') await Tone.start();
        sampler.triggerAttack(note);
        keyElement.classList.add('active');
    }

    function releaseInteractiveNote(note, keyElement) {
        sampler.triggerRelease(note);
        keyElement.classList.remove('active');
    }

    for (let oct = startOctave; oct < startOctave + totalOctaves; oct++) {
        for (let i = 0; i < notesArr.length; i++) {
            const noteName = notesArr[i] + oct;
            const isBlack = notesArr[i].includes('#');
            
            const key = document.createElement('div');
            key.className = 'key ' + (isBlack ? 'black' : 'white');
            if (notesArr[i] === 'C') key.textContent = noteName;

            key.addEventListener('mousedown', () => playInteractiveNote(noteName, key));
            key.addEventListener('mouseup', () => releaseInteractiveNote(noteName, key));
            key.addEventListener('mouseleave', () => releaseInteractiveNote(noteName, key));
            key.addEventListener('touchstart', (e) => { e.preventDefault(); playInteractiveNote(noteName, key); });
            key.addEventListener('touchend', (e) => { e.preventDefault(); releaseInteractiveNote(noteName, key); });

            if (!isBlack) {
                pianoDiv.appendChild(key);
                whiteKeyCount++;
            } else {
                key.style.left = `calc(${whiteKeyCount * (100 / totalWhiteKeys)}% - 1.4%)`;
                pianoDiv.appendChild(key);
            }
        }
    }

    const finalKey = document.createElement('div');
    finalKey.className = 'key white';
    finalKey.textContent = 'C6';
    finalKey.addEventListener('mousedown', () => playInteractiveNote('C6', finalKey));
    finalKey.addEventListener('mouseup', () => releaseInteractiveNote('C6', finalKey));
    finalKey.addEventListener('mouseleave', () => releaseInteractiveNote('C6', finalKey));
    finalKey.addEventListener('touchstart', (e) => { e.preventDefault(); playInteractiveNote('C6', finalKey); });
    finalKey.addEventListener('touchend', (e) => { e.preventDefault(); releaseInteractiveNote('C6', finalKey); });
    pianoDiv.appendChild(finalKey);

    // --- Interval Logic ---
    const intervals = {
        0: { name: "Perfect Unison", main: "Perfect Consonance", flow: "Stable -> Narrow / Same" },
        1: { name: "Minor 2nd", main: "Dissonance", flow: "Narrow (Second) -> Sharp" },
        2: { name: "Major 2nd", main: "Dissonance", flow: "Narrow (Second) -> Blunt" },
        3: { name: "Minor 3rd", main: "Imperfect Consonance", flow: "Minor (Dark) -> Narrow" },
        4: { name: "Major 3rd", main: "Imperfect Consonance", flow: "Major (Bright) -> Narrow" },
        5: { name: "Perfect 4th", main: "Perfect Consonance", flow: "Unstable" },
        6: { name: "Tritone", main: "Dissonance", flow: "Tritone (Middle)" },
        7: { name: "Perfect 5th", main: "Perfect Consonance", flow: "Stable -> Distinct" },
        8: { name: "Minor 6th", main: "Imperfect Consonance", flow: "Minor (Dark) -> Wide" },
        9: { name: "Major 6th", main: "Imperfect Consonance", flow: "Major (Bright) -> Wide" },
        10: { name: "Minor 7th", main: "Dissonance", flow: "Wide (Seventh) -> Blunt" },
        11: { name: "Major 7th", main: "Dissonance", flow: "Wide (Seventh) -> Sharp" },
        12: { name: "Perfect Octave", main: "Perfect Consonance", flow: "Stable -> Wide / Same" }
    };


    // --- INTERVAL REFERENCE PANEL ---
    const referenceGrid = document.getElementById('referenceGrid');
    const referenceRandomRoot = document.getElementById('referenceRandomRoot');
    const referenceRandomOctave = document.getElementById('referenceRandomOctave');
    const referenceIntervals = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

    function getReferenceRootMidi(variableReference) {
        if (!variableReference) return 60; // C4

        const pitchClass = referenceRandomRoot.checked ? Math.floor(Math.random() * 12) : 0;
        const octave = referenceRandomOctave.checked ? Math.floor(Math.random() * 3) + 2 : 4;
        return (octave + 1) * 12 + pitchClass;
    }

    function makeReferenceButton(semitone, variableReference) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'reference-btn';
        btn.dataset.semitone = semitone;
        btn.dataset.reference = variableReference ? 'variable' : 'fixed';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'reference-btn-name';
        nameSpan.textContent = intervals[semitone].name;

        const notesSpan = document.createElement('span');
        notesSpan.className = 'reference-btn-notes';

        const fixedRootMidi = 60;
        const fixedSecondMidi = fixedRootMidi + semitone;
        notesSpan.textContent = variableReference
            ? 'Click to hear'
            : `${Tone.Frequency(fixedRootMidi, "midi").toNote()} → ${Tone.Frequency(fixedSecondMidi, "midi").toNote()}`;

        btn.appendChild(nameSpan);
        btn.appendChild(notesSpan);

        btn.addEventListener('click', async () => {
            if (!isToneLoaded) return;
            if (Tone.context.state !== 'running') {
                await Tone.start();
            }

            const rootMidi = getReferenceRootMidi(variableReference);
            const secondMidi = rootMidi + semitone;
            const rootNote = Tone.Frequency(rootMidi, 'midi').toNote();
            const secondNote = Tone.Frequency(secondMidi, 'midi').toNote();
            const referenceGap = generatePlaybackGap();

            notesSpan.textContent = `${rootNote} → ${secondNote}`;
            triggerPlayback(rootNote, secondNote, referenceGap);
        });

        return btn;
    }

    function buildIntervalReference() {
        referenceIntervals.forEach((semitone) => {
            referenceGrid.appendChild(makeReferenceButton(semitone, false));
            referenceGrid.appendChild(makeReferenceButton(semitone, true));
        });
    }

    const allOptions = [
                { text: "Perfect Unison", desc: "Pure & Stable: Literally the same pitch." },
                { text: "Minor 2nd", desc: "Narrow Dissonance: Incisive stab, sharp edge." },
                { text: "Major 2nd", desc: "Narrow Dissonance: Blunt feel, cheerful clang." },
                { text: "Minor 3rd", desc: "Dark/Somber: Notes are very close together." },
                { text: "Major 3rd", desc: "Bright/Happy: Notes are very close together." },
                { text: "Perfect 4th", desc: "Pure but Unstable: Teetering, wants to resolve inward." },
                { text: "Tritone", desc: "Dissonance: Cuts precisely down the middle of the octave." },
                { text: "Perfect 5th", desc: "Pure & Stable: Stronger, more substantial, slightly less hollow." },
                { text: "Minor 6th", desc: "Dark/Somber: Wide (melodic jaunt to top note)." },
                { text: "Major 6th", desc: "Bright/Happy: Wide (melodic jaunt to top note)." },
                { text: "Minor 7th", desc: "Wide Dissonance: Blunt, authoritative push, not sharp." },
                { text: "Major 7th", desc: "Wide Dissonance: Piercing sting, sharp edge." },
                { text: "Perfect Octave", desc: "Pure & Stable: Unmistakable sameness, geometrically one." }
            ];
    let customPool = [];
    const intervalSelector = new IntervalSelector(() => Math.random());
    let currentInterval = null;
    let currentRootNote = null;
    let currentSecondNote = null;
    let currentPlaybackGap = null;

    const optionsDiv = document.getElementById('options');
    const feedbackDiv = document.getElementById('feedback');
    const detailsDiv = document.getElementById('details');
    const rootSelect = document.getElementById('rootSelect');
    const octaveSelect = document.getElementById('octaveSelect');
    const helpToggle = document.getElementById('helpToggle');
    const customCheckboxesDiv = document.getElementById('customCheckboxes');
    let queuedPair = null;
    const pairDrillStatus = document.getElementById('pairDrillStatus');
    const cancelPairDrill = document.getElementById('cancelPairDrill');

    function cancelQueuedPair() {
        queuedPair = null;
        cancelPairDrill.hidden = true;
        pairDrillStatus.textContent = '';
    }
    function applyPair(pair) {
        customCheckboxesDiv.querySelectorAll('input').forEach(cb => { cb.checked = pair.includes(Number(cb.value)); });
        updateCustomMode();
        buildOptions();
        if (isToneLoaded) {
            playBtn.disabled = false;
            playBtn.textContent = '▶ Play New Interval';
        }
        queuedPair = null;
        cancelPairDrill.hidden = true;
        pairDrillStatus.textContent = `Pair selected: ${pair.map(n => intervals[n].name).join(' + ')}. Play a new interval when ready.`;
    }
    document.addEventListener('request-pair-drill', event => {
        const pair = event.detail;
        if (!Array.isArray(pair) || pair.length !== 2 || pair[0] === pair[1] || !pair.every(n => Number.isInteger(n) && n >= 0 && n <= 12)) return;
        if (currentInterval === null) applyPair(pair);
        else {
            queuedPair = [...pair];
            cancelPairDrill.hidden = false;
            pairDrillStatus.textContent = `Queued: ${pair.map(n => intervals[n].name).join(' + ')}. Your current question stays unchanged; the pair starts with your next new question.`;
        }
    });
    cancelPairDrill.addEventListener('click', cancelQueuedPair);

    function invalidateCurrentQuestion() {
        trainingStats.abandon();
        currentInterval = null;
        currentRootNote = null;
        currentSecondNote = null;
        currentPlaybackGap = null;
        feedbackDiv.textContent = '';
        feedbackDiv.className = '';
        detailsDiv.textContent = '';

        if (customPool.length < 2) {
            playBtn.disabled = true;
            playBtn.textContent = "Select at least 2 intervals";
        } else if (isToneLoaded) {
            playBtn.disabled = false;
            playBtn.textContent = "▶ Play New Interval";
        }
    }

    // --- SETUP CUSTOM CHECKBOXES ---
    Object.keys(intervals).map(Number).forEach((semitone) => {
        const label = document.createElement('label');
        label.className = 'custom-cb-label';
        
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = semitone;
        // Default select a tricky pair (m6 and m7)
        if(semitone === 8 || semitone === 10) cb.checked = true;
        
        cb.addEventListener('change', () => {
            cancelQueuedPair();
            updateCustomMode();
            invalidateCurrentQuestion();
            buildOptions();
        });

        label.appendChild(cb);
        label.appendChild(document.createTextNode(' ' + intervals[semitone].name));
        customCheckboxesDiv.appendChild(label);
    });

    function updateCustomMode() {
        customPool = Array.from(customCheckboxesDiv.querySelectorAll('input:checked'), cb => Number(cb.value));
        document.dispatchEvent(new Event('custom-pool-updated'));
    }

    helpToggle.addEventListener('change', (e) => {
        if(e.target.checked) {
            optionsDiv.classList.add('show-help');
        } else {
            optionsDiv.classList.remove('show-help');
        }
    });

    function buildOptions() {
        optionsDiv.innerHTML = '';
        customPool.map(semitone => allOptions[semitone]).forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'option-btn';
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'btn-title';
            titleSpan.textContent = opt.text;
            
            const descSpan = document.createElement('span');
            descSpan.className = 'desc-text';
            descSpan.textContent = opt.desc;
            
            btn.appendChild(titleSpan);
            btn.appendChild(descSpan);

            btn.onclick = () => checkAnswer(allOptions.indexOf(opt));
            optionsDiv.appendChild(btn);
        });
        
        feedbackDiv.textContent = '';
        detailsDiv.textContent = '';
    }

    function playRandomInterval() {
        if (queuedPair) applyPair(queuedPair);
        if (customPool.length < 2) return;

        feedbackDiv.textContent = '';
        detailsDiv.textContent = '';

        currentInterval = intervalSelector.next(customPool);

        const isFixedRoot = (rootSelect.value === 'fixed-c');
        const isLockedOctave = (octaveSelect.value === 'locked');

        const baseNoteOffset = isFixedRoot ? 0 : Math.floor(Math.random() * 12);
        const octave = isLockedOctave ? 4 : Math.floor(Math.random() * 3) + 2; 

        const rootMidi = (octave + 1) * 12 + baseNoteOffset;
        const secondMidi = rootMidi + currentInterval;

        currentRootNote = Tone.Frequency(rootMidi, "midi").toNote();
        currentSecondNote = Tone.Frequency(secondMidi, "midi").toNote();
        currentPlaybackGap = generatePlaybackGap();

        trainingStats.begin({
            actualSemitones: currentInterval,
            rootMidi, secondMidi,
            rootNote: currentRootNote, secondNote: currentSecondNote,
            playbackGap: currentPlaybackGap,
            randomRoot: !isFixedRoot, randomOctave: !isLockedOctave,
            randomTiming: randomPlaybackToggle.checked,
            randomDirection: randomDirectionSelect.value,
            maxGap: getMaxGap(), customPool: [...customPool],
            noteDurationSeconds: getNoteDuration(), audioSampleSet: 'salamander-17-v1'
        });
        triggerPlayback(currentRootNote, currentSecondNote, currentPlaybackGap);
        
        playBtn.textContent = "↻ Replay Current Interval";
    }

    function checkAnswer(answeredSemitones) {
        if (currentInterval === null) return;

        const correct = answeredSemitones === currentInterval;
        trainingStats.answer(answeredSemitones);
        const data = intervals[currentInterval];

        if (correct) {
            feedbackDiv.textContent = "Correct!";
            feedbackDiv.className = "correct-text";
        } else {
            feedbackDiv.textContent = "Incorrect.";
            feedbackDiv.className = "incorrect-text";
        }

        detailsDiv.innerHTML = `You heard a <strong>${data.name}</strong> (${currentInterval} semitones).<br>
                                Category: ${data.main}<br>
                                Path: ${data.flow}`;
                                
        currentInterval = null;
        currentRootNote = null;
        currentSecondNote = null;
        currentPlaybackGap = null;
        playBtn.textContent = "▶ Play New Interval";
    }

    rootSelect.addEventListener('change', invalidateCurrentQuestion);
    octaveSelect.addEventListener('change', invalidateCurrentQuestion);

    playbackSlider.addEventListener('input', () => {
        updatePlaybackLabel();
        invalidateCurrentQuestion();
    });

    randomPlaybackToggle.addEventListener('change', () => {
        updatePlaybackControls();
        invalidateCurrentQuestion();
    });

    randomDirectionSelect.addEventListener('change', () => {
        updatePlaybackLabel();
        invalidateCurrentQuestion();
    });

    maxGapInput.addEventListener('change', () => {
        updatePlaybackControls();
        invalidateCurrentQuestion();
    });
    noteDurationSlider.addEventListener('input', () => {
        noteDurationLabel.textContent = `Note duration: ${getNoteDuration().toFixed(1)} s`;
        invalidateCurrentQuestion();
    });

    playBtn.addEventListener('click', async () => {
        if (Tone.context.state !== 'running') {
            await Tone.start();
        }

        if(currentInterval === null) {
            playRandomInterval();
        } else {
            trainingStats.replay();
            triggerPlayback(currentRootNote, currentSecondNote, currentPlaybackGap);
        }
    });

    // Initialize custom mode data and build initial UI
    updateCustomMode();
    updatePlaybackControls();
    buildOptions();
    buildIntervalReference();

