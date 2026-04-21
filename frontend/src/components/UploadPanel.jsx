import { useState } from 'react';

export default function UploadPanel({ onUpload, loading }) {
  const [file, setFile] = useState(null);

  function handleSubmit(event) {
    event.preventDefault();
    if (!file || loading) return;
    onUpload(file);
  }

  return (
    <div>
      <h2>Upload a MIDI File</h2>
      <p className="muted-text">
        Supported formats: .mid and .midi. The analyzer extracts note timing, range, tempo, instrument data,
        and note density.
      </p>
      <form onSubmit={handleSubmit} className="upload-form">
        <input
          type="file"
          accept=".mid,.midi"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button type="submit" disabled={!file || loading}>
          {loading ? 'Analyzing…' : 'Analyze MIDI'}
        </button>
      </form>
      {file && <p className="selected-file">Selected: {file.name}</p>}
    </div>
  );
}
