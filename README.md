# Pulse Platform Dashboard (Beds 1-3)

Static HTML dashboard for monitoring three beds with MQTT vitals and Hugging Face triage predictions.

## Files
- `index.html` – full dashboard (beds 1–3, doctor selection, bed planning, Gradio triage integration).
- Image assets – bed tiles/backgrounds/icons and staff photo (Dr_Drake_Ramoray.png) used across doctor cards.

## Usage
1. Serve the folder as static files (e.g., `npx serve deployable_dashboard` or any web host).
2. Open `index.html` in a browser.
3. Click the settings gear and set your MQTT WebSocket broker/topic.
4. Let monitor vitals flow in; patients appear in the dropdown with first-seen timestamps.
5. Click a bed tile (1/2/3), pick a patient from the dropdown, choose a doctor card, and assign. Vitals and timestamps update live.
6. Triage prediction hits the Hugging Face Space `mernasameh5/emergency_triage` every 5 seconds when the bed is assigned and has data.

## Notes
- No local simulations are included; all vitals must arrive via MQTT.
- Beds start vacant: demographics and clinical fields stay blank until a patient is assigned and has data.
- The Gradio client is loaded from esm.sh (no build needed). Requires internet access to reach the Hugging Face Space.
- If the model call fails, the prediction shows "Prediction error" and retries on the next interval.

## Assets needed
Ensure these image files are present alongside `index.html`:
- Bed1.png, Bed2.png, Bed3.png
- Bed1_Background.png, Bed2_Background.png, Bed3_Background.png
- Bed1-Icon.png, Bed2-Icon.png, Bed3-Icon.png
- Monitors.png
- Dr_Drake_Ramoray.png (used for all doctor cards)
