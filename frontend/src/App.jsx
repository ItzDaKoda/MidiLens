import { useMemo, useState } from "react";
import { Activity, BarChart3, Clock, FileAudio, Gauge, Music2, Sparkles, UploadCloud, Waves } from "lucide-react";
import PianoRoll from "./components/PianoRoll.jsx";

const API_URL = "http://127.0.0.1:5000/api/analyze";

function formatTime(seconds = 0) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
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

  async function handleFile(file) {
    if (!file) return;
    setFileName(file.name);
    setError("");
    setLoading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to analyze MIDI file.");
      }

      setAnalysis(data);
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }

  const summary = analysis?.summary;
  const topInstrument = useMemo(() => analysis?.instruments?.[0]?.name || "None yet", [analysis]);

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
        </div>

        <label className={`upload-zone ${loading ? "is-loading" : ""}`}>
          <input
            type="file"
            accept=".mid,.midi"
            onChange={(event) => handleFile(event.target.files?.[0])}
          />
          <UploadCloud size={42} />
          <strong>{loading ? "Analyzing your MIDI..." : "Drop in a MIDI file"}</strong>
          <span>{fileName || "Choose a .mid or .midi file to begin"}</span>
        </label>
      </section>

      {error && <div className="error-box">{error}</div>}

      {analysis ? (
        <>
          <section className="dashboard-grid">
            <StatCard icon={Gauge} label="Tempo" value={`${summary.tempoBpm} BPM`} detail={summary.timeSignature} />
            <StatCard icon={Clock} label="Duration" value={formatTime(summary.durationSeconds)} detail={`${summary.durationSeconds}s total`} />
            <StatCard icon={Music2} label="Note Range" value={summary.noteRange.display} detail={`${summary.totalNotes} notes`} />
            <StatCard icon={Activity} label="Density" value={`${summary.noteDensity}/sec`} detail={`Avg velocity ${summary.averageVelocity}`} />
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
          <p>Start by uploading a MIDI file. MidiLens will extract notes, timing, instruments, density, difficult passages, and playback data.</p>
        </section>
      )}
    </main>
  );
}
