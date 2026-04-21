import { useEffect, useMemo, useRef, useState } from 'react';

const SVG_WIDTH = 1100;
const SVG_HEIGHT = 420;

export default function PianoRoll({ notes, durationSeconds }) {
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const animationRef = useRef(null);
  const startStampRef = useRef(0);
  const offsetRef = useRef(0);

  const melodicNotes = useMemo(() => notes.filter((note) => !note.isDrum), [notes]);
  const minPitch = useMemo(() => Math.min(...melodicNotes.map((note) => note.pitch)), [melodicNotes]);
  const maxPitch = useMemo(() => Math.max(...melodicNotes.map((note) => note.pitch)), [melodicNotes]);
  const pitchRange = Math.max(1, maxPitch - minPitch + 1);

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  function tick(timestamp) {
    if (!startStampRef.current) startStampRef.current = timestamp;
    const elapsed = (timestamp - startStampRef.current) / 1000;
    const nextTime = offsetRef.current + elapsed;

    if (nextTime >= durationSeconds) {
      setCurrentTime(durationSeconds);
      setPlaying(false);
      offsetRef.current = 0;
      startStampRef.current = 0;
      return;
    }

    setCurrentTime(nextTime);
    animationRef.current = requestAnimationFrame(tick);
  }

  function handlePlayPause() {
    if (playing) {
      setPlaying(false);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      offsetRef.current = currentTime;
      startStampRef.current = 0;
      return;
    }

    setPlaying(true);
    animationRef.current = requestAnimationFrame(tick);
  }

  function handleStop() {
    setPlaying(false);
    setCurrentTime(0);
    offsetRef.current = 0;
    startStampRef.current = 0;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  }

  const playheadX = durationSeconds > 0 ? (currentTime / durationSeconds) * SVG_WIDTH : 0;

  return (
    <div>
      <div className="controls-row">
        <button onClick={handlePlayPause}>{playing ? 'Pause' : 'Play'}</button>
        <button onClick={handleStop} className="secondary-btn">Stop</button>
        <span className="muted-text">{currentTime.toFixed(2)}s / {durationSeconds.toFixed(2)}s</span>
      </div>

      <div className="piano-roll-wrap">
        <svg viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`} role="img" aria-label="Piano roll visualization">
          <rect x="0" y="0" width={SVG_WIDTH} height={SVG_HEIGHT} fill="#0f172a" rx="16" />

          {Array.from({ length: 12 }).map((_, index) => {
            const x = (index / 12) * SVG_WIDTH;
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

          {melodicNotes.map((note, index) => {
            const x = durationSeconds > 0 ? (note.startSeconds / durationSeconds) * SVG_WIDTH : 0;
            const width = durationSeconds > 0 ? Math.max(3, (note.durationSeconds / durationSeconds) * SVG_WIDTH) : 3;
            const y = ((maxPitch - note.pitch) / pitchRange) * (SVG_HEIGHT - 40) + 20;
            return (
              <rect
                key={`${note.pitch}-${note.startTick}-${index}`}
                x={x}
                y={y}
                width={width}
                height="10"
                rx="4"
                fill={note.velocity > 90 ? '#38bdf8' : '#818cf8'}
                opacity="0.9"
              />
            );
          })}

          <line x1={playheadX} y1="0" x2={playheadX} y2={SVG_HEIGHT} stroke="#f97316" strokeWidth="3" />
        </svg>
      </div>
    </div>
  );
}
