import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";

function midiToFrequency(midiNote) {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
}

function formatTime(seconds = 0) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function normalizeNotes(input) {
  const rawNotes = input?.notes || input?.analysis?.notes || [];
  return rawNotes
    .map((note) => {
      const start = note.startSeconds ?? note.start_seconds ?? note.start ?? 0;
      const end = note.endSeconds ?? note.end_seconds ?? note.end ?? null;
      let duration = note.durationSeconds ?? note.duration_seconds ?? note.duration ?? null;
      if ((!duration || duration <= 0) && end !== null) duration = Number(end) - Number(start);
      return {
        pitch: Number(note.pitch ?? note.note ?? note.midiNote),
        pitchName: note.pitchName || `MIDI ${note.pitch}`,
        start: Number(start),
        duration: Number(duration || 0.1),
        velocity: Number(note.velocity ?? 90),
        isDrum: Boolean(note.isDrum),
        instrument: note.instrument || "Unknown",
      };
    })
    .filter((note) => Number.isFinite(note.pitch) && Number.isFinite(note.start) && Number.isFinite(note.duration) && note.duration > 0)
    .sort((a, b) => a.start - b.start);
}

export default function PianoRoll({ analysis }) {
  const audioContextRef = useRef(null);
  const masterGainRef = useRef(null);
  const animationRef = useRef(null);
  const schedulerRef = useRef(null);
  const activeNodesRef = useRef([]);
  const nextNoteIndexRef = useRef(0);
  const playbackStartRef = useRef(0);
  const startFromRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [zoom, setZoom] = useState(95);
  const [soloMelody, setSoloMelody] = useState(true);

  const notes = useMemo(() => normalizeNotes(analysis), [analysis]);
  const playableNotes = useMemo(() => (soloMelody ? notes.filter((note) => !note.isDrum) : notes), [notes, soloMelody]);
  const visualNotes = notes;

  const duration = useMemo(() => {
    if (!notes.length) return 1;
    return Math.max(...notes.map((note) => note.start + note.duration), 1);
  }, [notes]);

  const melodicNotes = useMemo(() => notes.filter((note) => !note.isDrum), [notes]);
  const pitchSource = melodicNotes.length ? melodicNotes : notes;
  const minPitch = pitchSource.length ? Math.min(...pitchSource.map((note) => note.pitch)) : 48;
  const maxPitch = pitchSource.length ? Math.max(...pitchSource.map((note) => note.pitch)) : 84;
  const pitchRange = maxPitch - minPitch + 1;
  const rowHeight = 16;
  const rollHeight = Math.max(340, pitchRange * rowHeight);
  const rollWidth = Math.max(980, duration * zoom);
  const beatGrid = analysis?.beatGrid || [];

  useEffect(() => {
    if (masterGainRef.current) {
      masterGainRef.current.gain.value = volume;
    }
  }, [volume]);

  function setupAudio() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
      masterGainRef.current = audioContextRef.current.createGain();
      masterGainRef.current.gain.value = volume;
      masterGainRef.current.connect(audioContextRef.current.destination);
    }
    return audioContextRef.current;
  }

  function clearScheduledAudio() {
    activeNodesRef.current.forEach((node) => {
      try { node.stop(); } catch { }
    });
    activeNodesRef.current = [];
    if (schedulerRef.current) clearInterval(schedulerRef.current);
    schedulerRef.current = null;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
  }

  function stopPlayback(reset = true) {
    clearScheduledAudio();
    setIsPlaying(false);
    if (reset) setPlayheadTime(0);
  }

  function scheduleNote(audioContext, note, when, playableDuration) {
    if (note.isDrum && soloMelody) return;

    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const filter = audioContext.createBiquadFilter();

    oscillator.type = note.pitch < 48 ? "sawtooth" : note.pitch > 84 ? "sine" : "triangle";
    oscillator.frequency.setValueAtTime(midiToFrequency(note.pitch), when);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(note.pitch < 48 ? 900 : 2200, when);

    const velocityGain = Math.min(0.85, Math.max(0.08, note.velocity / 127));
    const end = when + Math.max(playableDuration, 0.05);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(velocityGain, when + 0.012);
    gain.gain.setValueAtTime(velocityGain * 0.7, Math.max(when + 0.02, end - 0.06));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainRef.current);

    oscillator.start(when);
    oscillator.stop(end + 0.04);
    activeNodesRef.current.push(oscillator);
  }

  async function playPlayback() {
    if (!playableNotes.length) return;
    clearScheduledAudio();

    const audioContext = setupAudio();
    if (audioContext.state === "suspended") await audioContext.resume();

    const startFrom = playheadTime >= duration ? 0 : playheadTime;
    startFromRef.current = startFrom;
    playbackStartRef.current = audioContext.currentTime + 0.09;
    nextNoteIndexRef.current = playableNotes.findIndex((note) => note.start + note.duration >= startFrom);
    if (nextNoteIndexRef.current < 0) nextNoteIndexRef.current = 0;

    setIsPlaying(true);

    const lookAheadSeconds = 0.9;
    const scheduler = () => {
      const now = audioContext.currentTime;
      const currentSongTime = startFrom + (now - playbackStartRef.current);
      const scheduleUntil = currentSongTime + lookAheadSeconds;

      while (nextNoteIndexRef.current < playableNotes.length && playableNotes[nextNoteIndexRef.current].start <= scheduleUntil) {
        const note = playableNotes[nextNoteIndexRef.current];
        if (note.start + note.duration >= startFrom) {
          const noteOffset = Math.max(0, note.start - startFrom);
          const scheduleTime = playbackStartRef.current + noteOffset;
          const playableDuration = note.start < startFrom ? note.duration - (startFrom - note.start) : note.duration;
          if (scheduleTime >= now - 0.05 && playableDuration > 0) scheduleNote(audioContext, note, scheduleTime, playableDuration);
        }
        nextNoteIndexRef.current += 1;
      }
    };

    scheduler();
    schedulerRef.current = setInterval(scheduler, 90);

    const animate = () => {
      const elapsed = audioContext.currentTime - playbackStartRef.current;
      const newTime = startFrom + elapsed;
      if (newTime >= duration) {
        stopPlayback(true);
        return;
      }
      setPlayheadTime(Math.max(0, Math.min(newTime, duration)));
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
  }

  function pausePlayback() {
    clearScheduledAudio();
    setIsPlaying(false);
  }

  useEffect(() => () => stopPlayback(), []);

  if (!notes.length) return <div className="piano-empty">No notes found in this file.</div>;

  return (
    <div className="piano-shell">
      <div className="transport-bar">
        <div className="transport-left">
          <button className="primary-control" onClick={isPlaying ? pausePlayback : playPlayback}>
            {isPlaying ? <Pause size={18} /> : <Play size={18} />} {isPlaying ? "Pause" : "Play"}
          </button>
          <button className="ghost-control" onClick={() => stopPlayback(true)}><Square size={16} /> Stop</button>
          <button className="ghost-control" onClick={() => setPlayheadTime(0)}><RotateCcw size={16} /> Reset</button>
        </div>
        <div className="time-readout">{formatTime(playheadTime)} / {formatTime(duration)}</div>
      </div>

      <input className="timeline-slider" type="range" min="0" max={duration} step="0.01" value={playheadTime} onChange={(e) => setPlayheadTime(Number(e.target.value))} />

      <div className="control-row">
        <label>Volume <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(Number(e.target.value))} /></label>
        <label>Zoom <input type="range" min="45" max="180" step="5" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} /></label>
        <label className="toggle-line"><input type="checkbox" checked={soloMelody} onChange={(e) => setSoloMelody(e.target.checked)} /> Skip drum channel</label>
      </div>

      <div className="piano-roll-scroll">
        <div className="piano-roll-canvas" style={{ width: `${rollWidth}px`, height: `${rollHeight}px` }}>
          {beatGrid.map((beat) => (
            <div key={`${beat.seconds}-${beat.beat}`} className={beat.isMeasure ? "measure-line" : "beat-line"} style={{ left: `${beat.seconds * zoom}px` }} />
          ))}

          {visualNotes.map((note, index) => {
            const left = note.start * zoom;
            const width = Math.max(note.duration * zoom, 4);
            const top = (maxPitch - note.pitch) * rowHeight;
            const isActive = playheadTime >= note.start && playheadTime <= note.start + note.duration;
            return (
              <div
                key={`${note.pitch}-${note.start}-${index}`}
                className={`piano-note ${note.isDrum ? "drum" : ""} ${isActive ? "active" : ""}`}
                style={{ left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${rowHeight - 3}px` }}
                title={`${note.pitchName} • ${note.instrument} • ${formatTime(note.start)}`}
              />
            );
          })}

          <div className="playhead" style={{ left: `${playheadTime * zoom}px` }} />
        </div>
      </div>
    </div>
  );
}
