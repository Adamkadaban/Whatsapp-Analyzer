import type { PersonStat } from "../../lib/types";

interface StatsTableProps {
  personStats: PersonStat[];
}

/**
 * Table showing per-person statistics.
 */
export default function StatsTable({ personStats }: StatsTableProps) {
  return (
    <div className="card grid-gap-md">
      <div className="tag">People</div>
      <h3 className="card-header">Per-person stats</h3>
      <div className="stats-table-wrapper">
        <table className="stats-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Total words</th>
              <th>Unique words</th>
              <th>Avg words/msg</th>
              <th>Longest msg (words)</th>
              <th>Top emojis</th>
            </tr>
          </thead>
          <tbody>
            {personStats.map((p) => (
              <tr key={p.name}>
                <td className="font-semibold">{p.name}</td>
                <td>{p.total_words.toLocaleString()}</td>
                <td>{p.unique_words.toLocaleString()}</td>
                <td>{p.average_words_per_message.toFixed(1)}</td>
                <td>{p.longest_message_words}</td>
                <td>
                  <div className="emoji-list emoji-grid-5">
                    {p.top_emojis.slice(0, 10).map((e) => (
                      <span key={e.label} className="emoji-badge">
                        {e.label} <span className="text-muted">×{e.value}</span>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
