const BASE = '/api'
const DEFAULT_TIMEOUT_MS = 30_000

// ── Multi-tab event bus ───────────────────────────────────────────────────────

const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('bd-app') : null

export function broadcast(type, payload = null) {
  bc?.postMessage({ type, payload, ts: Date.now() })
}

export function onBroadcast(handler) {
  if (!bc) return () => {}
  const fn = (e) => handler(e.data)
  bc.addEventListener('message', fn)
  return () => bc.removeEventListener('message', fn)
}

// ── Token / user storage ──────────────────────────────────────────────────────

function getToken() {
  return localStorage.getItem('bd-token') || ''
}

export function setToken(token) {
  if (token) localStorage.setItem('bd-token', token)
  else localStorage.removeItem('bd-token')
}

export function getStoredUser() {
  try { return JSON.parse(localStorage.getItem('bd-user')) } catch { return null }
}

export function setStoredUser(user) {
  if (user) localStorage.setItem('bd-user', JSON.stringify(user))
  else localStorage.removeItem('bd-user')
}

// ── Base fetch wrapper with AbortController + timeout ────────────────────────

async function apiFetch(path, opts = {}) {
  const headers = { ...opts.headers }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let body = opts.body
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(body)
  }

  const ctrl = new AbortController()
  const timeout = opts.timeout ?? DEFAULT_TIMEOUT_MS
  const timer = setTimeout(() => ctrl.abort(), timeout)

  let res
  try {
    res = await fetch(BASE + path, { ...opts, headers, body, signal: ctrl.signal })
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out. Check your connection.')
    throw err
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
    const msg = errBody.error || res.statusText
    // Auto-logout on 401 session errors — broadcast so all tabs react
    if (res.status === 401) {
      broadcast('auth.expired')
      // Remove token so next page load shows login
      setToken(null)
    }
    throw new Error(msg)
  }
  return res
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function loginApi(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Login failed')
  setToken(data.token)
  setStoredUser(data.user)
  broadcast('auth.login', data.user)
  return data.user
}

export async function logoutApi() {
  // Best-effort server logout (bump token_version)
  try { await apiFetch('/auth/logout', { method: 'POST', timeout: 5000 }) } catch {}
  setToken(null)
  setStoredUser(null)
  broadcast('auth.logout')
}

// Silently refresh token if it expires within 24 h. Returns new token or null.
export async function refreshTokenIfNeeded() {
  const token = getToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    const expiresIn = payload.exp * 1000 - Date.now()
    if (expiresIn > 24 * 60 * 60 * 1000) return null // more than 24 h left — no need
    const res = await apiFetch('/auth/refresh', { method: 'POST', timeout: 5000 })
    const data = await res.json()
    setToken(data.token)
    return data.token
  } catch {
    return null
  }
}

// ── DB shims (mirror src/db.js API) ──────────────────────────────────────────

let _meta = { hasTable: false, columns: [], rowCount: 0 }

export async function initDb() {
  const res = await apiFetch('/data/meta')
  _meta = await res.json()
}

export function tableExists() { return _meta.hasTable }

export async function queryRows({ search = '', sortCol = null, sortDir = 'asc', columnFilters = {}, valueFilters = {}, advancedFilters = [], dateFilters = {}, sortSpec = [] } = {}) {
  const params = new URLSearchParams({
    search, sortCol: sortCol || '', sortDir,
    columnFilters:   JSON.stringify(columnFilters),
    valueFilters:    JSON.stringify(valueFilters),
    advancedFilters: JSON.stringify(advancedFilters),
    dateFilters:     JSON.stringify(dateFilters),
    sortSpec:        JSON.stringify(sortSpec),
  })
  const res = await apiFetch(`/data/rows?${params}`)
  const data = await res.json()
  _meta.hasTable = data.columns.length > 0
  _meta.columns  = data.columns
  return data
}

export async function createTableFromCSV(file, onProgress) {
  const form = new FormData()
  form.append('file', file)

  let pct = 0
  const ticker = setInterval(() => {
    pct = Math.min(pct + 8, 85)
    onProgress?.(pct)
  }, 250)

  try {
    const res = await apiFetch('/data/upload', { method: 'POST', body: form, timeout: 10 * 60_000 })
    clearInterval(ticker)
    onProgress?.(100)
    const data = await res.json()
    _meta = { hasTable: true, columns: data.columns, rowCount: data.rowCount }
    broadcast('data.upload', { rowCount: data.rowCount })
    return data
  } catch (err) {
    clearInterval(ticker)
    throw err
  }
}

export async function appendFromCSV(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await apiFetch('/data/append', { method: 'POST', body: form, timeout: 10 * 60_000 })
  const data = await res.json()
  _meta.rowCount = data.rowCount
  broadcast('data.append', { rowCount: data.rowCount })
  return data
}

export async function clearAllData() {
  await apiFetch('/data', { method: 'DELETE' })
  _meta = { hasTable: false, columns: [], rowCount: 0 }
  broadcast('data.clear')
}

export async function updateCell(rowId, column, value) {
  await apiFetch('/data/cell', { method: 'PUT', body: { rowId, column, value } })
}

export async function getDistinctValues(column) {
  const res = await apiFetch(`/data/distinct/${encodeURIComponent(column)}`)
  const data = await res.json()
  // Server now returns {values, truncated}
  if (data && Array.isArray(data.values)) return data
  // Backwards compat fallback
  return { values: Array.isArray(data) ? data : (data.values ?? []), truncated: false }
}

export async function exportCsvAndDownload(filters = {}) {
  const params = new URLSearchParams({
    search: filters.search || '',
    sortCol: filters.sortCol || '',
    sortDir: filters.sortDir || 'asc',
    columnFilters: JSON.stringify(filters.columnFilters || {}),
    valueFilters: JSON.stringify(filters.valueFilters || {}),
    advancedFilters: JSON.stringify(filters.advancedFilters || []),
    dateFilters: JSON.stringify(filters.dateFilters || {}),
    sortSpec: JSON.stringify(filters.sortSpec || []),
  })
  const res = await apiFetch(`/data/export?${params}`, { timeout: 5 * 60_000 })
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: 'export.csv' })
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportXlsxAndDownload(filters = {}) {
  const params = new URLSearchParams({
    search: filters.search || '',
    sortCol: filters.sortCol || '',
    sortDir: filters.sortDir || 'asc',
    columnFilters: JSON.stringify(filters.columnFilters || {}),
    valueFilters: JSON.stringify(filters.valueFilters || {}),
    advancedFilters: JSON.stringify(filters.advancedFilters || []),
    dateFilters: JSON.stringify(filters.dateFilters || {}),
    sortSpec: JSON.stringify(filters.sortSpec || []),
    format: 'xlsx',
  })
  const res = await apiFetch(`/data/export?${params}`, { timeout: 5 * 60_000 })
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: 'export.xlsx' })
  a.click()
  URL.revokeObjectURL(url)
}

export async function columnStatsApi(col) {
  const res = await apiFetch(`/data/column-stats/${encodeURIComponent(col)}`)
  return res.json()
}

export function getRowCount() { return _meta.rowCount }

export async function listBackups() {
  const res = await apiFetch('/data/backups')
  return res.json()
}

export async function restoreBackup(slot) {
  const res = await apiFetch(`/data/restore/${slot}`, { method: 'POST' })
  broadcast('data.restore', { slot })
  return res.json()
}

export async function pinBackupApi(slot, pinned) {
  await apiFetch(`/data/backups/${slot}/pin`, { method: 'POST', body: { pinned } })
}

export async function diffBackupApi(slot) {
  const res = await apiFetch(`/data/diff/${slot}`)
  return res.json()
}

// ── User management ───────────────────────────────────────────────────────────

export async function getMyProfile() {
  const res = await apiFetch('/users/me')
  return res.json()
}

export async function updateMyPassword(currentPassword, newPassword) {
  const res = await apiFetch('/users/me/password', { method: 'PUT', body: { currentPassword, newPassword } })
  return res.json()
}

export async function updateMyAvatar(avatar) {
  const res = await apiFetch('/users/me/avatar', { method: 'PUT', body: { avatar } })
  return res.json()
}

export async function listUsers() {
  const res = await apiFetch('/users')
  return res.json()
}

export async function createUser({ username, password, role }) {
  const res = await apiFetch('/users', { method: 'POST', body: { username, password, role } })
  return res.json()
}

export async function updateUser(id, patch) {
  const res = await apiFetch(`/users/${id}`, { method: 'PUT', body: patch })
  return res.json()
}

export async function deleteUser(id) {
  const res = await apiFetch(`/users/${id}`, { method: 'DELETE' })
  return res.json()
}

export async function listAudit() {
  const res = await apiFetch('/users/audit')
  return res.json()
}

// ── Saved Views ───────────────────────────────────────────────────────────────

export async function listViewsApi() {
  const res = await apiFetch('/data/views')
  return res.json()
}

export async function saveViewApi(name, payload, shared = false) {
  const res = await apiFetch('/data/views', { method: 'POST', body: { name, payload, shared } })
  return res.json()
}

export async function updateViewApi(id, patch) {
  const res = await apiFetch(`/data/views/${id}`, { method: 'PUT', body: patch })
  return res.json()
}

export async function deleteViewApi(id) {
  await apiFetch(`/data/views/${id}`, { method: 'DELETE' })
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export async function listAlertsApi() { return (await apiFetch('/data/alerts')).json() }
export async function createAlertApi(body) { return (await apiFetch('/data/alerts', { method: 'POST', body })).json() }
export async function updateAlertApi(id, body) { return (await apiFetch(`/data/alerts/${id}`, { method: 'PUT', body })).json() }
export async function deleteAlertApi(id) { await apiFetch(`/data/alerts/${id}`, { method: 'DELETE' }) }
export async function evaluateAlertsApi() { return (await apiFetch('/data/alerts/evaluate', { method: 'POST' })).json() }

// ── Conditional Formatting ───────────────────────────────────────────────────

export async function listFormattingApi() { return (await apiFetch('/data/formatting')).json() }
export async function saveFormattingApi(rules) {
  await apiFetch('/data/formatting', { method: 'PUT', body: { rules } })
}

// ── Pivot ─────────────────────────────────────────────────────────────────────

export async function pivotApi({ rowDims, colDim, valueCol, agg, filters = {} }) {
  const res = await apiFetch('/data/pivot', { method: 'POST', body: { rowDims, colDim, valueCol, agg, filters } })
  return res.json()
}
