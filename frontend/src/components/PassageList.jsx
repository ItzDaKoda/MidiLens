export default function PassageList({ passages }) {
  if (!passages?.length) {
    return <p className="muted-text">Analyze a MIDI file to see the densest practice sections.</p>;
  }

  return (
    <div className="passage-list">
      {passages.map((passage, index) => (
        <article className="passage-card" key={`${passage.start}-${index}`}>
          <h3>Passage {index + 1}</h3>
          <p>
            <strong>Window:</strong> {passage.start}s - {passage.end}s
          </p>
          <p>
            <strong>Notes in section:</strong> {passage.notes}
          </p>
        </article>
      ))}
    </div>
  );
}
