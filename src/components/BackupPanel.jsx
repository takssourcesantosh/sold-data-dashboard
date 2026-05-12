function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export default function BackupPanel({ backups, onRestore, onClose }) {
  const handleRestore = (b) => {
    if (!window.confirm(
      `Restore "${b.label}"?\n\nCurrent data will be saved as a backup first, then replaced with ${b.row_count.toLocaleString()} rows from this backup.`
    )) return
    onRestore(b.slot)
  }

  return (
    <div className="bp-overlay" onMouseDown={onClose}>
      <div className="bp-card" onMouseDown={e => e.stopPropagation()}>
        <div className="bp-header">
          <div className="bp-title-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="bp-title">Data Backups</span>
          </div>
          <button className="bp-close" onClick={onClose}>✕</button>
        </div>

        <div className="bp-body">
          {backups.length === 0 ? (
            <p className="bp-empty">No backups yet. Backups are created automatically before every upload or data clear.</p>
          ) : (
            <div className="bp-list">
              {backups.map((b, i) => (
                <div className="bp-item" key={b.slot}>
                  {i === 0 && <span className="bp-latest-tag">Latest</span>}
                  <div className="bp-item-info">
                    <span className="bp-item-label" title={b.label}>{b.label}</span>
                    <span className="bp-item-meta">
                      {fmtDate(b.created_at)}&nbsp;·&nbsp;{b.row_count.toLocaleString()} rows
                    </span>
                  </div>
                  <button className="btn bp-restore-btn" onClick={() => handleRestore(b)}>
                    Restore
                  </button>
                </div>
              ))}
            </div>
          )}
          <p className="bp-note">Up to 5 backups kept. Oldest removed automatically when limit is reached.</p>
        </div>
      </div>
    </div>
  )
}
