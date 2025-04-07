# Simple Web Synthesizer

A basic web-based synthesizer built with HTML, CSS, and the Web Audio API. It features an on-screen keyboard, MIDI input support, and a simple oscilloscope visualization.

## Features

*   **Monophonic Synthesizer:** Plays one note at a time.
*   **Basic Controls:**
    *   Master Volume
    *   Oscillator Waveform (Sine, Square, Sawtooth, Triangle)
    *   Filter Cutoff Frequency
    *   Filter Resonance (Q)
*   **Dual LFOs:** Two independent Low-Frequency Oscillators, each with:
    *   Rate control (0.1 Hz - 20 Hz)
    *   Depth control
    *   Waveform selector (Sine, Square, Sawtooth, Triangle)
    *   Target selector (None, Pitch, Filter Cutoff, Amplitude)
    *   Pause/Resume button
*   **On-Screen Keyboard:** A 25-key (C3-C5) keyboard playable with mouse/touch or physical computer keyboard (uses 'a', 'w', 's', 'e', 'd', 'f', 't', 'g', 'y', 'h', 'u', 'j', 'k' for C4-C5).
*   **Web MIDI API Integration:**
    *   Connect external MIDI controllers.
    *   Control notes (Note On/Off) and velocity (maps to gain).
    *   Control parameters via MIDI CC:
        *   CC 7: Master Volume
        *   CC 74: Filter Cutoff
        *   CC 71: Filter Resonance
    *   Automatic MIDI connection attempt after audio starts (if permission previously granted).
*   **Oscilloscope:** Visualizes the audio output waveform.
*   **Initial Disabled State:** The synth UI is visible but disabled until audio is started.
*   **Settings Management:**
    *   Save current synth settings to browser's `localStorage`.
    *   Load settings automatically on page start if previously saved.
    *   Manually load settings from `localStorage`.
    *   Export current settings to a `.json` file.
    *   Import settings from a `.json` file.

## How to Use

1.  **Open `synth.html`:** Open the `synth.html` file in a compatible web browser.
2.  **Connect MIDI (Optional):** If using a MIDI controller, connect it to your computer *before* loading the page or before clicking "Start Audio".
3.  **Start Audio:** Click the "Start Audio" button. This initializes the Web Audio API and enables the synthesizer controls.
4.  **Enable MIDI (if needed):**
    *   The application will attempt to connect to MIDI automatically after audio starts.
    *   If it doesn't connect automatically (e.g., first time, no permission yet), click the "Enable MIDI Input" button.
    *   Your browser will likely ask for permission to access MIDI devices. Grant permission.
    *   The status display should update if a device is connected.
5.  **Play:**
    *   Click/touch the on-screen keys.
    *   Use the mapped computer keyboard keys.
    *   Play notes on your connected MIDI controller.
    *   Adjust parameters using the sliders/select menu or mapped MIDI CC controls.
    *   Configure LFO 1 and LFO 2 rate, depth, waveform, and target. Use the Pause/Resume buttons to toggle modulation.
6.  **Manage Settings (Optional):**
    *   Click "Save Settings" to store the current patch in your browser.
    *   Click "Load Settings (Local)" to restore the last saved patch.
    *   Click "Export Settings" to download the current patch as a `synth-settings.json` file.
    *   Click "Import Settings" and select a previously exported `.json` file to load it.

## Browser Compatibility

*   Requires a modern web browser that supports the **Web Audio API**.
*   For MIDI functionality, the browser must also support the **Web MIDI API** (e.g., Chrome, Edge, Opera). Firefox does not support Web MIDI by default.
