# MidiLens Backend

Flask API for parsing MIDI files and returning structured music analysis data.

## Run

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python app.py
```

## Endpoints

- `GET /api/health`
- `POST /api/analyze`
