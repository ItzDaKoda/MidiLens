import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, RotateCcw, Square } from "lucide-react";
import * as Tone from "tone";

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

      if ((!duration || duration <= 0) && end !== null) {
        duration = Number(end) - Number(start);
      }

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
    .filter(
      (note) =>
        Number.isFinite(note.pitch) &&
        Number.isFinite(note.start) &&
        Number.isFinite(note.duration) &&
        note.duration > 0
    )
    .sort((a, b) => a.start - b.start);
}

export default function PianoRoll({ analysis }) {

  const synthRef = useRef(null);
  const drumSynthRef = useRef(null);
  const reverbRef = useRef(null);
  const compressorRef = useRef(null);
  const limiterRef = useRef(null);

  const animationRef = useRef(null);
  const schedulerRef = useRef(null);
  const nextNoteIndexRef = useRef(0);
  const playbackStartRef = useRef(0);

  const [isPlaying, setIsPlaying] = useState(false);
  const [playheadTime, setPlayheadTime] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [zoom, setZoom] = useState(95);
  const [soloMelody, setSoloMelody] = useState(true);

  // 🎛 SOUND PRESET STATE
  const [soundPreset, setSoundPreset] = useState("classic");

  const notes = useMemo(() => normalizeNotes(analysis), [analysis]);

  const playableNotes = useMemo(
    () => (soloMelody ? notes.filter((note) => !note.isDrum) : notes),
    [notes, soloMelody]
  );

  const visualNotes = notes;

  const duration = useMemo(() => {
    if (!notes.length) return 1;
    return Math.max(...notes.map((note) => note.start + note.duration), 1);
  }, [notes]);

  const melodicNotes = useMemo(() => notes.filter((note) => !note.isDrum), [notes]);
  const pitchSource = melodicNotes.length ? melodicNotes : notes;

  const minPitch = pitchSource.length
    ? Math.min(...pitchSource.map((note) => note.pitch))
    : 48;

  const maxPitch = pitchSource.length
    ? Math.max(...pitchSource.map((note) => note.pitch))
    : 84;

  const pitchRange = maxPitch - minPitch + 1;

  const rowHeight = 16;

  const rollHeight = Math.max(
    340,
    pitchRange * rowHeight
  );

  const rollWidth = Math.max(
    980,
    duration * zoom
  );

  const beatGrid = analysis?.beatGrid || [];

  function disposeAudio() {
    synthRef.current?.dispose();
    drumSynthRef.current?.dispose();
    reverbRef.current?.dispose();
    compressorRef.current?.dispose();
    limiterRef.current?.dispose();
  }

  function setupSynthAudio() {

    disposeAudio();

    limiterRef.current =
      new Tone.Limiter(-1).toDestination();

    reverbRef.current =
      new Tone.Reverb({
        decay: 1.6,
        wet: 0.12,
      }).connect(limiterRef.current);

    compressorRef.current =
      new Tone.Compressor({
        threshold: -18,
        ratio: 3,
        attack: 0.02,
        release: 0.2,
      }).connect(reverbRef.current);

    let synthOptions;

    if (soundPreset === "soft") {

      synthOptions = {
        oscillator: { type: "sine" },
        envelope: {
          attack: 0.02,
          decay: 0.18,
          sustain: 0.5,
          release: 0.6,
        },
      };

    } else if (soundPreset === "bright") {

      synthOptions = {
        oscillator: { type: "square" },
        envelope: {
          attack: 0.005,
          decay: 0.12,
          sustain: 0.35,
          release: 0.3,
        },
      };

    } else {

      synthOptions = {
        oscillator: { type: "triangle" },
        envelope: {
          attack: 0.008,
          decay: 0.16,
          sustain: 0.45,
          release: 0.45,
        },
      };

    }

    synthRef.current =
      new Tone.PolySynth(
        Tone.Synth,
        synthOptions
      ).connect(compressorRef.current);

    drumSynthRef.current =
      new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: {
          attack: 0.001,
          decay: 0.12,
          sustain: 0,
          release: 0.05,
        },
      }).connect(compressorRef.current);

    synthRef.current.volume.value =
      Tone.gainToDb(
        Math.max(volume, 0.01)
      );

    drumSynthRef.current.volume.value =
      Tone.gainToDb(
        Math.max(volume * 0.45, 0.01)
      );
  }

  // 🔁 Rebuild synth when preset changes
  useEffect(() => {

    setupSynthAudio();

    return () => {
      Tone.Transport.stop();
      Tone.Transport.cancel();
      disposeAudio();
    };

  }, [soundPreset]);

  useEffect(() => {

    if (synthRef.current) {
      synthRef.current.volume.value =
        Tone.gainToDb(
          Math.max(volume, 0.01)
        );
    }

  }, [volume]);

  function clearScheduledAudio() {

    Tone.Transport.stop();
    Tone.Transport.cancel();

    if (schedulerRef.current) {
      clearInterval(
        schedulerRef.current
      );
      schedulerRef.current = null;
    }

    if (animationRef.current) {
      cancelAnimationFrame(
        animationRef.current
      );
      animationRef.current = null;
    }

  }

  function stopPlayback(reset = true) {

    clearScheduledAudio();
    setIsPlaying(false);

    if (reset) {
      setPlayheadTime(0);
    }

  }

  function scheduleNote(
    note,
    transportTime,
    playableDuration
  ) {

    if (note.isDrum && soloMelody)
      return;

    const midiNote =
      Tone.Frequency(
        note.pitch,
        "midi"
      ).toNote();

    const velocity =
      Math.min(
        1,
        Math.max(
          0.08,
          note.velocity / 127
        )
      );

    const safeDuration =
      Math.max(
        playableDuration,
        0.05
      );

    Tone.Transport.schedule((time) => {

      if (
        note.isDrum &&
        drumSynthRef.current
      ) {

        drumSynthRef.current
          .triggerAttackRelease(
            "16n",
            time,
            velocity
          );

      } else if (synthRef.current) {

        synthRef.current
          .triggerAttackRelease(
            midiNote,
            safeDuration,
            time,
            velocity
          );

      }

    }, transportTime);
  }

  async function playPlayback() {

    if (!playableNotes.length)
      return;

    await Tone.start();

    clearScheduledAudio();

    const startFrom =
      playheadTime >= duration
        ? 0
        : playheadTime;

    playbackStartRef.current =
      Tone.now();

    nextNoteIndexRef.current =
      playableNotes.findIndex(
        (note) =>
          note.start +
            note.duration >=
          startFrom
      );

    if (
      nextNoteIndexRef.current < 0
    ) {
      nextNoteIndexRef.current = 0;
    }

    setIsPlaying(true);

    const lookAheadSeconds = 1.2;

    const scheduler = () => {

      const elapsed =
        Tone.now() -
        playbackStartRef.current;

      const currentSongTime =
        startFrom + elapsed;

      const scheduleUntil =
        currentSongTime +
        lookAheadSeconds;

      while (
        nextNoteIndexRef.current <
          playableNotes.length &&
        playableNotes[
          nextNoteIndexRef.current
        ].start <= scheduleUntil
      ) {

        const note =
          playableNotes[
            nextNoteIndexRef.current
          ];

        if (
          note.start +
            note.duration >=
          startFrom
        ) {

          const transportTime =
            Math.max(
              0,
              note.start - startFrom
            );

          const playableDuration =
            note.start < startFrom
              ? note.duration -
                (startFrom -
                  note.start)
              : note.duration;

          if (
            playableDuration > 0
          ) {

            scheduleNote(
              note,
              transportTime,
              playableDuration
            );

          }

        }

        nextNoteIndexRef.current += 1;

      }

    };

    scheduler();

    schedulerRef.current =
      setInterval(
        scheduler,
        120
      );

    Tone.Transport.seconds = 0;
    Tone.Transport.start("+0.05");

    const animate = () => {

      const elapsed =
        Tone.now() -
        playbackStartRef.current;

      const newTime =
        startFrom + elapsed;

      if (newTime >= duration) {

        stopPlayback(true);
        return;

      }

      setPlayheadTime(
        Math.max(
          0,
          Math.min(newTime, duration)
        )
      );

      animationRef.current =
        requestAnimationFrame(
          animate
        );

    };

    animationRef.current =
      requestAnimationFrame(
        animate
      );

  }

  function pausePlayback() {

    clearScheduledAudio();
    setIsPlaying(false);

  }

  useEffect(() => {
    return () => stopPlayback();
  }, []);

  if (!notes.length) {

    return (
      <div className="piano-empty">
        No notes found in this file.
      </div>
    );

  }

  return (

    <div className="piano-shell">

      <div className="transport-bar">

        <div className="transport-left">

          <button
            className="primary-control"
            onClick={
              isPlaying
                ? pausePlayback
                : playPlayback
            }
          >

            {isPlaying
              ? <Pause size={18} />
              : <Play size={18} />}

            {isPlaying
              ? "Pause"
              : "Play"}

          </button>

          <button
            className="ghost-control"
            onClick={() =>
              stopPlayback(true)
            }
          >
            <Square size={16} />
            Stop
          </button>

          <button
            className="ghost-control"
            onClick={() =>
              setPlayheadTime(0)
            }
          >
            <RotateCcw size={16} />
            Reset
          </button>

        </div>

        <div className="time-readout">

          {formatTime(playheadTime)}
          {" / "}
          {formatTime(duration)}

        </div>

      </div>

      <input
        className="timeline-slider"
        type="range"
        min="0"
        max={duration}
        step="0.01"
        value={playheadTime}
        onChange={(e) =>
          setPlayheadTime(
            Number(e.target.value)
          )
        }
      />

      <div className="control-row">

        <label>

          Sound

          <select
            value={soundPreset}
            onChange={(e) =>
              setSoundPreset(
                e.target.value
              )
            }
          >

            <option value="classic">
              Classic Synth
            </option>

            <option value="soft">
              Soft Synth
            </option>

            <option value="bright">
              8-Bit Bright
            </option>

          </select>

        </label>

        <label>
          Volume
          <input
            type="range"
            min="0.01"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) =>
              setVolume(
                Number(e.target.value)
              )
            }
          />
        </label>

        <label>
          Zoom
          <input
            type="range"
            min="45"
            max="180"
            step="5"
            value={zoom}
            onChange={(e) =>
              setZoom(
                Number(e.target.value)
              )
            }
          />
        </label>

        <label className="toggle-line">
          <input
            type="checkbox"
            checked={soloMelody}
            onChange={(e) =>
              setSoloMelody(
                e.target.checked
              )
            }
          />
          Skip drum channel
        </label>

      </div>

      <div className="piano-roll-scroll">

        <div
          className="piano-roll-canvas"
          style={{
            width: `${rollWidth}px`,
            height: `${rollHeight}px`
          }}
        >

          {visualNotes.map(
            (note, index) => {

              const left =
                note.start * zoom;

              const width =
                Math.max(
                  note.duration * zoom,
                  4
                );

              const top =
                (maxPitch -
                  note.pitch) *
                rowHeight;

              const isActive =
                playheadTime >=
                  note.start &&
                playheadTime <=
                  note.start +
                    note.duration;

              return (

                <div
                  key={`${note.pitch}-${note.start}-${index}`}
                  className={`piano-note ${note.isDrum ? "drum" : ""} ${isActive ? "active" : ""}`}
                  style={{
                    left: `${left}px`,
                    top: `${top}px`,
                    width: `${width}px`,
                    height: `${rowHeight - 3}px`
                  }}
                />

              );

            }
          )}

          <div
            className="playhead"
            style={{
              left: `${playheadTime * zoom}px`
            }}
          />

        </div>

      </div>

    </div>

  );
}