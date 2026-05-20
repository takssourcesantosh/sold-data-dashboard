import { useState, useEffect, useCallback, useRef, Component } from 'react'
import { ToastProvider, useToast, useConfirm } from './components/Toast'
import {
  initDb,
  queryRows,
  createTableFromCSV,
  appendFromCSV,
  clearAllData,
  exportCsvAndDownload,
  exportXlsxAndDownload,
  columnStatsApi,
  getDistinctValues,
  listBackups,
  restoreBackup,
  pinBackupApi,
  getMyProfile,
  logoutApi,
  getStoredUser,
  setStoredUser,
  listFormattingApi,
  onBroadcast,
  refreshTokenIfNeeded,
} from './api'
import Grid from './components/Grid'
import Toolbar from './components/Toolbar'
import DragOverlay from './components/DragOverlay'
import AdvancedFilterPanel from './components/AdvancedFilterPanel'
import BackupPanel from './components/BackupPanel'
import ProfilePanel from './components/ProfilePanel'
import UserManagementPanel from './components/UserManagementPanel'
import LoginScreen from './components/LoginScreen'
import ShortcutsPanel from './components/ShortcutsPanel'
import ViewsPanel from './components/ViewsPanel'
import AlertsPanel from './components/AlertsPanel'
import FormattingPanel from './components/FormattingPanel'
import DiffPanel from './components/DiffPanel'
import PivotPanel from './components/PivotPanel'
import ColumnStatsPanel from './components/ColumnStatsPanel'
import AiQueryBar from './components/AiQueryBar'
import AiInsightsPanel from './components/AiInsightsPanel'
import AiSummaryModal from './components/AiSummaryModal'
import AiToolsPanel from './components/AiToolsPanel'
import { getRecentSearches, addRecentSearch, readViewFromUrl, clearViewHash, buildShareUrl } from './lib/view-state'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 32, fontFamily: 'monospace', color: 'red', background: '#fff', position: 'fixed', inset: 0, zIndex: 9999, overflow: 'auto' }}>
        <h2>App Error (send this to developer):</h2>
        <pre>{this.state.error?.message}</pre>
        <pre>{this.state.error?.stack}</pre>
        <button onClick={() => location.reload()}>Reload</button>
      </div>
    )
    return this.props.children
  }
}

// ── Auth wrapper ──────────────────────────────────────────────────────────────

export default function App() {
  return (
    <ToastProvider>
      <ErrorBoundary>
        <AppInner />
      </ErrorBoundary>
    </ToastProvider>
  )
}

function AppInner() {
  const [currentUser, setCurrentUser] = useState(() => getStoredUser())

  const handleLogin = (user) => setCurrentUser(user)
  const handleLogout = async () => {
    await logoutApi()
    setCurrentUser(null)
  }

  // Listen for cross-tab logout
  useEffect(() => {
    const off = onBroadcast((msg) => {
      if (msg.type === 'auth.logout') setCurrentUser(null)
    })
    return off
  }, [])

  if (!currentUser) return <LoginScreen onLogin={handleLogin} />
  return <Dashboard currentUser={currentUser} onLogout={handleLogout} />
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

function Dashboard({ currentUser: initialUser, onLogout }) {
  const toast = useToast()
  const [askConfirm, ConfirmModal] = useConfirm()
  const [currentUser, setCurrentUser] = useState(initialUser)
  const isAdmin = currentUser.role === 'admin'

  const [dbReady, setDbReady] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('Connecting…')
  const [loadPct, setLoadPct] = useState(null)
  const [columns, setColumns] = useState([])
  const [rows, setRows] = useState([])
  const [totalCount, setTotalCount] = useState(0)
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
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [viewsOpen, setViewsOpen] = useState(false)
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [formattingOpen, setFormattingOpen] = useState(false)
  const [diffOpen, setDiffOpen] = useState(false)
  const [pivotOpen, setPivotOpen] = useState(false)
  const [aiQueryOpen, setAiQueryOpen] = useState(false)
  const [aiInsightsOpen, setAiInsightsOpen] = useState(false)
  const [aiSummaryOpen, setAiSummaryOpen] = useState(false)
  const [aiToolsOpen, setAiToolsOpen] = useState(false)
  const [recentOpen, setRecentOpen] = useState(false)
  const [recentSearches, setRecentSearches] = useState(() => getRecentSearches())
  const [formattingRules, setFormattingRules] = useState([])
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark')
  const [columnOrder, setColumnOrder] = useState([])
  const prevColSigRef = useRef('')
  const [hiddenColumns, setHiddenColumns] = useState(() => {
    try { return JSON.parse(localStorage.getItem('hidden-cols') || '[]') } catch { return [] }
  })
  const [frozenCount, setFrozenCount] = useState(() => {
    return parseInt(localStorage.getItem('frozen-count') || '0', 10)
  })
  const [dateFilters, setDateFilters] = useState({})
  const [sortSpec, setSortSpec] = useState([])
  const [statsCol, setStatsCol] = useState(null)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const stateRef = useRef({ search: '', sortCol: null, sortDir: 'asc', columnFilters: {}, valueFilters: {}, advancedFilters: [], dateFilters: {}, sortSpec: [] })

  useEffect(() => {
    const sig = JSON.stringify(columns)
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
    try { setBackups(await listBackups()) } catch (e) { console.error('loadBackups:', e) }
  }, [isAdmin])

  const loadFormatting = useCallback(async () => {
    try { setFormattingRules(await listFormattingApi()) } catch (e) { console.error('loadFormatting:', e) }
  }, [])

  const loadData = useCallback(async () => {
    try {
      const { columns: cols, rows: r, totalCount: tc } = await queryRows({
        ...stateRef.current,
        dateFilters: stateRef.current.dateFilters || {},
        sortSpec: stateRef.current.sortSpec || [],
      })
      setColumns(cols)
      setRows(r)
      setTotalCount(tc ?? r.length)
    } catch (err) {
      console.error('loadData failed:', err)
      if (err.message === 'Unauthorized' || err.message === 'Invalid token' || err.message?.includes('Session revoked')) {
        await logoutApi()
        window.location.reload()
      } else {
        toast.error('Failed to load data: ' + err.message)
      }
    }
  }, []) // eslint-disable-line

  // Apply a view payload (from saved view, share link, etc.)
  const applyView = useCallback((payload) => {
    if (!payload) return
    const next = {
      search: payload.search ?? '',
      sortCol: payload.sortCol ?? null,
      sortDir: payload.sortDir ?? 'asc',
      columnFilters: payload.columnFilters ?? {},
      valueFilters: payload.valueFilters ?? {},
      advancedFilters: payload.advancedFilters ?? [],
      dateFilters: payload.dateFilters ?? {},
      sortSpec: payload.sortSpec ?? [],
    }
    stateRef.current = next
    setSearch(next.search)
    setSortCol(next.sortCol)
    setSortDir(next.sortDir)
    setColumnFilters(next.columnFilters)
    setValueFilters(next.valueFilters)
    setAdvancedFilters(next.advancedFilters)
    setDateFilters(next.dateFilters)
    setSortSpec(next.sortSpec)
    if (payload.columnOrder) setColumnOrder(payload.columnOrder)
    loadData()
  }, [loadData])

  useEffect(() => {
    async function boot() {
      try {
        setLoadingMsg('Connecting…')
        await initDb()
        const profile = await getMyProfile()
        setCurrentUser(u => ({ ...u, ...profile }))
        setDbReady(true)

        // JWT expiry warning
        try {
          // Auto-refresh token if < 24 h remaining; warn only if refresh fails
          const refreshed = await refreshTokenIfNeeded()
          if (!refreshed) {
            const token = localStorage.getItem('bd-token')
            if (token) {
              try {
                const payload = JSON.parse(atob(token.split('.')[1]))
                const expiresIn = payload.exp * 1000 - Date.now()
                if (expiresIn < 24 * 60 * 60 * 1000) {
                  const hrs = Math.round(expiresIn / (60 * 60 * 1000))
                  toast.warn(`Session expires in ${hrs} hour${hrs !== 1 ? 's' : ''}. Log out and in again to renew.`, { ttl: 0 })
                }
              } catch {}
            }
          }
        } catch {}

        if (profile.must_change_password) {
          toast.warn('Please change your password before continuing.', { ttl: 0 })
          setProfileOpen(true)
        }

        // Load formatting rules
        loadFormatting()

        // Share-by-link: if URL hash has view, apply it
        const urlView = readViewFromUrl()
        if (urlView) {
          applyView(urlView)
          clearViewHash()
          toast.info('View loaded from shared link')
        } else {
          loadData()
        }

        loadBackups()
      } catch (err) {
        if (err.message === 'Unauthorized' || err.message === 'Invalid token' || err.message?.includes('Session revoked')) {
          await logoutApi()
          window.location.reload()
        } else {
          setLoadingMsg('Connection failed: ' + err.message)
        }
      }
    }
    boot()
  }, [loadData, loadBackups, loadFormatting, applyView]) // eslint-disable-line

  // Multi-tab sync: react to cross-tab events
  useEffect(() => {
    const off = onBroadcast((msg) => {
      if (!msg) return
      switch (msg.type) {
        case 'data.upload':
        case 'data.append':
        case 'data.restore':
        case 'data.clear':
          toast.info('Data changed in another tab. Refreshing…')
          loadData()
          loadBackups()
          break
        case 'auth.expired':
          // Session expired/revoked in any tab → reload all tabs to login
          window.location.reload()
          break
        default: break
      }
    })
    return off
  }, [loadData, loadBackups]) // eslint-disable-line

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

  const handleSearchCommit = (text) => {
    if (text?.trim()) {
      addRecentSearch(text.trim())
      setRecentSearches(getRecentSearches())
    }
  }

  const handleSort = (col, event) => {
    if (event?.ctrlKey || event?.metaKey) {
      // Add/toggle as secondary sort
      setSortSpec(prev => {
        const existing = prev.find(s => s.col === col)
        let next
        if (existing) {
          if (existing.dir === 'asc') next = prev.map(s => s.col === col ? { col, dir: 'desc' } : s)
          else next = prev.filter(s => s.col !== col)
        } else {
          next = [...prev, { col, dir: 'asc' }]
        }
        stateRef.current.sortSpec = next
        return next
      })
      loadData()
    } else {
      // Primary sort (old behavior) - clear multi-sort
      const newDir = stateRef.current.sortCol === col && stateRef.current.sortDir === 'asc' ? 'desc' : 'asc'
      setSortCol(col); setSortDir(newDir); setSortSpec([])
      stateRef.current.sortCol = col; stateRef.current.sortDir = newDir; stateRef.current.sortSpec = []
      loadData()
    }
  }

  const handleDateFilter = (col, range) => {
    const next = { ...stateRef.current.dateFilters }
    if (!range || (!range.from && !range.to)) delete next[col]
    else next[col] = range
    setDateFilters(next)
    stateRef.current.dateFilters = next
    clearTimeout(filterTimer.current)
    filterTimer.current = setTimeout(loadData, 250)
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
    setColumnFilters({}); setValueFilters({}); setAdvancedFilters([]); setDateFilters({}); setSortSpec([])
    stateRef.current = { ...stateRef.current, columnFilters: {}, valueFilters: {}, advancedFilters: [], dateFilters: {}, sortSpec: [] }
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
    stateRef.current = { search: '', sortCol: null, sortDir: 'asc', columnFilters: {}, valueFilters: {}, advancedFilters: [], dateFilters: {}, sortSpec: [] }
    setSearch(''); setSortCol(null); setSortDir('asc')
    setColumnFilters({}); setValueFilters({}); setAdvancedFilters([]); setDateFilters({}); setSortSpec([])
  }

  // Build current view payload for save / share
  const currentViewPayload = () => ({
    search: stateRef.current.search,
    sortCol: stateRef.current.sortCol,
    sortDir: stateRef.current.sortDir,
    columnFilters: stateRef.current.columnFilters,
    valueFilters: stateRef.current.valueFilters,
    advancedFilters: stateRef.current.advancedFilters,
    dateFilters: stateRef.current.dateFilters || {},
    sortSpec: stateRef.current.sortSpec || [],
    columnOrder,
  })

  const handleToggleColumn = (col) => {
    setHiddenColumns(prev => {
      const next = prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
      localStorage.setItem('hidden-cols', JSON.stringify(next))
      return next
    })
  }

  const handleShowAllColumns = () => {
    setHiddenColumns([])
    localStorage.removeItem('hidden-cols')
  }

  const handleSetFrozenCount = (n) => {
    setFrozenCount(n)
    localStorage.setItem('frozen-count', String(n))
  }

  const handleExportXlsx = () => exportXlsxAndDownload({
    ...stateRef.current,
    dateFilters: stateRef.current.dateFilters || {},
    sortSpec: stateRef.current.sortSpec || [],
  }).catch(err => toast.error(err.message))

  const handleShareCurrent = async () => {
    const url = buildShareUrl(currentViewPayload())
    try { await navigator.clipboard.writeText(url); toast.success('Share link copied') }
    catch { toast.info(url) }
  }

  const handleAiResetFilters = useCallback(() => {
    const next = { ...stateRef.current, search: '', columnFilters: {}, advancedFilters: [], valueFilters: {} }
    stateRef.current = next
    setSearch('')
    setColumnFilters({})
    setAdvancedFilters([])
    setValueFilters({})
    loadData()
  }, [loadData]) // eslint-disable-line

  const handleAiApplyFilters = useCallback((filters) => {
    if (!filters) return
    const next = { ...stateRef.current }
    if (filters.search != null) next.search = filters.search
    if (filters.columnFilters) next.columnFilters = { ...next.columnFilters, ...filters.columnFilters }
    if (filters.advancedFilters?.length) next.advancedFilters = filters.advancedFilters
    stateRef.current = next
    setSearch(next.search || '')
    loadData()
  }, [loadData]) // eslint-disable-line

  // Notify on triggered alerts (after upload/append)
  const notifyTriggeredAlerts = (triggered) => {
    if (!triggered?.length) return
    for (const a of triggered) {
      const msg = `🔔 Alert "${a.name}" triggered: ${a.count} rows match ${a.column_name} ${a.op} ${a.threshold}`
      toast.warn(msg, { ttl: 9000 })
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try { new Notification('Belgium Diamonds — Alert', { body: msg }) } catch {}
      }
    }
  }

  const handleUpload = async (file) => {
    setLoadPct(0)
    try {
      const data = await createTableFromCSV(file, (pct) => setLoadPct(pct))
      resetQueryState()
      loadData()
      loadBackups()
      notifyTriggeredAlerts(data?.triggeredAlerts)
      setAiInsightsOpen(true)
    } catch (err) {
      toast.error('Upload failed: ' + err.message)
    } finally {
      setLoadPct(null)
    }
  }

  const handleAppend = async (file) => {
    try {
      const data = await appendFromCSV(file)
      loadData()
      notifyTriggeredAlerts(data?.triggeredAlerts)
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleClearData = async () => {
    if (!(await askConfirm('Delete all data? Current data will be backed up first.', { danger: true, confirmLabel: 'Clear' }))) return
    try {
      await clearAllData()
      resetQueryState()
      setColumns([])
      setRows([])
      loadBackups()
      toast.success('Data cleared')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const handleRestore = async (slot) => {
    setBackupPanelOpen(false)
    setLoadPct(0)
    try {
      await restoreBackup(slot)
      resetQueryState()
      loadData()
      loadBackups()
      toast.success('Restored')
    } catch (err) {
      toast.error('Restore failed: ' + err.message)
    } finally {
      setLoadPct(null)
    }
  }

  const handleExport = () => exportCsvAndDownload({
    ...stateRef.current,
    dateFilters: stateRef.current.dateFilters || {},
    sortSpec: stateRef.current.sortSpec || [],
  }).catch(err => toast.error(err.message))

  const hasData = columns.length > 0

  // ── Global keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName
      const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        document.querySelector('.search-input')?.focus()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e' && !e.shiftKey && hasData) {
        e.preventDefault()
        handleExport()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault()
        clearFilters()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
        e.preventDefault()
        setAdvancedOpen(o => !o)
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault()
        setViewsOpen(true)
        return
      }
      if (e.key === 'Escape' && document.activeElement?.classList.contains('search-input')) {
        handleSearch('')
        document.activeElement.blur()
        return
      }
      if (e.key === '?' && !inInput) {
        setShortcutsOpen(o => !o)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [hasData]) // eslint-disable-line

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

  return (
    <div className="app">
      {loadPct !== null && (
        <div className="upload-progress-bar" style={{ width: `${loadPct}%` }} />
      )}

      <Toolbar
        search={search}
        onSearch={handleSearch}
        onSearchCommit={handleSearchCommit}
        recentSearches={recentSearches}
        recentOpen={recentOpen}
        onToggleRecent={() => setRecentOpen(o => !o)}
        onPickRecent={(q) => { handleSearch(q); setRecentOpen(false) }}
        onUpload={handleUpload}
        onAppend={handleAppend}
        onClearData={handleClearData}
        onExport={handleExport}
        onExportXlsx={handleExportXlsx}
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
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenViews={() => setViewsOpen(true)}
        onOpenAlerts={() => setAlertsOpen(true)}
        onOpenFormatting={() => setFormattingOpen(true)}
        onOpenDiff={() => setDiffOpen(true)}
        onOpenPivot={() => setPivotOpen(true)}
        onShareCurrent={handleShareCurrent}
        onAiQuery={() => setAiQueryOpen(v => !v)}
        onAiSummary={() => setAiSummaryOpen(true)}
        onAiTools={() => setAiToolsOpen(true)}
        aiQueryOpen={aiQueryOpen}
        columns={columns}
        hiddenColumns={hiddenColumns}
        onToggleColumn={handleToggleColumn}
        onShowAllColumns={handleShowAllColumns}
        frozenCount={frozenCount}
        onSetFrozenCount={handleSetFrozenCount}
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
          onSort={(col, e) => handleSort(col, e)}
          columnFilters={columnFilters}
          onColumnFilter={handleColumnFilter}
          valueFilters={valueFilters}
          onValueFilter={handleValueFilter}
          getDistinctValues={getColDistinctValues}
          formattingRules={formattingRules}
          totalCount={totalCount}
          hiddenColumns={hiddenColumns}
          dateFilters={dateFilters}
          onDateFilter={handleDateFilter}
          frozenCount={frozenCount}
          sortSpec={sortSpec}
          onColumnStats={setStatsCol}
        />
      ) : (
        isAdmin ? <EmptyState onUpload={handleUpload} /> : <EmptyStateReadOnly />
      )}

      {dragging && isAdmin && (
        <DragOverlay onUpload={handleUpload} onClose={() => setDragging(false)} />
      )}

      {backupPanelOpen && isAdmin && (
        <BackupPanel
          backups={backups}
          onRestore={handleRestore}
          onPin={async (slot, pinned) => {
            try { await pinBackupApi(slot, pinned); loadBackups() }
            catch (e) { toast.error(e.message) }
          }}
          onClose={() => setBackupPanelOpen(false)}
        />
      )}

      {profileOpen && (
        <ProfilePanel
          currentUser={currentUser}
          onClose={() => setProfileOpen(false)}
          onProfileUpdate={(updated) => { setCurrentUser(updated); setStoredUser(updated) }}
        />
      )}

      {userMgmtOpen && isAdmin && (
        <UserManagementPanel
          currentUser={currentUser}
          onClose={() => setUserMgmtOpen(false)}
        />
      )}

      {shortcutsOpen && <ShortcutsPanel onClose={() => setShortcutsOpen(false)} />}

      {viewsOpen && (
        <ViewsPanel
          currentUserId={currentUser.id}
          currentPayload={currentViewPayload()}
          onApply={applyView}
          onClose={() => setViewsOpen(false)}
        />
      )}

      {alertsOpen && (
        <AlertsPanel columns={columns} onClose={() => setAlertsOpen(false)} />
      )}

      {formattingOpen && (
        <FormattingPanel
          columns={columns}
          onClose={() => setFormattingOpen(false)}
          onApplied={loadFormatting}
        />
      )}

      {diffOpen && <DiffPanel onClose={() => setDiffOpen(false)} />}
      {pivotOpen && hasData && <PivotPanel columns={columns} filters={stateRef.current} onClose={() => setPivotOpen(false)} />}
      {statsCol && <ColumnStatsPanel col={statsCol} onClose={() => setStatsCol(null)} />}

      {aiQueryOpen && <AiQueryBar onApplyFilters={handleAiApplyFilters} onResetFilters={handleAiResetFilters} onClose={() => setAiQueryOpen(false)} />}
      {aiInsightsOpen && <AiInsightsPanel onDismiss={() => setAiInsightsOpen(false)} />}
      {aiSummaryOpen && <AiSummaryModal filters={stateRef.current} onClose={() => setAiSummaryOpen(false)} />}
      {aiToolsOpen && <AiToolsPanel columns={columns} onClose={() => setAiToolsOpen(false)} />}

      {ConfirmModal}
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
