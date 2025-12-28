# Pulse Platform + ER Assistant (LM Version)

Pulse Platform is a front-end dashboard for emergency room operations with a real-time waiting area, bed management, and staff roster, paired with a local, WebGPU-powered ER Assistant chat. The assistant runs entirely in the browser and can be prompted alongside the dashboard for triage support, vitals summaries, and quick clinical guidance.

## Features

- Patient waiting area with live monitor cards (HR, SPO2, BP, RR).
- Bed management workflow with assignments, vitals, and care context.
- Staff roster strip with doctor and nurse roles.
- ER Assistant chatbot running locally via WebGPU (Transformers.js).
- Pulse Platform embedded beside the chat UI for a single-screen workflow.

## Tech Stack

- React + Vite
- Tailwind CSS
- Transformers.js (WebGPU inference)
- Static HTML for Pulse Platform UI

## Project Structure

- `index.html` – App shell with split layout (chat + Pulse Platform).
- `src/` – React app, chat UI, and WebGPU worker.
- `Pulse.html` – Pulse Platform dashboard UI.
- `public/` – Static assets.
- `*.png` – UI images and dashboard art assets.

## Getting Started

Install dependencies and run the dev server:

```sh
npm install
npm run dev
```

Open `http://localhost:5173`.

## Notes

- WebGPU requires a compatible browser (Chrome or Edge recommended).
- The ER Assistant runs locally; patient data stays in the browser session.
