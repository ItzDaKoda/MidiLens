# MidiLens

MidiLens is a full-stack capstone project prototype for analyzing MIDI files and presenting the results in a musician-friendly web interface.

## Features
- Upload `.mid` and `.midi` files
- Parse MIDI note, tempo, time signature, and instrument data
- Display summary metrics such as tempo, duration, note range, and note density
- Show a piano-roll style visualization with play/pause/stop controls
- Highlight dense practice sections to help musicians target difficult passages
- Present a track-by-track breakdown of the MIDI file

## Project Structure

```text
MidiLens/
├── backend/
│   ├── app.py
│   ├── requirements.txt
│   └── README.md
├── frontend/
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── App.jsx
│       ├── main.jsx
│       ├── components/
│       └── styles/
├── .gitignore
└── README.md
```

## How to Run the Project

### 1. Start the backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

Windows PowerShell:
```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

### 2. Start the frontend
```bash
cd frontend
npm install
npm run dev
```

Open the frontend URL shown by Vite, usually `http://localhost:5173`.

## Suggested Next Improvements
- Add real MIDI audio playback using a browser synth library such as Tone.js
- Add zooming and scrubbing for the piano roll
- Add measure markers and key signature detection
- Save analysis history to a database
- Deploy with Render, Railway, or Vercel + Render
