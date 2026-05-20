import { useRef, useState, useEffect } from 'react'
import UserAvatar from './UserAvatar'

export default function Toolbar({
  search, onSearch, onSearchCommit,
  recentSearches = [], recentOpen, onToggleRecent, onPickRecent,
  onUpload, onAppend, onClearData,
  onExport, onExportXlsx, hasData,
  isAdmin,
  theme, onThemeToggle,
  activeFilters, onClearFilters,
  advancedOpen, onToggleAdvanced, advancedFilterCount,
  currentUser, onLogout,
  backupCount, onOpenBackups,
  onOpenProfile, onOpenUserMgmt,
  onOpenShortcuts,
  onOpenViews, onOpenAlerts, onOpenFormatting, onOpenDiff, onOpenPivot,
  onShareCurrent,
  onAiQuery, onAiSummary, onAiTools, aiQueryOpen,
  columns = [], hiddenColumns = [], onToggleColumn, onShowAllColumns,
  frozenCount = 0, onSetFrozenCount,
}) {
  const replaceInputRef = useRef(null)
  const appendInputRef  = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [colVisOpen, setColVisOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const menuRef = useRef(null)
  const moreRef = useRef(null)
  const colVisRef = useRef(null)
  const exportRef = useRef(null)
  const searchWrapRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  useEffect(() => {
    if (!moreOpen) return
    const handler = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [moreOpen])

  useEffect(() => {
    if (!recentOpen) return
    const handler = (e) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) onToggleRecent?.()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [recentOpen, onToggleRecent])

  useEffect(() => {
    if (!colVisOpen) return
    const handler = (e) => { if (colVisRef.current && !colVisRef.current.contains(e.target)) setColVisOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [colVisOpen])

  useEffect(() => {
    if (!exportOpen) return
    const handler = (e) => { if (exportRef.current && !exportRef.current.contains(e.target)) setExportOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [exportOpen])

  const handleReplace = (files) => {
    setMenuOpen(false)
    const file = files[0]; if (!file) return
    onUpload(file)
  }
  const handleAppend = (files) => {
    setMenuOpen(false)
    const file = files[0]; if (!file) return
    onAppend(file)
  }
  const handleClear = () => { setMenuOpen(false); onClearData() }

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <img src="/Logo.jpg" alt="" className="app-logo" />
        <span className="app-name">Belgium Diamonds</span>
      </div>

      <div className="toolbar-center">
        <div className="search-wrap" ref={searchWrapRef}>
          <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            className="search-input"
            type="text"
            placeholder="Search all columns…"
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onFocus={() => { if (recentSearches.length && !search) onToggleRecent?.() }}
            onBlur={() => onSearchCommit?.(search)}
            onKeyDown={(e) => { if (e.key === 'Enter') onSearchCommit?.(search) }}
            aria-label="Search all columns"
          />
          {search && (
            <button className="search-clear" onClick={() => onSearch('')} aria-label="Clear search">✕</button>
          )}
          {!search && recentSearches.length > 0 && (
            <button className="search-recent-btn" onClick={onToggleRecent} title="Recent searches" aria-label="Recent searches">⏷</button>
          )}
          {recentOpen && recentSearches.length > 0 && (
            <div className="recent-dropdown" role="listbox">
              <div className="recent-header">Recent</div>
              {recentSearches.map((s, i) => (
                <button key={i} className="recent-item" onClick={() => onPickRecent(s)}>{s}</button>
              ))}
            </div>
          )}
        </div>

        <button
          className={`btn adv-toggle-btn${advancedOpen ? ' adv-toggle-btn--active' : ''}`}
          onClick={onToggleAdvanced}
          title="Advanced filters (Ctrl+Shift+F)"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          Filters
          {advancedFilterCount > 0 && (
            <span className="adv-badge">{advancedFilterCount}</span>
          )}
        </button>
      </div>

      <div className="toolbar-right">
        {activeFilters > 0 && (
          <button className="btn btn-filter-active" onClick={onClearFilters} title="Clear all filters (Ctrl+Shift+L)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {activeFilters} filter{activeFilters > 1 ? 's' : ''}
            <span className="filter-clear-x">✕</span>
          </button>
        )}

        {hasData && (
          <button className="btn" onClick={onOpenViews} title="Saved views (Ctrl+Shift+S)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            Views
          </button>
        )}

        {/* Column visibility + freeze */}
        {hasData && (
          <div className="split-btn-wrap" ref={colVisRef}>
            <button className="btn" onClick={() => setColVisOpen(o => !o)} title="Show/hide columns · Freeze columns">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
              </svg>
              Columns
              {hiddenColumns.length > 0 && <span className="backup-count">{hiddenColumns.length}</span>}
            </button>
            {colVisOpen && (
              <div className="upload-menu col-vis-menu">
                <div className="menu-header-row">
                  <span className="menu-section-label">Column Visibility</span>
                  {hiddenColumns.length > 0 && (
                    <button className="link-btn" onClick={() => { onShowAllColumns?.(); setColVisOpen(false) }}>Show all</button>
                  )}
                </div>
                <div className="col-freeze-row">
                  <span>Freeze first</span>
                  <select value={frozenCount} onChange={e => onSetFrozenCount?.(parseInt(e.target.value, 10))}>
                    {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n === 0 ? 'None' : n}</option>)}
                  </select>
                  <span>col{frozenCount !== 1 ? 's' : ''}</span>
                </div>
                <div className="menu-divider" />
                <div className="col-vis-list">
                  {columns.map(col => (
                    <label key={col} className="col-vis-item">
                      <input type="checkbox" checked={!hiddenColumns.includes(col)} onChange={() => onToggleColumn?.(col)} />
                      <span className="col-vis-name">{col}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* More menu — secondary features collapsed here */}
        <div className="split-btn-wrap" ref={moreRef}>
          <button className="btn" onClick={() => setMoreOpen(o => !o)} title="More tools" aria-haspopup="true" aria-expanded={moreOpen}>
            ⋯ Tools
          </button>
          {moreOpen && (
            <div className="upload-menu">
              {hasData && (
                <button className="menu-item" onClick={() => { setMoreOpen(false); onOpenPivot() }}>
                  📊 Pivot Table
                  <span className="menu-hint">Group by dimensions, aggregate values</span>
                </button>
              )}
              {hasData && (
                <button className="menu-item" onClick={() => { setMoreOpen(false); onOpenFormatting() }}>
                  🎨 Conditional Formatting
                  <span className="menu-hint">Color cells by rules + heatmaps</span>
                </button>
              )}
              {hasData && (
                <button className="menu-item" onClick={() => { setMoreOpen(false); onOpenAlerts() }}>
                  🔔 Threshold Alerts
                  <span className="menu-hint">Notify when rows match a condition</span>
                </button>
              )}
              {hasData && isAdmin && (
                <button className="menu-item" onClick={() => { setMoreOpen(false); onOpenDiff() }}>
                  🔍 Diff vs Previous Upload
                  <span className="menu-hint">See added/removed rows</span>
                </button>
              )}
              {hasData && (
                <button className="menu-item" onClick={() => { setMoreOpen(false); onShareCurrent() }}>
                  🔗 Copy share link
                  <span className="menu-hint">Share current view as URL</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Upload split button — admin only */}
        {isAdmin && (
          <div className="split-btn-wrap" ref={menuRef}>
            <button
              className="btn split-btn-main"
              onClick={() => replaceInputRef.current?.click()}
              title="Replace data with new file"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload
            </button>
            <button
              className="btn split-btn-arrow"
              onClick={() => setMenuOpen(o => !o)}
              title="More data options"
              aria-haspopup="true"
              aria-expanded={menuOpen}
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {menuOpen && (
              <div className="upload-menu">
                <button className="menu-item" onClick={() => replaceInputRef.current?.click()}>
                  Replace data…
                  <span className="menu-hint">Delete current, load new file</span>
                </button>
                <button className="menu-item" onClick={() => appendInputRef.current?.click()}>
                  Append data…
                  <span className="menu-hint">Add rows from file (columns must match)</span>
                </button>
                {hasData && (
                  <>
                    <div className="menu-divider" />
                    <button className="menu-item menu-item-danger" onClick={handleClear}>
                      Clear all data
                      <span className="menu-hint">Delete everything, start fresh</span>
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {isAdmin && (
          <button className="btn" onClick={onOpenUserMgmt} title="Manage users" aria-label="Manage users">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            Users
          </button>
        )}

        {isAdmin && backupCount > 0 && (
          <button className="btn" onClick={onOpenBackups} title="View and restore backups">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Backups
            <span className="backup-count">{backupCount}</span>
          </button>
        )}

        <div className="tb-group">
          <button
            className={`btn tb-btn ai-tb-btn${aiQueryOpen ? ' active' : ''}`}
            onClick={onAiQuery}
            title="AI natural language query (Alt+A)"
          >✨ AI Query</button>
          <button className="btn tb-btn ai-tb-btn" onClick={onAiTools} title="AI tools: duplicates, forecasting, buyer profiles">🔧 AI Tools</button>
        </div>

        {hasData && (
          <div className="split-btn-wrap" ref={exportRef}>
            <button className="btn split-btn-main" onClick={onExport} title="Export CSV (Ctrl+E)" aria-label="Export CSV">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export
            </button>
            <button className="btn split-btn-arrow" onClick={() => setExportOpen(o => !o)} title="Export options" aria-haspopup="true" aria-expanded={exportOpen}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {exportOpen && (
              <div className="upload-menu">
                <button className="menu-item" onClick={() => { onExport(); setExportOpen(false) }}>
                  Export as CSV
                  <span className="menu-hint">Comma-separated, Excel-compatible</span>
                </button>
                <button className="menu-item" onClick={() => { onExportXlsx?.(); setExportOpen(false) }}>
                  Export as XLSX
                  <span className="menu-hint">Excel workbook format</span>
                </button>
              </div>
            )}
          </div>
        )}

        <button className="btn btn-icon" onClick={onThemeToggle} title="Toggle light/dark mode" aria-label="Toggle theme">
          {theme === 'dark' ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <button className="user-pill" onClick={onOpenProfile} title="My profile">
          <UserAvatar user={currentUser} size={22} />
          <span className="user-pill-name">{currentUser?.username}</span>
          {currentUser?.role === 'admin' && <span className="user-pill-role">Admin</span>}
        </button>

        <button className="btn btn-icon" onClick={onOpenShortcuts} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="6" width="20" height="13" rx="2" />
            <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
          </svg>
        </button>

        <button className="btn btn-icon" onClick={onLogout} title="Sign out" aria-label="Sign out">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </button>

        <input ref={replaceInputRef} type="file" accept=".csv,.xlsx,.xls,.xlsm,text/csv"
          style={{ display: 'none' }} onChange={(e) => handleReplace(e.target.files)}
          onClick={(e) => { e.target.value = '' }} />
        <input ref={appendInputRef} type="file" accept=".csv,.xlsx,.xls,.xlsm,text/csv"
          style={{ display: 'none' }} onChange={(e) => handleAppend(e.target.files)}
          onClick={(e) => { e.target.value = '' }} />
      </div>
    </header>
  )
}
