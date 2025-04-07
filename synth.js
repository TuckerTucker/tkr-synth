// --- Global Variables ---
let audioContext = null;
let masterGain = null;
let currentOscillator = null;
let currentFilter = null;
let currentVCA = null;
let activeNote = null; // Track the currently playing note (name like 'C4')
let activeMIDINote = null; // Track the MIDI note number (e.g., 60) currently playing
let midiAccess = null; // Store MIDI access object
let midiInput = null; // Store the selected MIDI Input
let analyser = null; // Analyser node for oscilloscope
let scopeCanvas = null; // Canvas element
let scopeCtx = null; // Canvas 2D context
let scopeDataArray = null; // Array for waveform data
let scopeAnimationId = null; // To control the animation loop
let lfo = null; // LFO oscillator node
let lfoDepth = null; // Gain node controlling LFO amount
let tremoloGain = null; // Extra gain node for amplitude modulation

// --- UI Elements ---
const startButton = document.getElementById('start-audio-button');
const enableMidiButton = document.getElementById('enable-midi-button'); // New button
const midiStatusDiv = document.getElementById('midi-status'); // New status div
const synthElement = document.getElementById('synthesizer');
const masterVolumeSlider = document.getElementById('master-volume');
const oscWaveformSelect = document.getElementById('osc-waveform');
const filterCutoffSlider = document.getElementById('filter-cutoff');
const filterResonanceSlider = document.getElementById('filter-resonance');
const keyboardElement = document.getElementById('keyboard');
const keys = document.querySelectorAll('.key');
scopeCanvas = document.getElementById('oscilloscope'); // Get canvas element
// LFO UI Elements
const lfoRateSlider = document.getElementById('lfo-rate');
const lfoDepthSlider = document.getElementById('lfo-depth');
const lfoWaveformSelect = document.getElementById('lfo-waveform');
const lfoTargetSelect = document.getElementById('lfo-target');


// --- Note Frequencies (Hz) - Expanded for C3-C5 ---
const noteFrequencies = {
    'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81,
    'F3': 174.61, 'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00,
    'A#3': 233.08, 'B3': 246.94,
    'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63,
    'F4': 349.23, 'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00,
    'A#4': 466.16, 'B4': 493.88,
    'C5': 523.25
};

// --- Keyboard Mapping ---
const keyNoteMap = {
    'a': 'C4', 'w': 'C#4', 's': 'D4', 'e': 'D#4', 'd': 'E4',
    'f': 'F4', 't': 'F#4', 'g': 'G4', 'y': 'G#4', 'h': 'A4',
    'u': 'A#4', 'j': 'B4', 'k': 'C5'
}; // Assuming this was the previous mapping

// --- MIDI Note to Frequency Conversion ---
function midiNoteToFrequency(note) {
    // A4 (MIDI note 69) is 440 Hz
    return 440 * Math.pow(2, (note - 69) / 12);
}

// --- Map Range Helper ---
function mapRange(value, inMin, inMax, outMin, outMax) {
  // Clamp value to input range
  value = Math.max(inMin, Math.min(value, inMax));
  return ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}

// --- Audio Initialization ---
function setupAudioContext() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioContext.createGain();
            masterGain.gain.setValueAtTime(parseFloat(masterVolumeSlider.value), audioContext.currentTime);

            // Setup Analyser
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 2048; // Standard FFT size
            scopeDataArray = new Uint8Array(analyser.frequencyBinCount); // For time domain data

            // Setup LFO
            lfo = audioContext.createOscillator();
            lfoDepth = audioContext.createGain();
            lfo.type = lfoWaveformSelect.value;
            lfo.frequency.setValueAtTime(parseFloat(lfoRateSlider.value), audioContext.currentTime);
            lfoDepth.gain.setValueAtTime(0, audioContext.currentTime); // Start with 0 depth
            lfo.connect(lfoDepth); // LFO osc -> LFO depth control
            lfo.start(); // Start LFO oscillator

            // Setup Tremolo Gain Node (inserted before analyser)
            tremoloGain = audioContext.createGain();
            tremoloGain.gain.setValueAtTime(1.0, audioContext.currentTime); // Default to pass-through

            // Connect analyser and main signal path including tremolo
            // VCA -> tremoloGain -> analyser -> masterGain -> destination
            tremoloGain.connect(analyser);
            analyser.connect(masterGain);
            masterGain.connect(audioContext.destination);

            console.log("AudioContext, Analyser, and LFO created successfully.");

            // Get canvas context
            if (scopeCanvas) {
                scopeCtx = scopeCanvas.getContext('2d');
            } else {
                console.error("Oscilloscope canvas not found!");
            }

            synthElement.classList.remove('disabled-ui'); // Remove disabled state instead of hidden
            startButton.style.display = 'none';
            enableMidiButton.classList.remove('hidden'); // Show MIDI button
            midiStatusDiv.classList.remove('hidden'); // Show MIDI status

            // Start oscilloscope drawing loop
            drawOscilloscope();

            // Attempt to initialize MIDI automatically now that we have user gesture
            initMIDI();

        } catch (e) {
            console.error("Error creating AudioContext:", e);
            alert("Web Audio API is not supported in this browser or could not start.");
        }
    }
}

// --- MIDI Initialization ---
function initMIDI() {
    if (navigator.requestMIDIAccess) {
        navigator.requestMIDIAccess()
            .then(onMIDISuccess, onMIDIFailure);
    } else {
        midiStatusDiv.textContent = 'Web MIDI API not supported.';
        console.warn('WebMIDI is not supported in this browser.');
    }
}

function onMIDISuccess(mAccess) {
    midiAccess = mAccess; // Store access object
    console.log('MIDI Access Granted:', midiAccess);

    const inputs = midiAccess.inputs.values();
    let firstInput = inputs.next().value; // Get the first available input

    if (firstInput) {
        midiInput = firstInput;
        midiInput.onmidimessage = handleMIDIMessage; // Attach message handler
        midiStatusDiv.textContent = `MIDI Connected: ${midiInput.name}`;
        console.log(`Connected to MIDI input: ${midiInput.name} (${midiInput.manufacturer})`);
        enableMidiButton.disabled = true; // Disable button after successful connection
        enableMidiButton.textContent = "MIDI Enabled";
    } else {
        midiStatusDiv.textContent = 'No MIDI input devices found.';
        console.warn('No MIDI input devices found.');
    }

    // Optional: Listen for connection changes
    midiAccess.onstatechange = (event) => {
        console.log('MIDI state change:', event.port.name, event.port.state);
        // Simple reconnect logic: If our chosen input disconnects, try finding another one.
        if (midiInput && event.port.id === midiInput.id && event.port.state === 'disconnected') {
             midiStatusDiv.textContent = 'MIDI Disconnected';
             midiInput.onmidimessage = null; // Remove old handler
             midiInput = null;
             enableMidiButton.disabled = false;
             enableMidiButton.textContent = "Enable MIDI Input";
             // Optionally try to auto-reconnect or prompt user
        } else if (!midiInput && event.port.type === 'input' && event.port.state === 'connected') {
             // A new device connected, maybe prompt user? For now, just log.
             console.log(`New MIDI input available: ${event.port.name}`);
             enableMidiButton.disabled = false; // Allow enabling again
        }
        // More robust handling could involve updating a device list
    };
}

function onMIDIFailure(msg) {
    console.error(`Failed to get MIDI access - ${msg}`);
    midiStatusDiv.textContent = 'MIDI Access Failed.';
}

// --- MIDI Message Handler ---
function handleMIDIMessage(event) {
    const data = event.data; // Uint8Array [status, data1, data2]
    const command = data[0] >> 4; // Isolate command nybble (ignore channel)
    const channel = data[0] & 0xf; // Isolate channel nybble
    const note = data[1];
    const velocity = data.length > 2 ? data[2] : 0; // Velocity or CC value

    // --- Log MIDI messages (optional for debugging) ---
    // console.log(`MIDI Ch${channel+1}: Cmd=${command.toString(16)}, Data1=${note}, Data2=${velocity}`);

    switch (command) {
        case 9: // Note On
            if (velocity > 0) {
                midiNoteOn(note, velocity);
            } else {
                // Note On with velocity 0 is often treated as Note Off
                midiNoteOff(note);
            }
            break;
        case 8: // Note Off
            midiNoteOff(note);
            break;
        case 11: // Control Change (CC)
            handleMIDIControlChange(note, velocity); // note = controller number, velocity = value
            break;
        // --- Other commands (Pitch Bend, etc.) could be added here ---
        // case 14: // Pitch Bend
        //     handleMIDIPitchBend(data[1], data[2]); // LSB, MSB
        //     break;
    }
}

// --- Handle MIDI Note On/Off ---
function midiNoteOn(noteNumber, velocity) {
    if (!audioContext) return; // Need audio context
    const frequency = midiNoteToFrequency(noteNumber);
    const gain = mapRange(velocity, 0, 127, 0, 1.0); // Map velocity to gain (0.0 to 1.0)

    // --- Monophonic: Stop previous note ---
    noteOff(); // Stop any currently playing note first

    activeMIDINote = noteNumber; // Track the MIDI note number
    activeNote = findNoteNameFromMidi(noteNumber); // Find corresponding note name for visual feedback

    const now = audioContext.currentTime;

    // Create and configure nodes (similar to noteOn)
    currentOscillator = audioContext.createOscillator();
    currentFilter = audioContext.createBiquadFilter();
    currentVCA = audioContext.createGain();

    currentOscillator.type = oscWaveformSelect.value;
    currentOscillator.frequency.setValueAtTime(frequency, now);

    currentFilter.type = "lowpass";
    currentFilter.frequency.setValueAtTime(parseFloat(filterCutoffSlider.value), now);
    currentFilter.Q.setValueAtTime(parseFloat(filterResonanceSlider.value), now);

    // Use velocity for initial gain
    currentVCA.gain.setValueAtTime(0, now); // Start silent
    currentVCA.gain.linearRampToValueAtTime(gain, now + 0.01); // Ramp up to velocity-based gain

    // Connect main signal path: Osc -> Filter -> VCA -> tremoloGain (-> analyser is already connected)
    currentOscillator.connect(currentFilter);
    currentFilter.connect(currentVCA);
    currentVCA.connect(tremoloGain); // VCA connects to the tremolo gain node

    // --- LFO Connection Logic ---
    const lfoTarget = lfoTargetSelect.value;
    const lfoDepthValue = parseFloat(lfoDepthSlider.value);

    // Disconnect LFO from any previous target (important!)
    try { lfoDepth.disconnect(); } catch (e) { /* ignore if not connected */ }

    if (lfoTarget !== 'none' && lfoDepthValue > 0) {
        switch (lfoTarget) {
            case 'pitch':
                // Scale depth: 0=0 cents, 1= +/- 1200 cents (1 octave) - adjust scale as needed
                const detuneAmount = lfoDepthValue * 1200;
                lfoDepth.gain.setValueAtTime(detuneAmount, now);
                lfoDepth.connect(currentOscillator.detune);
                console.log(`LFO targeting Pitch, Depth: ${detuneAmount.toFixed(0)} cents`);
                break;
            case 'filter':
                // Scale depth: 0=0 Hz, 1= +/- 5000 Hz (example) - adjust scale as needed
                const filterModAmount = lfoDepthValue * 5000;
                lfoDepth.gain.setValueAtTime(filterModAmount, now);
                lfoDepth.connect(currentFilter.frequency);
                 console.log(`LFO targeting Filter Cutoff, Depth: +/- ${filterModAmount.toFixed(0)} Hz`);
                break;
            case 'amplitude':
                // Scale depth: 0=gain 1, 1=gain oscillates 0 to 1.
                // We connect LFO depth (scaled 0 to 0.5) to the *offset* of the tremolo gain param.
                // Set the base gain to 0.5. LFO modulates it +/- 0.5.
                // This requires AudioParam manipulation. A simpler way for basic tremolo:
                // Map depth slider 0->1 to LFO gain 0->1. Connect LFO to tremoloGain.gain.
                // This modulates gain between 0 and 1 (full tremolo at max depth).
                // Let's use the simpler way first.
                lfoDepth.gain.setValueAtTime(lfoDepthValue, now); // LFO gain = depth slider
                lfoDepth.connect(tremoloGain.gain); // Modulates the gain directly (0 to 1 range)
                // To prevent silence at max depth when LFO hits 0, we might need a more complex setup
                // involving summing signals or using WaveShaperNode, but let's keep it simple.
                console.log(`LFO targeting Amplitude, Depth: ${lfoDepthValue.toFixed(2)}`);
                break;
        }
    } else {
         // Ensure LFO depth gain is 0 if target is 'none' or depth is 0
         lfoDepth.gain.setValueAtTime(0, now);
         // Ensure tremolo gain is reset to 1 if LFO is not targeting amplitude
         if (lfoTarget !== 'amplitude') {
            tremoloGain.gain.setValueAtTime(1.0, now);
         }
    }
    // --- End LFO Connection Logic ---


    currentOscillator.start(now);

    // Visual feedback
    updateKeyVisual(activeNote, true); // Use the note name if found

    console.log(`MIDI Note On: ${noteNumber} (Freq: ${frequency.toFixed(2)} Hz, Vel: ${velocity}, Gain: ${gain.toFixed(2)})`);
}

function midiNoteOff(noteNumber) {
    if (!audioContext || !currentOscillator || noteNumber !== activeMIDINote) {
        // Only stop if it's the currently playing MIDI note
        return;
    }
    console.log(`MIDI Note Off: ${noteNumber}`);
    noteOff(); // Use the general noteOff function to handle ramp down and cleanup
}


// --- Handle MIDI Control Change ---
function handleMIDIControlChange(ccNumber, value) {
    if (!audioContext) return;
    console.log(`MIDI CC: ${ccNumber}, Value: ${value}`);

    const now = audioContext.currentTime;
    const rampTime = now + 0.01; // Short ramp to avoid clicks

    switch (ccNumber) {
        case 7: // Master Volume
            const masterVol = mapRange(value, 0, 127, 0, 1);
            masterVolumeSlider.value = masterVol; // Update UI
            if (masterGain) {
                masterGain.gain.linearRampToValueAtTime(masterVol, rampTime);
            }
            break;
        case 74: // Filter Cutoff (typically CC 74)
            // Map 0-127 logarithmically to 20-15000 Hz for a more musical feel
            // Simple log mapping: base ^ (normalized_value * range_exponent) * min_freq
            const minF = 20;
            const maxF = 15000;
            // A simple exponential mapping:
            const cutoffFreq = minF * Math.pow(maxF / minF, value / 127);
            // Alternative simpler linear mapping (less musically useful for cutoff):
            // const cutoffFreq = mapRange(value, 0, 127, 20, 15000);

            filterCutoffSlider.value = cutoffFreq; // Update UI (might not look linear now)
            if (currentFilter) {
                currentFilter.frequency.linearRampToValueAtTime(cutoffFreq, rampTime);
            } else {
                 // Store value even if no note is playing, so next note uses it
                // (The slider value is already the source of truth for new notes)
            }
            break;
        case 71: // Filter Resonance (typically CC 71)
            const reso = mapRange(value, 0, 127, 0, 30); // Map to slider range
            filterResonanceSlider.value = reso; // Update UI
            if (currentFilter) {
                currentFilter.Q.linearRampToValueAtTime(reso, rampTime);
            }
            break;
        // Add more CC mappings here if desired (e.g., waveform, LFO, envelope params)
        default:
            // console.log(`Unhandled MIDI CC: ${ccNumber}`);
            break;
    }
}

// --- Helper to find note name from MIDI number (for visual feedback) ---
function findNoteNameFromMidi(midiNote) {
    for (const key of keys) {
        if (parseInt(key.dataset.midi) === midiNote) {
            return key.dataset.note;
        }
    }
    return null; // Return null if no matching key is found on our limited UI keyboard
}

// --- Visual Feedback Helper ---
function updateKeyVisual(noteName, isActive) {
    if (!noteName) return; // Don't try to update if we don't have a name
    const keyElement = keyboardElement.querySelector(`.key[data-note="${noteName}"]`);
    if (keyElement) {
        if (isActive) {
            keyElement.classList.add('active');
        } else {
            keyElement.classList.remove('active');
        }
    }
}

// --- Original Note Handling (Modified for consistency) ---
function noteOn(noteName) { // Plays based on note NAME (from UI click/keyboard)
    if (!audioContext || !noteFrequencies[noteName]) return;

    // Convert note name to MIDI number if possible (for consistency in tracking)
    const keyElement = keyboardElement.querySelector(`.key[data-note="${noteName}"]`);
    const midiNote = keyElement ? parseInt(keyElement.dataset.midi) : null;

    if (activeNote === noteName && currentOscillator) return; // Prevent retrigger

    noteOff(); // Stop previous note

    activeNote = noteName;
    activeMIDINote = midiNote; // Track MIDI note number if available

    const frequency = noteFrequencies[noteName]; // Use pre-calculated frequency for UI notes
    const now = audioContext.currentTime;

    currentOscillator = audioContext.createOscillator();
    currentFilter = audioContext.createBiquadFilter();
    currentVCA = audioContext.createGain();

    currentOscillator.type = oscWaveformSelect.value;
    currentOscillator.frequency.setValueAtTime(frequency, now);

    currentFilter.type = "lowpass";
    currentFilter.frequency.setValueAtTime(parseFloat(filterCutoffSlider.value), now);
    currentFilter.Q.setValueAtTime(parseFloat(filterResonanceSlider.value), now);

    currentVCA.gain.setValueAtTime(0, now);
    currentVCA.gain.linearRampToValueAtTime(1.0, now + 0.01); // Default full gain for UI click/key

    currentOscillator.connect(currentFilter);
    currentFilter.connect(currentVCA);
    currentVCA.connect(masterGain);

    currentOscillator.start(now);
    updateKeyVisual(noteName, true);
    console.log(`UI Note On: ${noteName} (${frequency} Hz)`);
}

function noteOff() { // General Note Off - stops whatever is playing
    if (!audioContext || !currentOscillator) return;

    const now = audioContext.currentTime;
    const stoppingNoteName = activeNote; // Keep track for visual feedback

    // Ramp down VCA
    if (currentVCA) {
        currentVCA.gain.cancelScheduledValues(now);
        currentVCA.gain.setValueAtTime(currentVCA.gain.value, now);
        currentVCA.gain.linearRampToValueAtTime(0.0, now + 0.02);
    }

    // Stop Oscillator
     if (currentOscillator) {
        try {
            // Check playbackState before stopping to avoid errors on already stopped nodes
            // Note: playbackState is deprecated but still widely supported.
            // A more modern approach might involve tracking node state differently.
            if (currentOscillator.playbackState !== undefined && currentOscillator.playbackState !== 'stopped') {
               currentOscillator.stop(now + 0.03);
            } else if (currentOscillator.playbackState === undefined) {
                // Fallback if playbackState is not supported (less likely now)
                currentOscillator.stop(now + 0.03);
            }
        } catch(e) {
            console.warn("Error stopping oscillator (might be already stopped):", e);
        }
    }

    // Disconnect LFO from target when note stops
    try { lfoDepth.disconnect(); } catch (e) { /* ignore */ }
    // Reset tremolo gain if it was being modulated
    if (tremoloGain) {
        tremoloGain.gain.cancelScheduledValues(now);
        tremoloGain.gain.setValueAtTime(1.0, now); // Reset to pass-through
    }


    // Cleanup references
    currentOscillator = null;
    currentFilter = null;
    currentVCA = null;

    // Visual Feedback
    updateKeyVisual(stoppingNoteName, false);

    // Clear active note trackers
    console.log(`Note Off: (MIDI: ${activeMIDINote}, Name: ${activeNote})`);
    activeNote = null;
    activeMIDINote = null;
}

// --- Event Listeners ---

// Start Audio Button
startButton.addEventListener('click', setupAudioContext);

// Enable MIDI Button
enableMidiButton.addEventListener('click', initMIDI);

// Master Volume
masterVolumeSlider.addEventListener('input', (event) => {
    if (masterGain && audioContext) {
        masterGain.gain.linearRampToValueAtTime(parseFloat(event.target.value), audioContext.currentTime + 0.01);
    }
});
masterVolumeSlider.addEventListener('change', (event) => { // Update on release too if needed
     if (masterGain && audioContext) {
        masterGain.gain.linearRampToValueAtTime(parseFloat(event.target.value), audioContext.currentTime + 0.01);
    }
});


// Oscillator Waveform
oscWaveformSelect.addEventListener('change', () => {
    if (currentOscillator) { // Change immediately if playing
        currentOscillator.type = oscWaveformSelect.value;
    }
});

// Filter Controls
filterCutoffSlider.addEventListener('input', (event) => {
    if (currentFilter && audioContext) {
        // Use exponential mapping when controlled by UI slider too for consistency? Optional.
        // Or keep slider linear and MIDI exponential? We'll keep slider mapping linear for now.
        currentFilter.frequency.linearRampToValueAtTime(parseFloat(event.target.value), audioContext.currentTime + 0.01);
    }
});
filterResonanceSlider.addEventListener('input', (event) => {
    if (currentFilter && audioContext) {
        currentFilter.Q.linearRampToValueAtTime(parseFloat(event.target.value), audioContext.currentTime + 0.01);
    }
});


// --- UI Keyboard Interaction (Mouse/Touch) ---
keys.forEach(key => {
    const noteName = key.dataset.note;

    key.addEventListener('mousedown', (e) => {
        e.preventDefault();
        noteOn(noteName); // Use the original noteOn based on name
    });

    key.addEventListener('mouseup', (e) => {
        e.preventDefault();
         // Call general noteOff - it will check activeNote implicitly
        if (activeNote === noteName) {
            noteOff();
        }
    });

    key.addEventListener('mouseleave', (e) => {
         // Check if mouse button is up AND if the active note matches the key left
         if (e.buttons === 0 && activeNote === noteName) {
            noteOff();
        }
    });

    // Touch events
    key.addEventListener('touchstart', (e) => {
        e.preventDefault(); // Prevent default touch behavior (like scrolling)
        noteOn(noteName);
    }, { passive: false }); // Need passive: false to call preventDefault

    key.addEventListener('touchend', (e) => {
        e.preventDefault();
         if (activeNote === noteName) {
            noteOff();
        }
    });
     key.addEventListener('touchcancel', (e) => {
        e.preventDefault();
         if (activeNote === noteName) {
            noteOff();
        }
     });
});

// --- LFO Control Listeners ---
lfoRateSlider.addEventListener('input', (event) => {
    if (lfo) {
        const rate = parseFloat(event.target.value);
        lfo.frequency.linearRampToValueAtTime(rate, audioContext.currentTime + 0.01);
    }
});

lfoDepthSlider.addEventListener('input', (event) => {
    // Depth change only takes effect on the *next* noteOn, as connections/scaling are set there.
    // We could try to update the current note's LFO depth gain value immediately,
    // but it requires knowing the current target and applying the correct scaling.
    // For simplicity, let depth changes apply to subsequent notes.
    // console.log("LFO Depth slider changed (applies on next note)");
    // Immediate update attempt (more complex):
    if (lfo && lfoDepth && currentOscillator) { // Check if a note is playing
        const lfoTarget = lfoTargetSelect.value;
        const lfoDepthValue = parseFloat(event.target.value);
        const now = audioContext.currentTime;
        const rampTime = now + 0.01;

         if (lfoTarget !== 'none') {
             let scaledDepth = 0;
             switch (lfoTarget) {
                 case 'pitch': scaledDepth = lfoDepthValue * 1200; break;
                 case 'filter': scaledDepth = lfoDepthValue * 5000; break;
                 case 'amplitude': scaledDepth = lfoDepthValue; break; // Simple 0-1 scaling
             }
             lfoDepth.gain.linearRampToValueAtTime(scaledDepth, rampTime);
         } else {
             lfoDepth.gain.linearRampToValueAtTime(0, rampTime); // Ensure 0 depth if target is none
         }
    }
});


lfoWaveformSelect.addEventListener('change', (event) => {
    if (lfo) {
        lfo.type = event.target.value;
    }
});

lfoTargetSelect.addEventListener('change', (event) => {
    // Target change only takes effect on the *next* noteOn, as connections are set there.
    // We need to disconnect the LFO from the *current* note's target immediately
    // and reset that target's modulation.
     if (lfoDepth && currentOscillator) { // Check if a note is playing
         const now = audioContext.currentTime;
         const rampTime = now + 0.01;
         // Disconnect LFO depth gain from whatever it was connected to
         try { lfoDepth.disconnect(); } catch(e) { /* ignore */ }
         // Reset modulation on potentially previously modulated parameters
         currentOscillator.detune.cancelScheduledValues(now);
         currentOscillator.detune.linearRampToValueAtTime(0, rampTime); // Reset pitch mod
         currentFilter.frequency.cancelScheduledValues(now);
         // Reset filter mod - careful not to override manual setting, maybe just cancel?
         // currentFilter.frequency.linearRampToValueAtTime(parseFloat(filterCutoffSlider.value), rampTime);
         if (tremoloGain) {
            tremoloGain.gain.cancelScheduledValues(now);
            tremoloGain.gain.linearRampToValueAtTime(1.0, rampTime); // Reset amp mod
         }
         // Set LFO depth gain to 0 until next noteOn connects it appropriately
         lfoDepth.gain.linearRampToValueAtTime(0, rampTime);
     }
    // console.log("LFO Target changed (applies on next note)");
});


// Global mouseup
document.addEventListener('mouseup', () => {
    // If a note is active (triggered by UI/keyboard) AND it wasn't triggered by MIDI, stop it.
    if(activeNote && activeMIDINote === null && currentOscillator) {
        noteOff();
    } else if (activeNote && !currentOscillator) { // Cleanup visual if needed (e.g., note ended but mouseup missed)
         updateKeyVisual(activeNote, false);
         activeNote = null;
         activeMIDINote = null;
    }
});

// --- Physical Keyboard Interaction ---
document.addEventListener('keydown', (event) => {
    // Ignore if modifier keys are pressed or if it's a repeat event
    if (event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
    // Ignore if focus is inside an input/select element
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;

    const key = event.key.toLowerCase();
    const noteName = keyNoteMap[key];
    if (noteName) {
        event.preventDefault(); // Prevent default key actions (like typing 'a')
        noteOn(noteName); // Use the original noteOn based on name
    }
});

document.addEventListener('keyup', (event) => {
     // Ignore if modifier keys are pressed
     if (event.ctrlKey || event.altKey || event.metaKey) return;
     // Ignore if focus is inside an input/select element
     if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;

    const key = event.key.toLowerCase();
    const noteName = keyNoteMap[key];
    if (noteName) {
        event.preventDefault();
        // Call general noteOff - it checks activeNote implicitly
        if (activeNote === noteName) {
            noteOff();
        }
    }
});

// --- Oscilloscope Drawing Function ---
function drawOscilloscope() {
    if (!scopeCtx || !analyser || !scopeDataArray) {
        // If context or analyser isn't ready, try again later
        scopeAnimationId = requestAnimationFrame(drawOscilloscope);
        return;
    }

    // Get time domain data
    analyser.getByteTimeDomainData(scopeDataArray);

    // Clear canvas
    scopeCtx.fillStyle = '#222'; // Background color
    scopeCtx.fillRect(0, 0, scopeCanvas.width, scopeCanvas.height);

    // Set line style
    scopeCtx.lineWidth = 2;
    scopeCtx.strokeStyle = '#00ff00'; // Green line
    scopeCtx.beginPath();

    const sliceWidth = scopeCanvas.width * 1.0 / analyser.frequencyBinCount;
    let x = 0;

    for (let i = 0; i < analyser.frequencyBinCount; i++) {
        // Convert data value (0-255) to canvas Y coordinate
        const v = scopeDataArray[i] / 128.0; // Normalize to 0.0 - 2.0
        const y = v * scopeCanvas.height / 2;

        if (i === 0) {
            scopeCtx.moveTo(x, y);
        } else {
            scopeCtx.lineTo(x, y);
        }

        x += sliceWidth;
    }

    scopeCtx.lineTo(scopeCanvas.width, scopeCanvas.height / 2); // Draw line to the end
    scopeCtx.stroke(); // Draw the path

    // Request next frame
    scopeAnimationId = requestAnimationFrame(drawOscilloscope);
}


console.log("Synth script loaded. Click 'Start Audio', then 'Enable MIDI'.");
