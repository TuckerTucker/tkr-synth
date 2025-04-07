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
let tremoloGain = null; // Extra gain node for amplitude modulation
let lfos = []; // Array to hold LFO instances

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
// LFO 1 UI Elements
const lfo1RateSliderId = 'lfo1-rate'; // Renamed ID
const lfo1DepthSliderId = 'lfo1-depth'; // Renamed ID
const lfo1WaveformSelectId = 'lfo1-waveform'; // Renamed ID
const lfo1TargetSelectId = 'lfo1-target'; // Renamed ID

// LFO 2 UI Elements
const lfo2RateSliderId = 'lfo2-rate';
const lfo2DepthSliderId = 'lfo2-depth';
const lfo2WaveformSelectId = 'lfo2-waveform';
const lfo2TargetSelectId = 'lfo2-target';
const lfo2PauseButtonId = 'lfo2-pause-button';

// Settings Buttons
const saveSettingsButton = document.getElementById('save-settings-button');
const loadSettingsButton = document.getElementById('load-settings-button');
const exportSettingsButton = document.getElementById('export-settings-button');
const importSettingsButton = document.getElementById('import-settings-button'); // Added import button element
const importFileInput = document.getElementById('import-file-input'); // Added file input element
const SETTINGS_KEY = 'webSynthSettingsV2'; // localStorage key (V2 for new structure)


// --- LFO Class ---
class LFO {
    constructor(idPrefix, rateSliderId, depthSliderId, waveformSelectId, targetSelectId, pauseButtonId) {
        this.idPrefix = idPrefix;
        this.rateSlider = document.getElementById(rateSliderId);
        this.depthSlider = document.getElementById(depthSliderId);
        this.waveformSelect = document.getElementById(waveformSelectId);
        this.targetSelect = document.getElementById(targetSelectId);
        this.pauseButton = document.getElementById(pauseButtonId);

        this.oscillator = null;
        this.depthGain = null;
        this.isPaused = false; // Initial state
        this.audioCtx = null;

        this.currentConnections = []; // Track current connections { node: AudioNode, param: string }
    }

    init(audioCtx) {
        this.audioCtx = audioCtx;
        this.oscillator = this.audioCtx.createOscillator();
        this.depthGain = this.audioCtx.createGain();

        this.oscillator.type = this.waveformSelect.value;
        this.oscillator.frequency.setValueAtTime(parseFloat(this.rateSlider.value), this.audioCtx.currentTime);
        this.depthGain.gain.setValueAtTime(0, this.audioCtx.currentTime); // Start at 0 depth

        this.oscillator.connect(this.depthGain);
        this.oscillator.start();
        console.log(`LFO (${this.idPrefix || 'default'}) initialized.`);

        // Add event listeners specific to this LFO's controls
        this.rateSlider.addEventListener('input', () => this.updateRate());
        this.depthSlider.addEventListener('input', () => this.updateDepthGain());
        this.waveformSelect.addEventListener('change', () => this.updateWaveform());
        this.targetSelect.addEventListener('change', () => this.handleTargetChange());
        if (this.pauseButton) {
            this.pauseButton.addEventListener('click', () => this.togglePause());
        }
    }

    togglePause() {
        if (!this.audioCtx || !this.depthGain) return;
        this.isPaused = !this.isPaused;
        const now = this.audioCtx.currentTime;
        const rampTime = now + 0.01;

        if (this.isPaused) {
            this.depthGain.gain.cancelScheduledValues(now);
            this.depthGain.gain.linearRampToValueAtTime(0, rampTime); // Set depth gain to 0
            this.pauseButton.textContent = 'Resume';
            this.pauseButton.classList.add('paused');
            console.log(`LFO (${this.idPrefix}) Paused.`);
        } else {
            // Restore depth gain by recalculating based on slider/target
            this.updateDepthGain();
            this.pauseButton.textContent = 'Pause';
            this.pauseButton.classList.remove('paused');
            console.log(`LFO (${this.idPrefix}) Resumed.`);
        }
    }

    updateRate() {
        if (!this.oscillator || !this.audioCtx) return;
        const rate = parseFloat(this.rateSlider.value);
        this.oscillator.frequency.linearRampToValueAtTime(rate, this.audioCtx.currentTime + 0.01);
    }

    updateWaveform() {
        if (!this.oscillator) return;
        this.oscillator.type = this.waveformSelect.value;
    }

    updateDepthGain() {
        if (!this.depthGain || !this.audioCtx) return;
        const depthValue = parseFloat(this.depthSlider.value);
        const targetType = this.targetSelect.value;
        let scaledDepth = 0;

        // Calculate scaled depth based on the *selected* target type
        switch (targetType) {
            case 'pitch': scaledDepth = depthValue * 1200; break; // +/- 1200 cents
            case 'filter': scaledDepth = depthValue * 5000; break; // +/- 5000 Hz
            case 'amplitude': scaledDepth = depthValue; break; // 0 to 1 for direct gain mod
            default: scaledDepth = 0; break;
        }

        // Update the LFO's depth gain node value only if not paused.
        if (!this.isPaused) {
            this.depthGain.gain.linearRampToValueAtTime(scaledDepth, this.audioCtx.currentTime + 0.01);
            // console.log(`LFO Depth Gain set to ${scaledDepth.toFixed(2)} for target ${targetType}`);
        } else {
             // Ensure gain stays 0 if paused
             this.depthGain.gain.cancelScheduledValues(this.audioCtx.currentTime);
             this.depthGain.gain.setValueAtTime(0, this.audioCtx.currentTime);
        }
    }

     handleTargetChange() {
        // When target changes, we need to disconnect from the old target *if a note is playing*
        // and reset its modulation, then set the depth gain to 0 until the next noteOn.
        if (this.currentConnections.length > 0 && this.audioCtx) {
             const now = this.audioCtx.currentTime;
             const rampTime = now + 0.01;
             console.log(`LFO target changed, disconnecting from previous targets.`);
             this.disconnect(); // Disconnect from all current targets

             // Reset the LFO depth gain itself to 0 until next note connects it
             this.depthGain.gain.linearRampToValueAtTime(0, rampTime);
        }
         // Update the depth gain based on the *new* target and current slider value
         this.updateDepthGain();
    }


    connect(targetNode, targetParamName) {
        if (!this.oscillator || !this.depthGain || !this.audioCtx || !targetNode) return;

        const targetType = this.targetSelect.value;
        const depthValue = parseFloat(this.depthSlider.value);

        if (targetType === 'none' || depthValue === 0) {
            this.disconnect(); // Ensure disconnected if target is none or depth is 0
            return;
        }

        // Ensure depth gain is set correctly for the target *before* connecting
        this.updateDepthGain();

        try {
            let targetAudioParam = null;
            if (targetParamName === 'gain' && targetNode instanceof GainNode) {
                 targetAudioParam = targetNode.gain;
            } else if (targetParamName === 'detune' && targetNode instanceof OscillatorNode) {
                 targetAudioParam = targetNode.detune;
            } else if (targetParamName === 'frequency' && targetNode instanceof BiquadFilterNode) {
                 targetAudioParam = targetNode.frequency;
            }
            // Add other potential AudioParams here if needed

            if (targetAudioParam) {
                console.log(`Connecting LFO Depth to ${targetParamName}`);
                this.depthGain.connect(targetAudioParam);
                this.currentConnections.push({ node: targetNode, param: targetParamName }); // Track connection
            } else {
                 console.warn(`LFO Connect: Could not find AudioParam '${targetParamName}' on target node.`);
            }

        } catch (e) {
            console.error(`Error connecting LFO: ${e}`);
        }
    }

    disconnect() {
        if (!this.depthGain || !this.audioCtx) return;

        try {
            this.depthGain.disconnect(); // Disconnects from all destinations
            // console.log(`LFO disconnected from all targets.`);

            // We also need to reset the modulation effect on the parameters it *was* connected to.
            const now = this.audioCtx.currentTime;
            const rampTime = now + 0.01;
            this.currentConnections.forEach(conn => {
                try {
                    if (conn.param === 'detune' && conn.node instanceof OscillatorNode) {
                        conn.node.detune.cancelScheduledValues(now);
                        conn.node.detune.linearRampToValueAtTime(0, rampTime);
                    } else if (conn.param === 'frequency' && conn.node instanceof BiquadFilterNode) {
                        conn.node.frequency.cancelScheduledValues(now);
                        // Don't reset to slider value here, just cancel LFO influence
                    } else if (conn.param === 'gain' && conn.node instanceof GainNode) {
                        conn.node.gain.cancelScheduledValues(now);
                        conn.node.gain.linearRampToValueAtTime(1.0, rampTime); // Reset gain to 1
                    }
                } catch(e) { console.warn(`Error resetting param ${conn.param} during LFO disconnect: ${e}`); }
            });

        } catch (e) {
            console.error(`Error disconnecting LFO: ${e}`);
        } finally {
             this.currentConnections = []; // Clear tracked connections
        }
    }
}


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

            // Setup Tremolo Gain Node (inserted before analyser) - needed even if LFO target isn't amplitude initially
            tremoloGain = audioContext.createGain();
            tremoloGain.gain.setValueAtTime(1.0, audioContext.currentTime); // Default to pass-through

            // Connect analyser and main signal path including tremolo
            // VCA -> tremoloGain -> analyser -> masterGain -> destination
            tremoloGain.connect(analyser);
            analyser.connect(masterGain);
            masterGain.connect(audioContext.destination);

            console.log("AudioContext and Analyser created successfully.");

            // Initialize LFOs
            const lfo1 = new LFO('lfo1', lfo1RateSliderId, lfo1DepthSliderId, lfo1WaveformSelectId, lfo1TargetSelectId, 'lfo1-pause-button');
            lfo1.init(audioContext);
            lfos.push(lfo1);

            const lfo2 = new LFO('lfo2', lfo2RateSliderId, lfo2DepthSliderId, lfo2WaveformSelectId, lfo2TargetSelectId, 'lfo2-pause-button');
            lfo2.init(audioContext);
            lfos.push(lfo2);

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
    lfos.forEach(lfoInstance => {
        const targetType = lfoInstance.targetSelect.value;
        switch (targetType) {
            case 'pitch':
                lfoInstance.connect(currentOscillator, 'detune');
                break;
            case 'filter':
                lfoInstance.connect(currentFilter, 'frequency');
                break;
            case 'amplitude':
                lfoInstance.connect(tremoloGain, 'gain');
                break;
            case 'none':
            default:
                lfoInstance.disconnect(); // Ensure disconnected if target is none
                break;
        }
    });
    // Ensure tremolo gain is reset if *no* LFO is targeting amplitude
    if (!lfos.some(lfo => lfo.targetSelect.value === 'amplitude' && parseFloat(lfo.depthSlider.value) > 0)) {
         if (tremoloGain) tremoloGain.gain.setValueAtTime(1.0, now);
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
    currentVCA.gain.linearRampToValueAtTime(1.0, now + 0.01); // Default full gain for UI click

    // Connect main signal path: Osc -> Filter -> VCA -> tremoloGain (-> analyser is already connected)
    currentOscillator.connect(currentFilter);
    currentFilter.connect(currentVCA);
    currentVCA.connect(tremoloGain); // Connect VCA to tremoloGain, not masterGain

    // --- LFO Connection Logic (Copied from midiNoteOn) ---
    lfos.forEach(lfoInstance => {
        const targetType = lfoInstance.targetSelect.value;
        switch (targetType) {
            case 'pitch':
                lfoInstance.connect(currentOscillator, 'detune');
                break;
            case 'filter':
                lfoInstance.connect(currentFilter, 'frequency');
                break;
            case 'amplitude':
                lfoInstance.connect(tremoloGain, 'gain');
                break;
            case 'none':
            default:
                lfoInstance.disconnect(); // Ensure disconnected if target is none
                break;
        }
    });
    // Ensure tremolo gain is reset if *no* LFO is targeting amplitude
    if (!lfos.some(lfo => lfo.targetSelect.value === 'amplitude' && parseFloat(lfo.depthSlider.value) > 0)) {
         if (tremoloGain) tremoloGain.gain.setValueAtTime(1.0, now);
    }
    // --- End LFO Connection Logic ---

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

    // Disconnect LFOs when note stops
    lfos.forEach(lfoInstance => lfoInstance.disconnect());


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

// --- Settings Functions ---

function gatherSettings() {
    const settings = {
        masterVolume: masterVolumeSlider.value,
        oscWaveform: oscWaveformSelect.value,
        filterCutoff: filterCutoffSlider.value,
        filterResonance: filterResonanceSlider.value,
        lfos: []
    };
    lfos.forEach(lfoInstance => {
        settings.lfos.push({
            rate: lfoInstance.rateSlider.value,
            depth: lfoInstance.depthSlider.value,
            waveform: lfoInstance.waveformSelect.value,
            target: lfoInstance.targetSelect.value,
            // Note: isPaused state is not saved, LFOs always start unpaused
        });
    });
    return settings;
}

function saveSettings() {
    try {
        const settings = gatherSettings();
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
        console.log('Settings saved to localStorage.');
        // Optional: Add visual feedback (e.g., briefly change button text)
    } catch (e) {
        console.error('Error saving settings:', e);
        alert('Failed to save settings. LocalStorage might be full or disabled.');
    }
}

function applySettings(settings) {
    if (!settings) return;

    console.log('Applying loaded settings:', settings);

    // Apply global settings
    masterVolumeSlider.value = settings.masterVolume ?? 0.7;
    oscWaveformSelect.value = settings.oscWaveform ?? 'sine';
    filterCutoffSlider.value = settings.filterCutoff ?? 5000;
    filterResonanceSlider.value = settings.filterResonance ?? 1;

    // Apply settings to audio nodes if context exists
    if (audioContext && masterGain) {
        masterGain.gain.setValueAtTime(parseFloat(masterVolumeSlider.value), audioContext.currentTime);
    }
    // Note: Filter/Oscillator changes apply on next noteOn or immediately if playing (handled by existing listeners)

    // Apply LFO settings
    if (settings.lfos && settings.lfos.length === lfos.length) {
        settings.lfos.forEach((lfoSetting, index) => {
            const lfoInstance = lfos[index];
            if (lfoInstance) {
                lfoInstance.rateSlider.value = lfoSetting.rate ?? 5;
                lfoInstance.depthSlider.value = lfoSetting.depth ?? 0;
                lfoInstance.waveformSelect.value = lfoSetting.waveform ?? 'sine';
                lfoInstance.targetSelect.value = lfoSetting.target ?? 'none';

                // Trigger updates in the LFO instance if audio context exists
                if (lfoInstance.audioCtx) {
                    lfoInstance.updateRate();
                    lfoInstance.updateWaveform();
                    // updateDepthGain also handles applying the gain if not paused
                    lfoInstance.updateDepthGain();
                    // handleTargetChange ensures connections are correct if a note is playing
                    // but might be redundant here as noteOn handles connections.
                    // Let's rely on noteOn/updateDepthGain for applying audio changes.
                }
                 // Reset pause state visually (LFOs always load unpaused)
                 if (lfoInstance.pauseButton) {
                    lfoInstance.isPaused = false;
                    lfoInstance.pauseButton.textContent = 'Pause';
                    lfoInstance.pauseButton.classList.remove('paused');
                 }
            }
        });
    }
    console.log('Settings applied.');
}


function loadSettings() {
    try {
        const savedSettings = localStorage.getItem(SETTINGS_KEY);
        if (savedSettings) {
            const settings = JSON.parse(savedSettings);
            applySettings(settings);
        } else {
            console.log('No saved settings found.');
        }
    } catch (e) {
        console.error('Error loading or parsing settings:', e);
        // Optional: Clear invalid settings
        // localStorage.removeItem(SETTINGS_KEY);
    }
}

function exportSettings() {
    try {
        const settings = gatherSettings();
        const settingsString = JSON.stringify(settings, null, 2); // Pretty print JSON
        const blob = new Blob([settingsString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'synth-settings.json'; // Filename for download
        document.body.appendChild(a); // Required for Firefox
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url); // Clean up the object URL
        console.log('Settings exported.');
    } catch (e) {
        console.error('Error exporting settings:', e);
        alert('Failed to export settings.');
    }
}

function importSettings(event) {
    const file = event.target.files[0];
    if (!file) {
        return; // No file selected
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const settingsString = e.target.result;
            const settings = JSON.parse(settingsString);
            applySettings(settings);
            console.log('Settings imported successfully from file.');
            // Optional: Save imported settings to localStorage immediately?
            // saveSettings();
        } catch (err) {
            console.error('Error reading or parsing imported settings file:', err);
            alert('Failed to import settings. Please ensure the file is valid JSON.');
        } finally {
            // Reset file input value to allow importing the same file again if needed
             event.target.value = null;
        }
    };

    reader.onerror = function(e) {
        console.error('Error reading file:', e);
        alert('Failed to read the selected file.');
         event.target.value = null; // Reset file input
    };

    reader.readAsText(file);
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
}); // <-- Added missing closing brace for keys.forEach

// Settings Buttons Listeners
if (saveSettingsButton) {
    saveSettingsButton.addEventListener('click', saveSettings);
}
if (loadSettingsButton) {
    loadSettingsButton.addEventListener('click', loadSettings);
}
if (exportSettingsButton) {
    exportSettingsButton.addEventListener('click', exportSettings);
}
if (importSettingsButton && importFileInput) { // Added listeners for import
    importSettingsButton.addEventListener('click', () => {
        importFileInput.click(); // Trigger hidden file input
    });
    importFileInput.addEventListener('change', importSettings);
}


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

// Initial Load Attempt
// Use DOMContentLoaded to ensure all elements are available before trying to load/apply
document.addEventListener('DOMContentLoaded', (event) => {
    loadSettings();
});


console.log("Synth script loaded. Click 'Start Audio', then 'Enable MIDI'.");
