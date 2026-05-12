const BASE = '/api'

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

// ── Base fetch wrapper ────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const headers = { ...opts.headers }
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  let body = opts.body
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(body)
  }

  const res = await fetch(BASE + path, { ...opts, headers, body })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || res.statusText)
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
  return data.user
}

export function logoutApi() {
  setToken(null)
  setStoredUser(null)
}

// ── DB shims (mirror src/db.js API) ──────────────────────────────────────────

let _meta = { hasTable: false, columns: [], rowCount: 0 }

export async function initDb() {
  const res = await apiFetch('/data/meta')
  _meta = await res.json()
}

export function tableExists() {
  return _meta.hasTable
}

export async function queryRows({ search = '', sortCol = null, sortDir = 'asc', columnFilters = {}, valueFilters = {}, advancedFilters = [] } = {}) {
  const params = new URLSearchParams({
    search,
    sortCol: sortCol || '',
    sortDir,
    columnFilters:   JSON.stringify(columnFilters),
    valueFilters:    JSON.stringify(valueFilters),
    advancedFilters: JSON.stringify(advancedFilters),
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

  // Simulate upload progress (fetch doesn't expose upload progress)
  let pct = 0
  const ticker = setInterval(() => {
    pct = Math.min(pct + 8, 85)
    onProgress?.(pct)
  }, 250)

  try {
    const res = await apiFetch('/data/upload', { method: 'POST', body: form })
    clearInterval(ticker)
    onProgress?.(100)
    const data = await res.json()
    _meta = { hasTable: true, columns: data.columns, rowCount: data.rowCount }
  } catch (err) {
    clearInterval(ticker)
    throw err
  }
}

export async function appendFromCSV(file) {
  const form = new FormData()
  form.append('file', file)
  const res = await apiFetch('/data/append', { method: 'POST', body: form })
  const data = await res.json()
  _meta.rowCount = data.rowCount
}

export async function clearAllData() {
  await apiFetch('/data', { method: 'DELETE' })
  _meta = { hasTable: false, columns: [], rowCount: 0 }
}

export async function updateCell(rowId, column, value) {
  await apiFetch('/data/cell', { method: 'PUT', body: { rowId, column, value } })
}

export async function getDistinctValues(column) {
  const res = await apiFetch(`/data/distinct/${encodeURIComponent(column)}`)
  const data = await res.json()
  return data.values
}

export async function exportCsvAndDownload() {
  const res = await apiFetch('/data/export')
  const text = await res.text()
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: 'export.csv' })
  a.click()
  URL.revokeObjectURL(url)
}

export function getRowCount() {
  return _meta.rowCount
}

export async function listBackups() {
  const res = await apiFetch('/data/backups')
  return res.json()
}

export async function restoreBackup(slot) {
  const res = await apiFetch(`/data/restore/${slot}`, { method: 'POST' })
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
