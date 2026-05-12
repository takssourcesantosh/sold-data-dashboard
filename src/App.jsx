import { useState, useEffect, useCallback, useRef, Component } from 'react'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, fontFamily: 'monospace', color: 'red', background: '#fff', position: 'fixed', inset: 0, zIndex: 9999, overflow: 'auto' }}>
        <h2>App Error (send this to developer):</h2>
        <pre>{this.state.error?.message}</pre>
        <pre>{this.state.error?.stack}</pre>
      </div>
    )
    return this.props.children
  }
}
import {
  initDb,
  queryRows,
  createTableFromCSV,
  appendFromCSV,
  clearAllData,
  exportCsvAndDownload,
  getDistinctValues,
  listBackups,
  restoreBackup,
  getMyProfile,
  loginApi,
  logoutApi,
  getStoredUser,
  setStoredUser,
} from './api'
import Grid from './components/Grid'
import Toolbar from './components/Toolbar'
import DragOverlay from './components/DragOverlay'
import AdvancedFilterPanel from './components/AdvancedFilterPanel'
import BackupPanel from './components/BackupPanel'
import ProfilePanel from './components/ProfilePanel'
import UserManagementPanel from './components/UserManagementPanel'
import LoginScreen from './components/LoginScreen'

// ── Auth wrapper ──────────────────────────────────────────────────────────────

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => getStoredUser())

  const handleLogin = (user) => setCurrentUser(user)
  const handleLogout = () => {
    logoutApi()
    setCurrentUser(null)
  }

  if (!currentUser) return <LoginScreen onLogin={handleLogin} />
  return <ErrorBoundary><Dashboard currentUser={currentUser} onLogout={handleLogout} /></ErrorBoundary>
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ currentUser: initialUser, onLogout }) {
  const [currentUser, setCurrentUser] = useState(initialUser)
  const isAdmin = currentUser.role === 'admin'

  const [dbReady, setDbReady] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('Connecting…')
  const [loadPct, setLoadPct] = useState(null)
  const [columns, setColumns] = useState([])
  const [rows, setRows] = useState([])
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [columnFilters, setColumnFilters] = useState({})
  const [valueFilters, setValueFilters] = useState({})
  const [advancedFilters, setAdvancedFilters] = useState([])
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [backups, setBackups] = useState([])
  const [backupPanelOpen, setBackupPanelOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [userMgmtOpen, setUserMgmtOpen] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [columnOrder, setColumnOrder] = useState([])
  const prevColSigRef = useRef('')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const stateRef = useRef({ search: '', sortCol: null, sortDir: 'asc', columnFilters: {}, valueFilters: {}, advancedFilters: [] })

  useEffect(() => {
    const sig = columns.join('|')
    if (sig === prevColSigRef.current) return
    prevColSigRef.current = sig
    if (columns.length === 0) { setColumnOrder([]); return }
    const saved = localStorage.getItem('col-order')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.length === columns.length && parsed.every(c => columns.includes(c))) {
          setColumnOrder(parsed); return
        }
      } catch {}
    }
    setColumnOrder([...columns])
  }, [columns])

  const handleColumnReorder = useCallback((fromCol, toCol) => {
    setColumnOrder(prev => {
      const next = [...prev]
      const fi = next.indexOf(fromCol)
      const ti = next.indexOf(toCol)
      if (fi === -1 || ti === -1 || fi === ti) return prev
      next.splice(fi, 1)
      next.splice(ti, 0, fromCol)
      localStorage.setItem('col-order', JSON.stringify(next))
      return next
    })
  }, [])

  const loadBackups = useCallback(async () => {
    if (!isAdmin) return
    try { setBackups(await listBackups()) } catch {}
  }, [isAdmin])

  const loadData = useCallback(async () => {
    try {
      const { columns: cols, rows: r } = await queryRows(stateRef.current)
      setColumns(cols)
      setRows(r)
    } catch (err) {
      console.error('loadData failed:', err)
      if (err.message === 'Unauthorized' || err.message === 'Invalid token') {
        logoutApi()
        window.location.reload()
      }
    }
  }, [])

  useEffect(() => {
    async function boot() {
      try {
        setLoadingMsg('Connecting…')
        await initDb()
          const profile = await getMyProfile()
        setCurrentUser(u => ({ ...u, ...profile }))
        setDbReady(true)
        loadData()
        loadBackups()
      } catch (err) {
        if (err.message === 'Unauthorized' || err.message === 'Invalid token') {
          logoutApi()
          window.location.reload()
        } else {
          setLoadingMsg('Connection failed. Please refresh.')
        }
      }
    }
    boot()
  }, [loadData])

  const searchTimer = useRef(null)
  const filterTimer = useRef(null)

  useEffect(() => {
    return () => {
      clearTimeout(searchTimer.current)
      clearTimeout(filterTimer.current)
    }
  }, [])

  const handleSearch = (text) => {
    setSearch(text)
    stateRef.current.search = text
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(loadData, 200)
  }

  const handleSort = (col) => {
    const newDir = stateRef.current.sortCol === col && stateRef.current.sortDir === 'asc' ? 'desc' : 'asc'
    setSortCol(col); setSortDir(newDir)
    stateRef.current.sortCol = col; stateRef.current.sortDir = newDir
    loadData()
  }

  const handleColumnFilter = (col, val) => {
    const next = { ...stateRef.current.columnFilters, [col]: val }
    if (!val) delete next[col]
    setColumnFilters(next)
    stateRef.current.columnFilters = next
    clearTimeout(filterTimer.current)
    filterTimer.current = setTimeout(loadData, 250)
  }

  const clearFilters = () => {
    setColumnFilters({}); setValueFilters({}); setAdvancedFilters([])
    stateRef.current.columnFilters = {}; stateRef.current.valueFilters = {}; stateRef.current.advancedFilters = []
    loadData()
  }

  const handleAdvancedFiltersChange = (rules) => {
    setAdvancedFilters(rules)
    stateRef.current.advancedFilters = rules
    loadData()
  }

  const handleValueFilter = (col, selectedVals) => {
    const next = { ...stateRef.current.valueFilters }
    if (!selectedVals) delete next[col]
    else next[col] = selectedVals
    setValueFilters(next); stateRef.current.valueFilters = next
    loadData()
  }

  const getColDistinctValues = (col) => getDistinctValues(col)

  const resetQueryState = () => {
    stateRef.current = { search: '', sortCol: null, sortDir: 'asc', columnFilters: {}, valueFilters: {}, advancedFilters: [] }
    setSearch(''); setSortCol(null); setSortDir('asc')
    setColumnFilters({}); setValueFilters({}); setAdvancedFilters([])
  }

  const handleUpload = async (file) => {
    setLoadPct(0)
    try {
      await createTableFromCSV(file, (pct) => setLoadPct(pct))
      resetQueryState()
      loadData()
      loadBackups()
    } catch (err) {
      alert('Upload failed: ' + err.message)
    } finally {
      setLoadPct(null)
    }
  }

  const handleAppend = async (file) => {
    try {
      await appendFromCSV(file)
      loadData()
    } catch (err) {
      alert(err.message)
    }
  }

  const handleClearData = async () => {
    await clearAllData()
    resetQueryState()
    setColumns([])
    setRows([])
    loadBackups()
  }

  const handleRestore = async (slot) => {
    setBackupPanelOpen(false)
    setLoadPct(0)
    try {
      await restoreBackup(slot)
      resetQueryState()
      loadData()
      loadBackups()
    } catch (err) {
      alert('Restore failed: ' + err.message)
    } finally {
      setLoadPct(null)
    }
  }

  const handleExport = () => exportCsvAndDownload()

  useEffect(() => {
    if (!isAdmin) return
    let enterCount = 0
    const isFileDrag = (e) => e.dataTransfer?.types?.includes('Files')
    const onDragEnter = (e) => { if (!isFileDrag(e)) return; enterCount++; setDragging(true) }
    const onDragLeave = (e) => { if (!isFileDrag(e)) return; enterCount--; if (enterCount <= 0) { enterCount = 0; setDragging(false) } }
    const onDragOver = (e) => e.preventDefault()
    const onDrop = (e) => { e.preventDefault(); enterCount = 0; setDragging(false) }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [isAdmin])

  if (!dbReady) {
    return (
      <div className="splash">
        <div className="splash-inner">
          <div className="splash-spinner" />
          <p className="splash-msg">{loadingMsg}</p>
          {loadPct !== null && (
            <div className="splash-bar-wrap">
              <div className="splash-bar" style={{ width: `${loadPct}%` }} />
            </div>
          )}
        </div>
      </div>
    )
  }

  const hasData = columns.length > 0

  return (
    <div className="app">
      {loadPct !== null && (
        <div className="upload-progress-bar" style={{ width: `${loadPct}%` }} />
      )}

      <Toolbar
        search={search}
        onSearch={handleSearch}
        onUpload={handleUpload}
        onAppend={handleAppend}
        onClearData={handleClearData}
        onExport={handleExport}
        hasData={hasData}
        isAdmin={isAdmin}
        theme={theme}
        onThemeToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
        activeFilters={Object.keys(columnFilters).length + Object.keys(valueFilters).length + advancedFilters.length}
        onClearFilters={clearFilters}
        advancedOpen={advancedOpen}
        onToggleAdvanced={() => setAdvancedOpen(o => !o)}
        advancedFilterCount={advancedFilters.length}
        currentUser={currentUser}
        onLogout={onLogout}
        backupCount={backups.length}
        onOpenBackups={() => setBackupPanelOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenUserMgmt={() => setUserMgmtOpen(true)}
      />

      <AdvancedFilterPanel
        open={advancedOpen}
        columns={columns}
        filters={advancedFilters}
        onChange={handleAdvancedFiltersChange}
      />

      {hasData ? (
        <Grid
          columns={columns}
          columnOrder={columnOrder}
          onColumnReorder={handleColumnReorder}
          rows={rows}
          sortCol={sortCol}
          sortDir={sortDir}
          onSort={handleSort}
          columnFilters={columnFilters}
          onColumnFilter={handleColumnFilter}
          valueFilters={valueFilters}
          onValueFilter={handleValueFilter}
          getDistinctValues={getColDistinctValues}
        />
      ) : (
        isAdmin
          ? <EmptyState onUpload={handleUpload} />
          : <EmptyStateReadOnly />
      )}

      {dragging && isAdmin && (
        <DragOverlay onUpload={handleUpload} onClose={() => setDragging(false)} />
      )}

      {backupPanelOpen && isAdmin && (
        <BackupPanel
          backups={backups}
          onRestore={handleRestore}
          onClose={() => setBackupPanelOpen(false)}
        />
      )}

      {profileOpen && (
        <ProfilePanel
          currentUser={currentUser}
          onClose={() => setProfileOpen(false)}
          onProfileUpdate={(updated) => {
            setCurrentUser(updated)
            setStoredUser(updated)
          }}
        />
      )}

      {userMgmtOpen && isAdmin && (
        <UserManagementPanel
          currentUser={currentUser}
          onClose={() => setUserMgmtOpen(false)}
        />
      )}
    </div>
  )
}

// ── Empty states ──────────────────────────────────────────────────────────────

function EmptyState({ onUpload }) {
  const inputRef = useRef(null)
  return (
    <div className="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
      <p>No data loaded</p>
      <p className="empty-sub">Upload a CSV or Excel file to get started</p>
      <button className="btn-primary" onClick={() => inputRef.current?.click()}>Choose file</button>
      <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.xlsm,text/csv"
        style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
    </div>
  )
}

function EmptyStateReadOnly() {
  return (
    <div className="empty-state">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 21V9" />
      </svg>
      <p>No data available</p>
      <p className="empty-sub">Please contact an administrator to load data.</p>
    </div>
  )
}
