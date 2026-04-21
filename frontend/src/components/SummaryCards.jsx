function formatSeconds(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${mins}:${secs}`;
}

export default function SummaryCards({ summary, meta }) {
  const cards = [
    { label: 'Tempo', value: `${summary.tempoBpm} BPM` },
    { label: 'Time Signature', value: summary.timeSignature },
    { label: 'Duration', value: formatSeconds(summary.durationSeconds) },
    { label: 'Note Range', value: summary.noteRange.display },
    { label: 'Note Density', value: `${summary.noteDensity} notes/sec` },
    { label: 'Tracks', value: meta.trackCount },
    { label: 'Total Notes', value: summary.totalNotes },
    { label: 'Avg Velocity', value: summary.averageVelocity },
  ];

  return (
    <div className="card-grid">
      {cards.map((card) => (
        <article key={card.label} className="stat-card">
          <span>{card.label}</span>
          <strong>{card.value}</strong>
        </article>
      ))}
    </div>
  );
}
