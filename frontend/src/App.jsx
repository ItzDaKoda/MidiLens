import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Clock,
  Database,
  FileAudio,
  Gauge,
  History,
  KeyRound,
  Music2,
  PlayCircle,
  Sparkles,
  Trash2,
  UploadCloud,
  Waves,
} from "lucide-react";
import PianoRoll from "./components/PianoRoll.jsx";

const API_URL = import.meta.env.VITE_API_URL || "/api/analyze";
const OPTIONAL_API_KEY = import.meta.env.VITE_OPTIONAL_API_KEY || "";
const RECENT_KEY = "midilensRecentAnalyses";
const MAX_RECENTS = 5;

function formatTime(seconds = 0) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "Recently";
  }
}

function StatCard({ icon: Icon, label, value, detail }) {
  return (
    <article className="stat-card">
      <div className="stat-icon"><Icon size={20} /></div>
      <div>
        <p>{label}</p>
        <h3>{value}</h3>
        {detail && <span>{detail}</span>}
      </div>
    </article>
  );
}

export default function App() {
  const [analysis, setAnalysis] = useState(null);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recentAnalyses, setRecentAnalyses] = useState([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      setRecentAnalyses(Array.isArray(saved) ? saved : []);
    } catch {
      setRecentAnalyses([]);
    }
  }, []);

  function saveRecent(data) {
    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`,
      fileName: data.fileName || "Untitled MIDI",
      savedAt: new Date().toISOString(),
      analysis: data,
    };

    setRecentAnalyses((current) => {
      const next = [entry, ...current.filter((item) => item.fileName !== entry.fileName)].slice(0, MAX_RECENTS);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        // If localStorage is full, keep the current page working without crashing.
      }
      return next;
    });
  }

  async function analyzeFile(file) {
    if (!file) return;
    setFileName(file.name);
    setError("");
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const headers = {};
      if (OPTIONAL_API_KEY) headers["X-API-Key"] = OPTIONAL_API_KEY;

      const response = await fetch(API_URL, {
        method: "POST",
        body: formData,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to analyze MIDI file.");
      }

      setAnalysis(data);
      saveRecent(data);
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadDemoMidi() {
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/demo/BackInBlack.mid");
      if (!response.ok) throw new Error("Could not load the demo MIDI file.");
      const blob = await response.blob();
      const file = new File([blob], "BackInBlack.mid", { type: "audio/midi" });
      await analyzeFile(file);
    } catch (err) {
      setError(err.message || "Could not load demo MIDI.");
      setLoading(false);
    }
  }

  function loadRecent(item) {
    setAnalysis(item.analysis);
    setFileName(item.fileName);
    setError("");
  }

  function clearRecent() {
    localStorage.removeItem(RECENT_KEY);
    setRecentAnalyses([]);
  }

  const summary = analysis?.summary;
  const topInstrument = useMemo(() => analysis?.instruments?.[0]?.name || "None yet", [analysis]);
  const activeTrackCount = useMemo(
    () => analysis?.tracks?.filter((track) => track.noteCount > 0).length || 0,
    [analysis]
  );

  return (
    <main className="app-shell">
      <section className="hero-grid">
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={16} /> Capstone Project</div>
          <h1>MidiLens</h1>
          <p className="subtitle">
            Upload a MIDI file, inspect the musical structure, and practice with a synchronized piano-roll playback view.
          </p>
          <div className="hero-tags">
            <span>Full-stack MIDI parser</span>
            <span>Web Audio playback</span>
            <span>Interactive visualization</span>
          </div>

          <div className="quick-actions">
            <button type="button" className="demo-button" onClick={loadDemoMidi} disabled={loading}>
              <PlayCircle size={18} /> Load demo MIDI
            </button>
            <div className="api-note">
              <KeyRound size={16} /> API key slot ready in <code>.env.example</code>
            </div>
          </div>
        </div>

        <label className={`upload-zone ${loading ? "is-loading" : ""}`}>
          <input
            type="file"
            accept=".mid,.midi"
            onChange={(event) => analyzeFile(event.target.files?.[0])}
          />
          <UploadCloud size={42} />
          <strong>{loading ? "Analyzing your MIDI..." : "Drop in a MIDI file"}</strong>
          <span>{fileName || "Choose a .mid or .midi file to begin"}</span>
        </label>
      </section>

      {error && <div className="error-box">{error}</div>}

      <section className="library-panel glass-panel">
        <div className="panel-heading small">
          <div>
            <p className="section-kicker">Library</p>
            <h2>Recently Loaded MIDI Files</h2>
          </div>
          <History />
        </div>

        {recentAnalyses.length ? (
          <>
            <div className="library-grid">
              {recentAnalyses.map((item) => (
                <button key={item.id} className="library-card" onClick={() => loadRecent(item)}>
                  <FileAudio size={20} />
                  <span>{item.fileName}</span>
                  <small>{formatDate(item.savedAt)}</small>
                </button>
              ))}
            </div>
            <button type="button" className="clear-library" onClick={clearRecent}>
              <Trash2 size={15} /> Clear recent list
            </button>
          </>
        ) : (
          <p className="muted">Uploaded and demo MIDI analyses will appear here so you can reload them during your demo.</p>
        )}
      </section>

      {analysis ? (
        <>
          <section className="dashboard-grid">
            <StatCard icon={Gauge} label="Tempo" value={`${summary.tempoBpm} BPM`} detail={summary.timeSignature} />
            <StatCard icon={Clock} label="Duration" value={formatTime(summary.durationSeconds)} detail={`${summary.durationSeconds}s total`} />
            <StatCard icon={Music2} label="Note Range" value={summary.noteRange.display} detail={`${summary.totalNotes} notes`} />
            <StatCard icon={Activity} label="Density" value={`${summary.noteDensity}/sec`} detail={`Avg velocity ${summary.averageVelocity}`} />
            <StatCard icon={Database} label="Tracks" value={activeTrackCount} detail={`${analysis.meta.trackCount} total MIDI tracks`} />
          </section>

          <section className="content-grid">
            <div className="glass-panel wide-panel">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">Analyzer</p>
                  <h2>{analysis.fileName}</h2>
                </div>
                <FileAudio />
              </div>
              <PianoRoll analysis={analysis} />
            </div>

            <aside className="side-stack">
              <div className="glass-panel">
                <div className="panel-heading small"><h2>Song Details</h2><Gauge /></div>
                <div className="detail-list">
                  <div><span>Tempo</span><strong>{summary.tempoBpm} BPM</strong></div>
                  <div><span>Time Signature</span><strong>{summary.timeSignature}</strong></div>
                  <div><span>Ticks Per Beat</span><strong>{analysis.meta.ticksPerBeat}</strong></div>
                  <div><span>MIDI Format</span><strong>Type {analysis.meta.format}</strong></div>
                </div>
              </div>

              <div className="glass-panel">
                <div className="panel-heading small"><h2>Top Sounds</h2><Waves /></div>
                <p className="muted">Most frequent instrument: <strong>{topInstrument}</strong></p>
                <div className="instrument-list">
                  {analysis.instruments.slice(0, 6).map((item) => (
                    <div key={item.name}>
                      <span>{item.name}</span>
                      <strong>{item.count}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel">
                <div className="panel-heading small"><h2>Difficult Passages</h2><BarChart3 /></div>
                <div className="passage-list">
                  {analysis.difficultPassages.map((passage, index) => (
                    <div key={`${passage.start}-${passage.end}`} className="passage-card">
                      <span>#{index + 1}</span>
                      <div>
                        <strong>{formatTime(passage.start)} - {formatTime(passage.end)}</strong>
                        <p>{passage.notes} notes in this section</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-panel">
                <div className="panel-heading small"><h2>Tracks</h2><Music2 /></div>
                <div className="track-list">
                  {analysis.tracks.filter((track) => track.noteCount > 0).slice(0, 8).map((track) => (
                    <div key={track.index}>
                      <strong>{track.name}</strong>
                      <span>{track.noteCount} notes • {track.instruments.join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </section>
        </>
      ) : (
        <section className="empty-state">
          <Music2 size={46} />
          <h2>Ready for analysis</h2>
          <p>Start by uploading a MIDI file or load the built-in demo. MidiLens will extract notes, timing, instruments, density, difficult passages, and playback data.</p>
        </section>
      )}
    </main>
  );
}
