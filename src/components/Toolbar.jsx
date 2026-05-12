import { useRef, useState, useEffect } from 'react'
import UserAvatar from './UserAvatar'

export default function Toolbar({
  search, onSearch,
  onUpload, onAppend, onClearData,
  onExport, hasData,
  isAdmin,
  theme, onThemeToggle,
  activeFilters, onClearFilters,
  advancedOpen, onToggleAdvanced, advancedFilterCount,
  currentUser, onLogout,
  backupCount, onOpenBackups,
  onOpenProfile, onOpenUserMgmt,
}) {
  const replaceInputRef = useRef(null)
  const appendInputRef  = useRef(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleReplace = (files) => {
    setMenuOpen(false)
    const file = files[0]
    if (!file) return
    onUpload(file)
  }

  const handleAppend = (files) => {
    setMenuOpen(false)
    const file = files[0]
    if (!file) return
    onAppend(file)
  }

  const handleClear = () => {
    setMenuOpen(false)
    if (window.confirm('Delete all data? This cannot be undone.')) onClearData()
  }

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <img src="/Logo.jpg" alt="" className="app-logo" />
        <span className="app-name">Belgium Diamonds</span>
      </div>

      <div className="toolbar-center">
        <div className="search-wrap">
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
          />
          {search && (
            <button className="search-clear" onClick={() => onSearch('')}>✕</button>
          )}
        </div>

        <button
          className={`btn adv-toggle-btn${advancedOpen ? ' adv-toggle-btn--active' : ''}`}
          onClick={onToggleAdvanced}
          title="Advanced filters"
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
          <button className="btn btn-filter-active" onClick={onClearFilters} title="Clear all column filters">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            {activeFilters} filter{activeFilters > 1 ? 's' : ''}
            <span className="filter-clear-x">✕</span>
          </button>
        )}

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
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {menuOpen && (
              <div className="upload-menu">
                <button className="menu-item" onClick={() => replaceInputRef.current?.click()}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Replace data…
                  <span className="menu-hint">Delete current, load new file</span>
                </button>
                <button className="menu-item" onClick={() => appendInputRef.current?.click()}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Append data…
                  <span className="menu-hint">Add rows from file (columns must match)</span>
                </button>
                {hasData && (
                  <>
                    <div className="menu-divider" />
                    <button className="menu-item menu-item-danger" onClick={handleClear}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
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
          <button className="btn" onClick={onOpenUserMgmt} title="Manage users">
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

        {hasData && (
          <button className="btn" onClick={onExport} title="Download CSV">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export
          </button>
        )}

        <button className="btn btn-icon" onClick={onThemeToggle} title="Toggle light/dark mode">
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

        <button className="btn btn-icon" onClick={onLogout} title="Sign out">
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
