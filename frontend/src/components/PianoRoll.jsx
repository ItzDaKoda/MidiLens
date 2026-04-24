import { useEffect, useMemo, useRef, useState } from 'react';

const BASE_WIDTH = 1100;
const SVG_HEIGHT = 420;
const LOOKAHEAD_SECONDS = 0.12;

function midiToFrequency(midiNote) {
  return 440 * (2 ** ((midiNote - 69) / 12));
}

function formatTime(seconds) {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const mins = Math.floor(safe / 60);
  const secs = (safe % 60).toFixed(2).padStart(5, '0');
  return `${mins}:${secs}`;
}

export default function PianoRoll({ notes, durationSeconds }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [audioReady, setAudioReady] = useState(false);

  const animationRef = useRef(null);
  const startStampRef = useRef(0);
  const offsetRef = useRef(0);
  const audioContextRef = useRef(null);
  const gainNodeRef = useRef(null);
  const startedOscillatorsRef = useRef(new Set());
  const activeOscillatorsRef = useRef(new Map());
  const draggingRef = useRef(false);

  const melodicNotes = useMemo(() => notes.filter((note) => !note.isDrum), [notes]);
  const minPitch = useMemo(() => {
    if (!melodicNotes.length) return 60;
    return Math.min(...melodicNotes.map((note) => note.pitch));
  }, [melodicNotes]);
  const maxPitch = useMemo(() => {
    if (!melodicNotes.length) return 72;
    return Math.max(...melodicNotes.map((note) => note.pitch));
  }, [melodicNotes]);
  const pitchRange = Math.max(1, maxPitch - minPitch + 1);
  const svgWidth = Math.max(BASE_WIDTH, BASE_WIDTH * zoom);

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      stopAllOscillators();
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    handleStop();
  }, [notes]);

  function stopAllOscillators() {
    activeOscillatorsRef.current.forEach(({ oscillator, gainNode }) => {
      try {
        gainNode.gain.cancelScheduledValues(0);
        gainNode.gain.setValueAtTime(gainNode.gain.value || 0.0001, 0);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, (audioContextRef.current?.currentTime || 0) + 0.03);
        oscillator.stop((audioContextRef.current?.currentTime || 0) + 0.04);
      } catch {
        // Ignore stop errors from already-ended oscillators.
      }
    });
    activeOscillatorsRef.current.clear();
    startedOscillatorsRef.current.clear();
  }

  async function ensureAudioContext() {
    if (!audioContextRef.current) {
      const context = new window.AudioContext();
      const gainNode = context.createGain();
      gainNode.gain.value = 0.14;
      gainNode.connect(context.destination);
      audioContextRef.current = context;
      gainNodeRef.current = gainNode;
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    setAudioReady(true);
    return audioContextRef.current;
  }

  function scheduleNotes(windowStart, windowEnd) {
    const context = audioContextRef.current;
    const output = gainNodeRef.current;
    if (!context || !output) return;

    const now = context.currentTime;

    melodicNotes.forEach((note, index) => {
      const noteId = `${note.pitch}-${note.startSeconds}-${index}`;
      if (startedOscillatorsRef.current.has(noteId)) return;
      if (note.startSeconds < windowStart || note.startSeconds >= windowEnd) return;

      const offsetSeconds = Math.max(0, note.startSeconds - currentTime);
      const attackTime = now + offsetSeconds;
      const releaseTime = attackTime + Math.max(0.05, note.durationSeconds);

      const oscillator = context.createOscillator();
      const noteGain = context.createGain();
      oscillator.type = note.velocity > 90 ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(midiToFrequency(note.pitch), attackTime);

      noteGain.gain.setValueAtTime(0.0001, attackTime);
      noteGain.gain.exponentialRampToValueAtTime(0.04, attackTime + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, releaseTime);

      oscillator.connect(noteGain);
      noteGain.connect(output);
      oscillator.start(attackTime);
      oscillator.stop(releaseTime + 0.03);
      oscillator.onended = () => activeOscillatorsRef.current.delete(noteId);

      activeOscillatorsRef.current.set(noteId, { oscillator, gainNode: noteGain, releaseTime });
      startedOscillatorsRef.current.add(noteId);
    });

    activeOscillatorsRef.current.forEach((entry, noteId) => {
      if (entry.releaseTime <= now - 0.05) {
        activeOscillatorsRef.current.delete(noteId);
      }
    });
  }

  function tick(timestamp) {
    if (!startStampRef.current) startStampRef.current = timestamp;
    const elapsed = (timestamp - startStampRef.current) / 1000;
    const nextTime = offsetRef.current + elapsed;

    if (nextTime >= durationSeconds) {
      setCurrentTime(durationSeconds);
      setPlaying(false);
      offsetRef.current = 0;
      startStampRef.current = 0;
      stopAllOscillators();
      return;
    }

    setCurrentTime(nextTime);
    scheduleNotes(nextTime, nextTime + LOOKAHEAD_SECONDS);
    animationRef.current = requestAnimationFrame(tick);
  }

  async function handlePlayPause() {
    if (!melodicNotes.length || durationSeconds <= 0) return;

    if (playing) {
      setPlaying(false);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      offsetRef.current = currentTime;
      startStampRef.current = 0;
      stopAllOscillators();
      return;
    }

    await ensureAudioContext();
    stopAllOscillators();
    startedOscillatorsRef.current = new Set(
      melodicNotes
        .map((note, index) => ({ note, index }))
        .filter(({ note }) => note.startSeconds < currentTime)
        .map(({ note, index }) => `${note.pitch}-${note.startSeconds}-${index}`),
    );
    setPlaying(true);
    animationRef.current = requestAnimationFrame(tick);
  }

  function handleStop() {
    setPlaying(false);
    setCurrentTime(0);
    offsetRef.current = 0;
    startStampRef.current = 0;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    stopAllOscillators();
  }

  function seekTo(nextTime) {
    const clampedTime = Math.max(0, Math.min(durationSeconds, nextTime));
    setCurrentTime(clampedTime);
    offsetRef.current = clampedTime;
    startStampRef.current = 0;
    stopAllOscillators();

    startedOscillatorsRef.current = new Set(
      melodicNotes
        .map((note, index) => ({ note, index }))
        .filter(({ note }) => note.startSeconds < clampedTime)
        .map(({ note, index }) => `${note.pitch}-${note.startSeconds}-${index}`),
    );
  }

  function handleTimelineChange(event) {
    const nextTime = Number(event.target.value);
    draggingRef.current = true;
    seekTo(nextTime);
  }

  function handleTimelineCommit() {
    draggingRef.current = false;
  }

  const playheadX = durationSeconds > 0 ? (currentTime / durationSeconds) * svgWidth : 0;

  return (
    <div>
      <div className="controls-row playback-stack">
        <div className="controls-row">
          <button onClick={handlePlayPause} disabled={!melodicNotes.length}>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button onClick={handleStop} className="secondary-btn">Stop</button>
          <span className="muted-text">
            {formatTime(currentTime)} / {formatTime(durationSeconds)}
          </span>
        </div>

        <div className="controls-row timeline-row">
          <label htmlFor="timeline" className="muted-text">Timeline</label>
          <input
            id="timeline"
            type="range"
            min="0"
            max={durationSeconds || 0}
            step="0.01"
            value={currentTime}
            onChange={handleTimelineChange}
            onMouseUp={handleTimelineCommit}
            onTouchEnd={handleTimelineCommit}
            className="timeline-slider"
          />
        </div>

        <div className="controls-row zoom-row">
          <label htmlFor="zoom" className="muted-text">Zoom</label>
          <input
            id="zoom"
            type="range"
            min="1"
            max="4"
            step="0.25"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="zoom-slider"
          />
          <span className="muted-text">{zoom.toFixed(2)}×</span>
          <span className="muted-text">{audioReady ? 'Synth ready' : 'Click play to enable sound'}</span>
        </div>
      </div>

      <div className="piano-roll-wrap">
        <svg
          viewBox={`0 0 ${svgWidth} ${SVG_HEIGHT}`}
          role="img"
          aria-label="Piano roll visualization"
        >
          <rect x="0" y="0" width={svgWidth} height={SVG_HEIGHT} fill="#0f172a" rx="16" />

          {Array.from({ length: 16 }).map((_, index) => {
            const x = (index / 16) * svgWidth;
            return (
              <line
                key={`grid-${index}`}
                x1={x}
                y1="0"
                x2={x}
                y2={SVG_HEIGHT}
                stroke="rgba(255,255,255,0.08)"
              />
            );
          })}

          {Array.from({ length: Math.min(pitchRange, 24) + 1 }).map((_, index) => {
            const y = (index / Math.min(pitchRange, 24)) * (SVG_HEIGHT - 40) + 20;
            return (
              <line
                key={`h-grid-${index}`}
                x1="0"
                y1={y}
                x2={svgWidth}
                y2={y}
                stroke="rgba(255,255,255,0.06)"
              />
            );
          })}

          {melodicNotes.map((note, index) => {
            const x = durationSeconds > 0 ? (note.startSeconds / durationSeconds) * svgWidth : 0;
            const width = durationSeconds > 0 ? Math.max(4, (note.durationSeconds / durationSeconds) * svgWidth) : 4;
            const y = ((maxPitch - note.pitch) / pitchRange) * (SVG_HEIGHT - 40) + 20;
            const isPassed = currentTime >= note.endSeconds;
            const isActive = currentTime >= note.startSeconds && currentTime <= note.endSeconds;
            return (
              <rect
                key={`${note.pitch}-${note.startTick}-${index}`}
                x={x}
                y={y}
                width={width}
                height="10"
                rx="4"
                fill={isActive ? '#f59e0b' : note.velocity > 90 ? '#38bdf8' : '#818cf8'}
                opacity={isPassed ? '0.35' : '0.9'}
              />
            );
          })}

          <line x1={playheadX} y1="0" x2={playheadX} y2={SVG_HEIGHT} stroke="#f97316" strokeWidth="3" />
        </svg>
      </div>

      <p className="muted-text piano-roll-note">
        Playback uses a built-in browser synth for melodic tracks so the playhead, seek bar, and piano roll stay in sync.
      </p>
    </div>
  );
}
