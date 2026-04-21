export default function TrackTable({ tracks }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Track</th>
            <th>Notes</th>
            <th>Channels</th>
            <th>Instruments</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track) => (
            <tr key={track.index}>
              <td>{track.name}</td>
              <td>{track.noteCount}</td>
              <td>{track.channels.length ? track.channels.join(', ') : '—'}</td>
              <td>{track.instruments.join(', ')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
