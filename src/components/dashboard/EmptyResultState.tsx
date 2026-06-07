interface EmptyResultStateProps {
  /** Return to the upload screen so the user can try another file. */
  onReset: () => void;
}

/**
 * Friendly empty state shown when a file was read successfully but the analyzer
 * found zero parseable WhatsApp messages (empty chat, wrong file, media-only
 * export, etc). Rendered INSTEAD of the dashboard charts so the user never sees
 * a near-empty, broken-looking dashboard.
 */
export default function EmptyResultState({ onReset }: EmptyResultStateProps) {
  return (
    <div className="card empty-result" role="status" aria-live="polite">
      <div className="tag">No messages found</div>
      <h3 className="card-header">We couldn&rsquo;t find any messages</h3>
      <p className="text-muted m-0 empty-result-lead">
        We read your file, but it doesn&rsquo;t look like it contains any WhatsApp messages. A few
        things worth checking:
      </p>
      <ul className="empty-result-list text-muted">
        <li>
          Make sure it&rsquo;s a chat <strong className="text-white">exported from WhatsApp</strong>{" "}
          &mdash; a <code className="empty-result-code">.txt</code> file, or a{" "}
          <code className="empty-result-code">.zip</code> that contains one.
        </li>
        <li>The conversation should still have text in it, not just media or a cleared chat.</li>
        <li>
          Exporting <strong className="text-white">Without Media</strong> is fine &mdash; the
          messages are kept as plain text.
        </li>
      </ul>
      <div className="empty-result-actions">
        <button type="button" className="btn" onClick={onReset}>
          Upload another chat
        </button>
      </div>
    </div>
  );
}
