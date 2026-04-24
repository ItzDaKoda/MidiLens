from __future__ import annotations

import io
import math
from collections import Counter, defaultdict
from statistics import mean
from typing import Any

from flask import Flask, jsonify, request
from flask_cors import CORS
from mido import MidiFile, merge_tracks, tempo2bpm

app = Flask(__name__)
CORS(app)

PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
GM_INSTRUMENTS = [
    "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano", "Honky-tonk Piano",
    "Electric Piano 1", "Electric Piano 2", "Harpsichord", "Clavinet", "Celesta", "Glockenspiel",
    "Music Box", "Vibraphone", "Marimba", "Xylophone", "Tubular Bells", "Dulcimer", "Drawbar Organ",
    "Percussive Organ", "Rock Organ", "Church Organ", "Reed Organ", "Accordion", "Harmonica",
    "Tango Accordion", "Acoustic Guitar (nylon)", "Acoustic Guitar (steel)", "Electric Guitar (jazz)",
    "Electric Guitar (clean)", "Electric Guitar (muted)", "Overdriven Guitar", "Distortion Guitar",
    "Guitar Harmonics", "Acoustic Bass", "Electric Bass (finger)", "Electric Bass (pick)",
    "Fretless Bass", "Slap Bass 1", "Slap Bass 2", "Synth Bass 1", "Synth Bass 2", "Violin",
    "Viola", "Cello", "Contrabass", "Tremolo Strings", "Pizzicato Strings", "Orchestral Harp",
    "Timpani", "String Ensemble 1", "String Ensemble 2", "Synth Strings 1", "Synth Strings 2",
    "Choir Aahs", "Voice Oohs", "Synth Voice", "Orchestra Hit", "Trumpet", "Trombone", "Tuba",
    "Muted Trumpet", "French Horn", "Brass Section", "Synth Brass 1", "Synth Brass 2", "Soprano Sax",
    "Alto Sax", "Tenor Sax", "Baritone Sax", "Oboe", "English Horn", "Bassoon", "Clarinet", "Piccolo",
    "Flute", "Recorder", "Pan Flute", "Blown Bottle", "Shakuhachi", "Whistle", "Ocarina", "Lead 1 (square)",
    "Lead 2 (sawtooth)", "Lead 3 (calliope)", "Lead 4 (chiff)", "Lead 5 (charang)", "Lead 6 (voice)",
    "Lead 7 (fifths)", "Lead 8 (bass + lead)", "Pad 1 (new age)", "Pad 2 (warm)", "Pad 3 (polysynth)",
    "Pad 4 (choir)", "Pad 5 (bowed)", "Pad 6 (metallic)", "Pad 7 (halo)", "Pad 8 (sweep)",
    "FX 1 (rain)", "FX 2 (soundtrack)", "FX 3 (crystal)", "FX 4 (atmosphere)", "FX 5 (brightness)",
    "FX 6 (goblins)", "FX 7 (echoes)", "FX 8 (sci-fi)", "Sitar", "Banjo", "Shamisen", "Koto", "Kalimba",
    "Bag pipe", "Fiddle", "Shanai", "Tinkle Bell", "Agogo", "Steel Drums", "Woodblock", "Taiko Drum",
    "Melodic Tom", "Synth Drum", "Reverse Cymbal", "Guitar Fret Noise", "Breath Noise", "Seashore",
    "Bird Tweet", "Telephone Ring", "Helicopter", "Applause", "Gunshot",
]


def pitch_to_name(pitch: int) -> str:
    octave = (pitch // 12) - 1
    return f"{PITCH_NAMES[pitch % 12]}{octave}"


def instrument_name(program: int | None, is_drum: bool = False) -> str:
    if is_drum:
        return "Drum Kit"
    if program is None or program < 0 or program >= len(GM_INSTRUMENTS):
        return "Unknown"
    return GM_INSTRUMENTS[program]


def build_tempo_map(tempo_changes: list[dict[str, Any]], ticks_per_beat: int):
    changes = sorted(tempo_changes, key=lambda item: item["tick"])
    if not changes or changes[0]["tick"] != 0:
        changes.insert(0, {"tick": 0, "tempo": 500000, "bpm": 120.0})

    def ticks_to_seconds(target_tick: int) -> float:
        seconds = 0.0
        previous_tick = 0
        current_tempo = changes[0]["tempo"]
        for change in changes[1:]:
            if change["tick"] >= target_tick:
                break
            delta_ticks = change["tick"] - previous_tick
            seconds += (delta_ticks / ticks_per_beat) * (current_tempo / 1_000_000)
            previous_tick = change["tick"]
            current_tempo = change["tempo"]
        delta_ticks = target_tick - previous_tick
        seconds += (delta_ticks / ticks_per_beat) * (current_tempo / 1_000_000)
        return seconds

    return ticks_to_seconds, changes


def extract_notes(mid: MidiFile) -> dict[str, Any]:
    merged = merge_tracks(mid.tracks)
    ticks_per_beat = mid.ticks_per_beat

    tempo_changes: list[dict[str, Any]] = []
    time_signatures: list[dict[str, Any]] = []
    current_program = defaultdict(lambda: 0)
    active_notes: dict[tuple[int, int], list[tuple[int, int, int]]] = defaultdict(list)
    notes: list[dict[str, Any]] = []
    track_summaries = []

    for idx, track in enumerate(mid.tracks):
        name = getattr(track, "name", None) or f"Track {idx + 1}"
        programs = set()
        channel_set = set()
        note_count = 0
        total_ticks = 0
        is_drum = False
        for msg in track:
            total_ticks += msg.time
            if msg.type == "program_change":
                programs.add(msg.program)
                channel_set.add(getattr(msg, "channel", -1))
            elif msg.type in {"note_on", "note_off"}:
                channel = getattr(msg, "channel", -1)
                channel_set.add(channel)
                if channel == 9:
                    is_drum = True
                if msg.type == "note_on" and msg.velocity > 0:
                    note_count += 1
        track_summaries.append({
            "index": idx,
            "name": name,
            "noteCount": note_count,
            "channels": sorted(c for c in channel_set if c >= 0),
            "instruments": [instrument_name(p, is_drum=is_drum) for p in sorted(programs)] or [instrument_name(None, is_drum=is_drum)],
            "lengthTicks": total_ticks,
        })

    absolute_ticks = 0
    for msg in merged:
        absolute_ticks += msg.time
        if msg.type == "set_tempo":
            tempo_changes.append({"tick": absolute_ticks, "tempo": msg.tempo, "bpm": round(tempo2bpm(msg.tempo), 2)})
        elif msg.type == "time_signature":
            time_signatures.append({
                "tick": absolute_ticks,
                "numerator": msg.numerator,
                "denominator": msg.denominator,
                "display": f"{msg.numerator}/{msg.denominator}",
            })
        elif msg.type == "program_change":
            current_program[msg.channel] = msg.program
        elif msg.type == "note_on" and msg.velocity > 0:
            active_notes[(msg.channel, msg.note)].append((absolute_ticks, msg.velocity, current_program[msg.channel]))
        elif msg.type in {"note_off", "note_on"}:
            key = (msg.channel, msg.note)
            if active_notes[key]:
                start_tick, velocity, program = active_notes[key].pop(0)
                duration_ticks = max(1, absolute_ticks - start_tick)
                notes.append({
                    "pitch": msg.note,
                    "pitchName": pitch_to_name(msg.note),
                    "startTick": start_tick,
                    "endTick": absolute_ticks,
                    "durationTicks": duration_ticks,
                    "velocity": velocity,
                    "channel": msg.channel,
                    "trackProgram": program,
                    "instrument": instrument_name(program, is_drum=(msg.channel == 9)),
                    "isDrum": msg.channel == 9,
                })

    tempo_changes = tempo_changes or [{"tick": 0, "tempo": 500000, "bpm": 120.0}]
    time_signatures = time_signatures or [{"tick": 0, "numerator": 4, "denominator": 4, "display": "4/4"}]
    ticks_to_seconds, tempo_changes = build_tempo_map(tempo_changes, ticks_per_beat)

    for change in tempo_changes:
        change["seconds"] = round(ticks_to_seconds(change["tick"]), 4)

    for ts in time_signatures:
        ts["seconds"] = round(ticks_to_seconds(ts["tick"]), 4)

    for note in notes:
        note["startSeconds"] = round(ticks_to_seconds(note["startTick"]), 4)
        note["endSeconds"] = round(ticks_to_seconds(note["endTick"]), 4)
        note["durationSeconds"] = round(max(0.01, note["endSeconds"] - note["startSeconds"]), 4)

    notes.sort(key=lambda n: (n["startSeconds"], n["pitch"]))
    melodic_notes = [note for note in notes if not note["isDrum"]]

    if notes:
        pitch_source = melodic_notes or notes
        min_pitch = min(note["pitch"] for note in pitch_source)
        max_pitch = max(note["pitch"] for note in pitch_source)
        duration_seconds = max(note["endSeconds"] for note in notes)
        total_notes = len(notes)
        density = round(total_notes / duration_seconds, 2) if duration_seconds > 0 else total_notes
        average_velocity = round(mean(note["velocity"] for note in notes), 2)
        instrument_counts = Counter(note["instrument"] for note in notes)
    else:
        min_pitch = max_pitch = 0
        duration_seconds = 0.0
        total_notes = 0
        density = 0.0
        average_velocity = 0.0
        instrument_counts = Counter()

    difficult_passages = []
    if duration_seconds > 0 and total_notes > 0:
        window_size = 4.0
        num_windows = max(1, math.ceil(duration_seconds / window_size))
        buckets = [0] * num_windows
        for note in notes:
            idx = min(num_windows - 1, int(note["startSeconds"] // window_size))
            buckets[idx] += 1
        ranked = sorted(enumerate(buckets), key=lambda item: item[1], reverse=True)[:3]
        difficult_passages = [
            {"start": round(i * window_size, 2), "end": round(min(duration_seconds, (i + 1) * window_size), 2), "notes": count}
            for i, count in ranked if count > 0
        ]

    beat_grid = []
    if duration_seconds > 0:
        first_tempo = tempo_changes[0]["tempo"]
        seconds_per_beat = first_tempo / 1_000_000
        max_beats = min(800, math.ceil(duration_seconds / seconds_per_beat) + 1)
        numerator = time_signatures[0].get("numerator", 4)
        for beat in range(max_beats):
            second = round(beat * seconds_per_beat, 4)
            if second <= duration_seconds:
                beat_grid.append({"seconds": second, "beat": beat + 1, "isMeasure": beat % numerator == 0})

    return {
        "meta": {"format": mid.type, "ticksPerBeat": ticks_per_beat, "trackCount": len(mid.tracks)},
        "summary": {
            "tempoBpm": tempo_changes[0]["bpm"],
            "tempoChanges": tempo_changes,
            "timeSignature": time_signatures[0]["display"],
            "timeSignatureChanges": time_signatures,
            "noteRange": {
                "min": min_pitch,
                "max": max_pitch,
                "display": f"{pitch_to_name(min_pitch)} to {pitch_to_name(max_pitch)}" if total_notes else "N/A",
            },
            "noteDensity": density,
            "durationSeconds": round(duration_seconds, 2),
            "totalNotes": total_notes,
            "averageVelocity": average_velocity,
        },
        "tracks": track_summaries,
        "instruments": [{"name": name, "count": count} for name, count in instrument_counts.most_common()],
        "difficultPassages": difficult_passages,
        "beatGrid": beat_grid,
        "notes": notes,
    }


@app.get("/api/health")
def health() -> Any:
    return jsonify({"status": "ok", "service": "MidiLens API"})


@app.post("/api/analyze")
def analyze_midi() -> Any:
    uploaded_file = request.files.get("file")
    if uploaded_file is None:
        return jsonify({"error": "No file uploaded."}), 400

    filename = uploaded_file.filename or ""
    if not filename.lower().endswith((".mid", ".midi")):
        return jsonify({"error": "Please upload a valid MIDI file (.mid or .midi)."}), 400

    try:
        file_bytes = uploaded_file.read()
        midi = MidiFile(file=io.BytesIO(file_bytes))
        analysis = extract_notes(midi)
        analysis["fileName"] = filename
        return jsonify(analysis)
    except Exception as exc:
        return jsonify({"error": f"Could not parse MIDI file: {exc}"}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)
