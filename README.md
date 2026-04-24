# MidiLens

MidiLens is a full-stack MIDI file analyzer and play-along web application. It lets users upload `.mid` or `.midi` files, analyzes the musical data on a Flask backend, and displays the results in a professional React dashboard with synchronized piano-roll playback.

## Features

- MIDI upload and backend parsing
- Tempo, time signature, note range, note density, duration, and average velocity analysis
- Instrument and track breakdowns
- Difficult passage detection based on note density
- Interactive piano-roll visualization
- Web Audio playback with a rolling note scheduler
- Play, pause, stop, reset, volume, zoom, and timeline controls
- Beat and measure grid visualization

## Project Structure

```text
MidiLens/
  backend/
    app.py
    requirements.txt
  frontend/
    src/
      App.jsx
      components/
        PianoRoll.jsx
      styles/
        index.css
```

## Run the Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

The backend runs on:

```text
http://127.0.0.1:5000
```

## Run the Frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend usually runs on:

```text
http://localhost:5173
```

## GitHub Update Commands

```bash
git add .
git commit -m "Upgrade MidiLens interface and playback system"
git push
```
