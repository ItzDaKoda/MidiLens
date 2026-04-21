import { useMemo, useState } from 'react';
import UploadPanel from './components/UploadPanel';
import SummaryCards from './components/SummaryCards';
import PianoRoll from './components/PianoRoll';
import TrackTable from './components/TrackTable';
import PassageList from './components/PassageList';

const API_URL = 'http://localhost:5000/api/analyze';

export default function App() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const instrumentsPreview = useMemo(() => {
    if (!analysis?.instruments?.length) return 'No instruments detected yet.';
    return analysis.instruments.slice(0, 5).map((item) => `${item.name} (${item.count})`).join(', ');
  }, [analysis]);

  async function handleUpload(file) {
    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(API_URL, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Upload failed.');
      }

      setAnalysis(data);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setAnalysis(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Capstone Project Prototype</p>
          <h1>MidiLens</h1>
          <p className="hero-copy">
            Upload a MIDI file to analyze tempo, time signature, note density, range, and track details,
            then practice with a piano-roll play-along view.
          </p>
        </div>
      </header>

      <main className="content-grid">
        <section className="panel">
          <UploadPanel onUpload={handleUpload} loading={loading} />
          {error && <p className="error-text">{error}</p>}
          {analysis && (
            <div className="file-meta">
              <p><strong>Loaded file:</strong> {analysis.fileName}</p>
              <p><strong>Instrument snapshot:</strong> {instrumentsPreview}</p>
            </div>
          )}
        </section>

        {analysis && (
          <>
            <section className="panel">
              <h2>Musical Summary</h2>
              <SummaryCards summary={analysis.summary} meta={analysis.meta} />
            </section>

            <section className="panel full-width">
              <div className="section-heading">
                <div>
                  <h2>Piano Roll</h2>
                  <p>Follow the notes over time and use the play controls to rehearse difficult spots.</p>
                </div>
              </div>
              <PianoRoll notes={analysis.notes} durationSeconds={analysis.summary.durationSeconds} />
            </section>

            <section className="panel">
              <h2>Track Breakdown</h2>
              <TrackTable tracks={analysis.tracks} />
            </section>

            <section className="panel">
              <h2>Difficult Passages</h2>
              <PassageList passages={analysis.difficultPassages} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}
