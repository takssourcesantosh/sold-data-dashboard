import { DatabaseSync } from 'node:sqlite'
import { mkdirSync, existsSync } from 'fs'
import { scryptSync, randomBytes, timingSafeEqual } from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const TABLE = 'sheet'
let db

export function initDb() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'sheet.db')
  const dir = path.dirname(dbPath)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  db = new DatabaseSync(dbPath)
  db.exec('PRAGMA journal_mode=WAL')
  db.exec('PRAGMA synchronous=NORMAL')
  db.exec('PRAGMA foreign_keys=ON')
  db.exec(`
    CREATE TABLE IF NOT EXISTS _backup_meta (
      slot    INTEGER PRIMARY KEY,
      label   TEXT,
      row_count INTEGER,
      created_at TEXT,
      pinned INTEGER DEFAULT 0
    )
  `)
  // Add pinned col if existing schema doesn't have it
  try { db.exec('ALTER TABLE _backup_meta ADD COLUMN pinned INTEGER DEFAULT 0') } catch {}
  db.exec(`
    CREATE TABLE IF NOT EXISTS _users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'user',
      avatar       TEXT,
      token_version INTEGER NOT NULL DEFAULT 0,
      must_change_password INTEGER NOT NULL DEFAULT 0,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  // Migrations for older installs
  try { db.exec('ALTER TABLE _users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0') } catch {}
  try { db.exec('ALTER TABLE _users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0') } catch {}
  try { db.exec('ALTER TABLE _users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0') } catch {}
  try { db.exec('ALTER TABLE _users ADD COLUMN locked_until TEXT') } catch {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS _audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS _views (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      payload TEXT NOT NULL,
      shared INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS _alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      column_name TEXT NOT NULL,
      op TEXT NOT NULL,
      threshold TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_triggered_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS _formatting (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      column_name TEXT NOT NULL,
      rule TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)

  return db
}

// ── Audit ────────────────────────────────────────────────────────────────────

export function logAudit({ userId = null, username = null, action, details = null, ip = null }) {
  try {
    db.prepare(
      'INSERT INTO _audit_log (user_id, username, action, details, ip) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, username, action, details ? JSON.stringify(details) : null, ip)
  } catch (err) { console.error('audit log failed:', err.message) }
}

export function listAudit({ limit = 200 } = {}) {
  return db.prepare(
    'SELECT id, user_id, username, action, details, ip, created_at FROM _audit_log ORDER BY id DESC LIMIT ?'
  ).all(limit)
}

// ── User management ───────────────────────────────────────────────────────────

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${derived}`
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const hashBuf = Buffer.from(hash, 'hex')
    const derived = scryptSync(password, salt, 64)
    return timingSafeEqual(hashBuf, derived)
  } catch { return false }
}

function safeUser(row) {
  if (!row) return null
  const { password_hash, ...rest } = row
  return rest
}

export function seedUsersFromConfig(configUsers) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM _users').get().c
  if (count > 0) return
  for (const u of configUsers) {
    db.prepare(
      'INSERT OR IGNORE INTO _users (username, password_hash, role, must_change_password) VALUES (?, ?, ?, 1)'
    ).run(u.username, hashPassword(u.password), u.role)
  }
}

export function findUserByCredentials(username, password) {
  const row = db.prepare('SELECT * FROM _users WHERE username = ?').get(username?.trim())
  if (!row) return { user: null, reason: 'invalid' }

  // Lockout check
  if (row.locked_until) {
    const lockMs = new Date(row.locked_until).getTime()
    if (lockMs > Date.now()) return { user: null, reason: 'locked', until: row.locked_until }
  }

  if (!verifyPassword(password, row.password_hash)) {
    // Increment failed attempts; lock at 10 attempts for 15 min
    const newAttempts = (row.failed_attempts ?? 0) + 1
    let lockedUntil = null
    if (newAttempts >= 10) {
      lockedUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    }
    db.prepare('UPDATE _users SET failed_attempts=?, locked_until=? WHERE id=?')
      .run(newAttempts, lockedUntil, row.id)
    return { user: null, reason: 'invalid' }
  }

  // Reset attempts on success
  db.prepare('UPDATE _users SET failed_attempts=0, locked_until=NULL WHERE id=?').run(row.id)
  return { user: safeUser(row), reason: 'ok', tokenVersion: row.token_version ?? 0 }
}

export function getUserById(id) {
  return db.prepare(
    'SELECT id, username, role, avatar, must_change_password, created_at FROM _users WHERE id = ?'
  ).get(id) ?? null
}

export function getUserTokenVersion(id) {
  const row = db.prepare('SELECT token_version FROM _users WHERE id = ?').get(id)
  return row ? (row.token_version ?? 0) : null
}

export function bumpUserTokenVersion(id) {
  db.prepare('UPDATE _users SET token_version = token_version + 1 WHERE id = ?').run(id)
}

export function listAllUsers() {
  return db.prepare(
    'SELECT id, username, role, must_change_password, created_at FROM _users ORDER BY created_at ASC'
  ).all()
}

export function createUser({ username, password, role }) {
  const stmt = db.prepare(
    'INSERT INTO _users (username, password_hash, role, must_change_password) VALUES (?, ?, ?, 1)'
  )
  const result = stmt.run(username, hashPassword(password), role)
  return getUserById(result.lastInsertRowid)
}

export function updateUser(id, { username, password, role }) {
  const current = db.prepare('SELECT * FROM _users WHERE id = ?').get(id)
  if (!current) throw new Error('User not found')

  if (current.role === 'admin' && role === 'user') {
    const adminCount = db.prepare("SELECT COUNT(*) AS c FROM _users WHERE role='admin'").get().c
    if (adminCount <= 1) throw new Error("Cannot demote the last admin account")
  }

  if (username) db.prepare('UPDATE _users SET username=? WHERE id=?').run(username, id)
  if (role)     db.prepare('UPDATE _users SET role=? WHERE id=?').run(role, id)
  if (password) {
    db.prepare('UPDATE _users SET password_hash=?, must_change_password=0 WHERE id=?').run(hashPassword(password), id)
    bumpUserTokenVersion(id) // invalidate all sessions
  }

  return getUserById(id)
}

export function deleteUser(id) {
  const user = db.prepare('SELECT role FROM _users WHERE id=?').get(id)
  if (!user) throw new Error('User not found')
  if (user.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) AS c FROM _users WHERE role='admin'").get().c
    if (adminCount <= 1) throw new Error("Cannot delete the last admin account")
  }
  db.prepare('DELETE FROM _formatting WHERE user_id=?').run(id)
  db.prepare('DELETE FROM _views WHERE user_id=?').run(id)
  db.prepare('DELETE FROM _alerts WHERE user_id=?').run(id)
  db.prepare('DELETE FROM _users WHERE id=?').run(id)
}

export function updateUserPassword(id, currentPassword, newPassword) {
  const row = db.prepare('SELECT password_hash FROM _users WHERE id=?').get(id)
  if (!row) throw new Error('User not found')
  if (!verifyPassword(currentPassword, row.password_hash))
    throw new Error('Current password is incorrect')
  db.prepare('UPDATE _users SET password_hash=?, must_change_password=0 WHERE id=?').run(hashPassword(newPassword), id)
  bumpUserTokenVersion(id) // invalidate other sessions
}

export function updateUserAvatar(id, avatar) {
  db.prepare('UPDATE _users SET avatar=? WHERE id=?').run(avatar, id)
}

// ── Backup / restore ──────────────────────────────────────────────────────────

const MAX_BACKUPS = 5

export function createBackup(label = '') {
  if (!tableExists()) return null

  // Pick slot: fill gaps first, then overwrite oldest unpinned
  const existing = db.prepare(
    'SELECT slot, created_at, pinned FROM _backup_meta ORDER BY created_at ASC'
  ).all()

  let slot
  if (existing.length < MAX_BACKUPS) {
    const used = new Set(existing.map(r => r.slot))
    slot = [1, 2, 3, 4, 5].find(s => !used.has(s))
  } else {
    // Pick oldest unpinned
    const unpinned = existing.filter(r => !r.pinned)
    if (unpinned.length === 0) {
      // All pinned — overwrite oldest anyway
      slot = existing[0].slot
    } else {
      slot = unpinned[0].slot
    }
  }

  db.exec(`DROP TABLE IF EXISTS "_backup_${slot}"`)
  db.exec(`CREATE TABLE "_backup_${slot}" AS SELECT * FROM "${TABLE}"`)

  const rowCount = db.prepare(`SELECT COUNT(*) AS c FROM "_backup_${slot}"`).get().c

  db.prepare(`
    INSERT OR REPLACE INTO _backup_meta (slot, label, row_count, created_at, pinned)
    VALUES (?, ?, ?, ?, COALESCE((SELECT pinned FROM _backup_meta WHERE slot=?), 0))
  `).run(slot, label || new Date().toISOString(), rowCount, new Date().toISOString(), slot)

  return slot
}

export function pinBackup(slot, pinned) {
  db.prepare('UPDATE _backup_meta SET pinned=? WHERE slot=?').run(pinned ? 1 : 0, slot)
}

export function listBackups() {
  return db.prepare(
    'SELECT slot, label, row_count, created_at, pinned FROM _backup_meta ORDER BY created_at DESC'
  ).all()
}

export function restoreBackup(slot) {
  const meta = db.prepare('SELECT * FROM _backup_meta WHERE slot = ?').get(slot)
  if (!meta) throw new Error('Backup not found')

  const backupTable = `_backup_${slot}`
  const cols = db.prepare(`PRAGMA table_info("${backupTable}")`).all()
    .filter(r => r.name !== '__id').map(r => r.name)
  if (!cols.length) throw new Error('Backup table is empty or corrupt')

  createBackup(`Before restore — ${meta.label}`)

  // Build staging table from backup
  db.exec(`DROP TABLE IF EXISTS "_sheet_staging"`)
  const colDefs = cols.map(c => `${quoteCol(c)} TEXT`).join(', ')
  db.exec(`CREATE TABLE "_sheet_staging" (__id INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs})`)
  const colList = cols.map(quoteCol).join(', ')
  db.exec(`INSERT INTO "_sheet_staging" (${colList}) SELECT ${colList} FROM "${backupTable}"`)

  // Atomic swap
  db.exec(`DROP TABLE IF EXISTS "_sheet_old"`)
  if (tableExists()) db.exec(`ALTER TABLE "${TABLE}" RENAME TO "_sheet_old"`)
  db.exec(`ALTER TABLE "_sheet_staging" RENAME TO "${TABLE}"`)
  db.exec(`DROP TABLE IF EXISTS "_sheet_old"`)

  return { columns: cols, rowCount: getRowCount() }
}

// Diff current sheet vs a backup slot. Identity = full row tuple.
export function diffBackup(slot) {
  if (!tableExists()) throw new Error('No current data')
  const meta = db.prepare('SELECT * FROM _backup_meta WHERE slot=?').get(slot)
  if (!meta) throw new Error('Backup not found')
  const backupTable = `_backup_${slot}`

  const currentCols = getColumns()
  const backupCols = db.prepare(`PRAGMA table_info("${backupTable}")`).all()
    .filter(r => r.name !== '__id').map(r => r.name)

  // Use only columns present in both
  const common = currentCols.filter(c => backupCols.includes(c))
  if (!common.length) throw new Error('No common columns to diff')

  const colList = common.map(quoteCol).join(', ')

  // Rows in current not in backup
  const added = db.prepare(
    `SELECT ${colList} FROM "${TABLE}" EXCEPT SELECT ${colList} FROM "${backupTable}" LIMIT 5000`
  ).all()
  // Rows in backup not in current
  const removed = db.prepare(
    `SELECT ${colList} FROM "${backupTable}" EXCEPT SELECT ${colList} FROM "${TABLE}" LIMIT 5000`
  ).all()

  return {
    columns: common,
    addedRows: added.map(r => common.map(c => r[c] ?? '')),
    removedRows: removed.map(r => common.map(c => r[c] ?? '')),
    addedCount: added.length,
    removedCount: removed.length,
  }
}

function quoteCol(name) {
  return `"${name.replace(/"/g, '""')}"`
}

export function tableExists() {
  const row = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(TABLE)
  return row != null
}

export function getColumns() {
  if (!tableExists()) return []
  return db.prepare(`PRAGMA table_info("${TABLE}")`).all()
    .filter(r => r.name !== '__id').map(r => r.name)
}

export function getRowCount() {
  if (!tableExists()) return 0
  return db.prepare(`SELECT COUNT(*) AS c FROM "${TABLE}"`).get().c
}

export function getMeta() {
  const hasTable = tableExists()
  return { hasTable, columns: hasTable ? getColumns() : [], rowCount: hasTable ? getRowCount() : 0 }
}

const MAX_COLUMNS = 200
const MAX_ROWS = 5_000_000

export function createTableFromCSV(columns, rows) {
  if (columns.length > MAX_COLUMNS) throw new Error(`Too many columns (max ${MAX_COLUMNS})`)
  if (rows.length > MAX_ROWS) throw new Error(`Too many rows (max ${MAX_ROWS.toLocaleString()})`)

  const colDefs = columns.map(c => `${quoteCol(c)} TEXT`).join(', ')
  const colList = columns.map(quoteCol).join(', ')
  const placeholders = columns.map(() => '?').join(', ')

  // Insert into staging table first (inside a transaction)
  db.exec(`DROP TABLE IF EXISTS "_sheet_staging"`)
  db.exec(`CREATE TABLE "_sheet_staging" (__id INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs})`)
  const stmt = db.prepare(`INSERT INTO "_sheet_staging" (${colList}) VALUES (${placeholders})`)
  db.exec('BEGIN IMMEDIATE')
  try {
    for (const row of rows) {
      stmt.run(...row.map(v => v == null ? '' : String(v)))
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  // Atomic swap: rename current → old, staging → main, drop old
  db.exec(`DROP TABLE IF EXISTS "_sheet_old"`)
  if (tableExists()) db.exec(`ALTER TABLE "${TABLE}" RENAME TO "_sheet_old"`)
  db.exec(`ALTER TABLE "_sheet_staging" RENAME TO "${TABLE}"`)
  db.exec(`DROP TABLE IF EXISTS "_sheet_old"`)
}

export function appendFromCSV(columns, rows) {
  const existing = getColumns()
  if (existing.length === 0) return createTableFromCSV(columns, rows)
  if (rows.length > MAX_ROWS) throw new Error(`Too many rows (max ${MAX_ROWS.toLocaleString()})`)

  // Check same column SET (order-independent)
  if (columns.length !== existing.length || !columns.every(c => existing.includes(c))) {
    throw new Error(`Column mismatch.\nExpected: ${existing.join(', ')}\nGot: ${columns.join(', ')}`)
  }

  // Map each incoming column to its position in existing column order
  const srcIdx = existing.map(c => columns.indexOf(c))

  const colList = existing.map(quoteCol).join(', ')
  const placeholders = existing.map(() => '?').join(', ')
  const stmt = db.prepare(`INSERT INTO "${TABLE}" (${colList}) VALUES (${placeholders})`)

  db.exec('BEGIN IMMEDIATE')
  try {
    for (const row of rows) {
      stmt.run(...srcIdx.map(i => { const v = row[i]; return v == null ? '' : String(v) }))
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function clearAllData() {
  db.exec(`DROP TABLE IF EXISTS "${TABLE}"`)
}

function buildAdvancedCondition(col, op, val, params) {
  const q = quoteCol(col)
  switch (op) {
    case 'contains':     params.push(`%${val}%`); return `${q} LIKE ?`
    case 'not_contains': params.push(`%${val}%`); return `${q} NOT LIKE ?`
    case 'equals':       params.push(val);        return `${q} = ?`
    case 'not_equals':   params.push(val);        return `${q} != ?`
    case 'starts':       params.push(`${val}%`);  return `${q} LIKE ?`
    case 'ends':         params.push(`%${val}`);  return `${q} LIKE ?`
    case 'is_empty':     return `(${q} IS NULL OR ${q} = '')`
    case 'is_not_empty': return `(${q} IS NOT NULL AND ${q} != '')`
    case 'gt':  { const n = parseFloat(val); if (isNaN(n)) return null; params.push(n); return `CAST(${q} AS REAL) > ?` }
    case 'lt':  { const n = parseFloat(val); if (isNaN(n)) return null; params.push(n); return `CAST(${q} AS REAL) < ?` }
    case 'gte': { const n = parseFloat(val); if (isNaN(n)) return null; params.push(n); return `CAST(${q} AS REAL) >= ?` }
    case 'lte': { const n = parseFloat(val); if (isNaN(n)) return null; params.push(n); return `CAST(${q} AS REAL) <= ?` }
    default: return null
  }
}

export function queryRows({ search = '', sortCol = null, sortDir = 'asc', columnFilters = {}, valueFilters = {}, advancedFilters = [], dateFilters = {}, sortSpec = [], limit = 100_000, offset = 0 } = {}) {
  if (!tableExists()) return { columns: [], rows: [], totalCount: 0 }

  const columns = getColumns()
  if (!columns.length) return { columns: [], rows: [], totalCount: 0 }

  const selectCols = ['__id', ...columns.map(quoteCol)].join(', ')

  const { whereSql, params } = buildWhereClause(columns, { search, columnFilters, valueFilters, advancedFilters, dateFilters })

  // Count total matching rows
  const { c: totalCount } = db.prepare(`SELECT COUNT(*) AS c FROM "${TABLE}"${whereSql}`).get(...params)

  let sql = `SELECT ${selectCols} FROM "${TABLE}"${whereSql}`

  if (sortSpec && sortSpec.length > 0) {
    // Multi-column sort via sortSpec
    const orderParts = sortSpec
      .filter(s => s.col && columns.includes(s.col))
      .map(s => {
        const numericish = /amount|rate|price|qty|count|total|sum|carat|rap|disc|num|number|weight/i.test(s.col)
        const dir = s.dir === 'desc' ? 'DESC' : 'ASC'
        return numericish
          ? `CAST(${quoteCol(s.col)} AS REAL) ${dir}`
          : `${quoteCol(s.col)} ${dir}`
      })
    if (orderParts.length) sql += ` ORDER BY ${orderParts.join(', ')}`
  } else if (sortCol && columns.includes(sortCol)) {
    const numericish = /amount|rate|price|qty|count|total|sum|carat|rap|disc|num|number|weight/i.test(sortCol)
    if (numericish) {
      sql += ` ORDER BY CAST(${quoteCol(sortCol)} AS REAL) ${sortDir === 'desc' ? 'DESC' : 'ASC'}`
    } else {
      sql += ` ORDER BY ${quoteCol(sortCol)} ${sortDir === 'desc' ? 'DESC' : 'ASC'}`
    }
  }
  sql += ` LIMIT ? OFFSET ?`

  const rawRows = db.prepare(sql).all(...params, limit, offset)
  return {
    columns,
    rows: rawRows.map(row => [row.__id, ...columns.map(c => row[c] ?? '')]),
    totalCount,
  }
}

export function updateCell(rowId, column, value) {
  if (!tableExists()) return
  const cols = getColumns()
  if (!cols.includes(column)) return
  db.prepare(`UPDATE "${TABLE}" SET ${quoteCol(column)} = ? WHERE __id = ?`).run(value, rowId)
}

export function getDistinctValues(column) {
  if (!tableExists()) return { values: [], truncated: false }
  const cols = getColumns()
  if (!cols.includes(column)) return { values: [], truncated: false }
  const FETCH = 20001 // one extra to detect truncation
  const rows = db.prepare(
    `SELECT DISTINCT ${quoteCol(column)} AS v FROM "${TABLE}" ORDER BY ${quoteCol(column)} ASC LIMIT ?`
  ).all(FETCH)
  const truncated = rows.length > 20000
  const values = rows.slice(0, 20000).map(r => r.v == null ? '' : String(r.v))
  return { values, truncated }
}

// Escape a cell for CSV export. Also neutralize Excel formula-injection:
// prefix cells starting with =, +, -, @, tab, CR with a single quote.
function csvEscapeCell(v) {
  let s = v == null ? '' : String(v)
  if (s.length && /^[=+\-@\t\r]/.test(s)) s = "'" + s
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

// Shared WHERE clause builder used by queryRows, streamCsvExport, and exportXlsx.
// columns: string[] of valid column names in the table
// filters: { search, columnFilters, valueFilters, advancedFilters, dateFilters }
// dateFilters: { COL_NAME: { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } }
function buildWhereClause(columns, filters = {}) {
  const { search = '', columnFilters = {}, valueFilters = {}, advancedFilters = [], dateFilters = {} } = filters
  const params = []
  const conditions = []

  if (search.trim()) {
    const globalConds = columns.map(c => `${quoteCol(c)} LIKE ?`)
    conditions.push(`(${globalConds.join(' OR ')})`)
    columns.forEach(() => params.push(`%${search.trim()}%`))
  }

  for (const [col, val] of Object.entries(columnFilters)) {
    if (val && val.trim() && columns.includes(col)) {
      conditions.push(`${quoteCol(col)} LIKE ?`)
      params.push(`%${val.trim()}%`)
    }
  }

  for (const [col, vals] of Object.entries(valueFilters)) {
    if (Array.isArray(vals) && vals.length > 0 && columns.includes(col)) {
      const phs = vals.map(() => '?').join(', ')
      conditions.push(`${quoteCol(col)} IN (${phs})`)
      params.push(...vals)
    }
  }

  for (const rule of advancedFilters) {
    if (!rule.col || !columns.includes(rule.col)) continue
    const NO_VAL = rule.op === 'is_empty' || rule.op === 'is_not_empty'
    if (!NO_VAL && (!rule.val && rule.val !== 0)) continue
    const cond = buildAdvancedCondition(rule.col, rule.op, rule.val, params)
    if (cond) conditions.push(cond)
  }

  for (const [col, range] of Object.entries(dateFilters)) {
    if (!columns.includes(col)) continue
    const { from, to } = range || {}
    if (from) {
      conditions.push(`date(${quoteCol(col)}) >= date(?)`)
      params.push(from)
    }
    if (to) {
      conditions.push(`date(${quoteCol(col)}) <= date(?)`)
      params.push(to)
    }
  }

  const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
  return { whereSql, params }
}

// Stream rows to a writable response. Avoids holding entire CSV in memory.
export function streamCsvExport(res, filters = {}) {
  if (!tableExists()) { res.end(''); return }
  const columns = getColumns()
  if (!columns.length) { res.end(''); return }

  const { whereSql, params } = buildWhereClause(columns, filters)
  const colList = columns.map(quoteCol).join(', ')

  res.write('﻿') // UTF-8 BOM for Excel compatibility
  res.write(columns.map(csvEscapeCell).join(',') + '\n')
  const iter = db.prepare(`SELECT ${colList} FROM "${TABLE}"${whereSql}`).iterate(...params)
  for (const row of iter) {
    res.write(columns.map(c => csvEscapeCell(row[c])).join(',') + '\n')
  }
  res.end()
}

export function getColumnStats(column) {
  if (!tableExists()) return null
  const cols = getColumns()
  if (!cols.includes(column)) return null
  const q = quoteCol(column)
  const r = db.prepare(`SELECT
    COUNT(*) AS total,
    SUM(CASE WHEN ${q} IS NULL OR ${q}='' THEN 1 ELSE 0 END) AS nullCount,
    COUNT(DISTINCT ${q}) AS uniqueCount,
    MIN(CASE WHEN CAST(${q} AS REAL) IS NOT NULL AND ${q} != '' THEN CAST(${q} AS REAL) END) AS numMin,
    MAX(CASE WHEN CAST(${q} AS REAL) IS NOT NULL AND ${q} != '' THEN CAST(${q} AS REAL) END) AS numMax,
    SUM(CAST(${q} AS REAL)) AS numSum,
    AVG(CAST(${q} AS REAL)) AS numAvg,
    MIN(${q}) AS strMin,
    MAX(${q}) AS strMax
  FROM "${TABLE}"`).get()
  return { column, ...r }
}

export async function exportXlsx(filters = {}) {
  if (!tableExists()) return null
  const columns = getColumns()
  if (!columns.length) return null
  const { whereSql, params } = buildWhereClause(columns, filters)
  const { read: _, utils, write } = await import('xlsx')
  const colList = columns.map(quoteCol).join(', ')
  const rows = db.prepare(`SELECT ${colList} FROM "${TABLE}"${whereSql}`).all(...params)
  const wsData = [columns, ...rows.map(r => columns.map(c => r[c] ?? ''))]
  const ws = utils.aoa_to_sheet(wsData)
  const wb = utils.book_new()
  utils.book_append_sheet(wb, ws, 'Data')
  return write(wb, { type: 'buffer', bookType: 'xlsx' })
}

// ── Saved Views ───────────────────────────────────────────────────────────────

export function listViews(userId) {
  return db.prepare(
    'SELECT id, user_id, name, payload, shared, created_at, updated_at FROM _views WHERE user_id=? OR shared=1 ORDER BY updated_at DESC'
  ).all(userId)
}

export function createView({ userId, name, payload, shared = 0 }) {
  const stmt = db.prepare(
    'INSERT INTO _views (user_id, name, payload, shared) VALUES (?, ?, ?, ?)'
  )
  const result = stmt.run(userId, name, JSON.stringify(payload), shared ? 1 : 0)
  return db.prepare('SELECT * FROM _views WHERE id=?').get(result.lastInsertRowid)
}

export function updateView(id, userId, { name, payload, shared }) {
  const row = db.prepare('SELECT * FROM _views WHERE id=?').get(id)
  if (!row) throw new Error('View not found')
  if (row.user_id !== userId) throw new Error('Not your view')
  db.prepare(
    'UPDATE _views SET name=COALESCE(?, name), payload=COALESCE(?, payload), shared=COALESCE(?, shared), updated_at=datetime("now") WHERE id=?'
  ).run(
    name ?? null,
    payload ? JSON.stringify(payload) : null,
    shared == null ? null : (shared ? 1 : 0),
    id
  )
  return db.prepare('SELECT * FROM _views WHERE id=?').get(id)
}

export function deleteView(id, userId) {
  const row = db.prepare('SELECT * FROM _views WHERE id=?').get(id)
  if (!row) return
  if (row.user_id !== userId) throw new Error('Not your view')
  db.prepare('DELETE FROM _views WHERE id=?').run(id)
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export function listAlerts(userId) {
  return db.prepare(
    'SELECT * FROM _alerts WHERE user_id=? ORDER BY created_at DESC'
  ).all(userId)
}

export function createAlert({ userId, name, column_name, op, threshold }) {
  const stmt = db.prepare(
    'INSERT INTO _alerts (user_id, name, column_name, op, threshold) VALUES (?, ?, ?, ?, ?)'
  )
  const result = stmt.run(userId, name, column_name, op, String(threshold))
  return db.prepare('SELECT * FROM _alerts WHERE id=?').get(result.lastInsertRowid)
}

export function updateAlert(id, userId, patch) {
  const row = db.prepare('SELECT * FROM _alerts WHERE id=?').get(id)
  if (!row || row.user_id !== userId) throw new Error('Alert not found')
  const fields = []
  const params = []
  for (const k of ['name', 'column_name', 'op', 'threshold', 'enabled']) {
    if (patch[k] != null) {
      fields.push(`${k}=?`)
      params.push(k === 'enabled' ? (patch[k] ? 1 : 0) : String(patch[k]))
    }
  }
  if (!fields.length) return row
  params.push(id)
  db.prepare(`UPDATE _alerts SET ${fields.join(', ')} WHERE id=?`).run(...params)
  return db.prepare('SELECT * FROM _alerts WHERE id=?').get(id)
}

export function deleteAlert(id, userId) {
  db.prepare('DELETE FROM _alerts WHERE id=? AND user_id=?').run(id, userId)
}

// Evaluate alerts after data change. Returns triggered alerts with counts.
export function evaluateAlerts() {
  if (!tableExists()) return []
  const cols = getColumns()
  const alerts = db.prepare('SELECT * FROM _alerts WHERE enabled=1').all()
  const triggered = []
  for (const a of alerts) {
    if (!cols.includes(a.column_name)) continue
    const params = []
    const cond = buildAdvancedCondition(a.column_name, a.op, a.threshold, params)
    if (!cond) continue
    const sql = `SELECT COUNT(*) AS c FROM "${TABLE}" WHERE ${cond}`
    try {
      const { c } = db.prepare(sql).get(...params)
      if (c > 0) {
        triggered.push({ ...a, count: c })
        db.prepare('UPDATE _alerts SET last_triggered_at=datetime("now") WHERE id=?').run(a.id)
      }
    } catch {}
  }
  return triggered
}

// ── Conditional Formatting ───────────────────────────────────────────────────

export function listFormatting(userId) {
  return db.prepare('SELECT * FROM _formatting WHERE user_id=? ORDER BY id ASC').all(userId)
}

export function saveFormatting(userId, rules) {
  db.exec('BEGIN IMMEDIATE')
  try {
    db.prepare('DELETE FROM _formatting WHERE user_id=?').run(userId)
    const stmt = db.prepare('INSERT INTO _formatting (user_id, column_name, rule) VALUES (?, ?, ?)')
    for (const r of rules) {
      stmt.run(userId, r.column_name, JSON.stringify(r.rule))
    }
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

// ── Pivot ─────────────────────────────────────────────────────────────────────

export function pivot({ rowDims = [], colDim = null, valueCol, agg = 'sum' }) {
  if (!tableExists()) return { rowDims: [], cols: [], rows: [] }
  const cols = getColumns()
  for (const d of rowDims) if (!cols.includes(d)) throw new Error(`Unknown dimension: ${d}`)
  if (colDim && !cols.includes(colDim)) throw new Error(`Unknown column dim: ${colDim}`)
  if (!cols.includes(valueCol)) throw new Error(`Unknown value column: ${valueCol}`)
  if (!['sum', 'avg', 'min', 'max', 'count'].includes(agg)) throw new Error('Bad agg')

  const aggExpr = agg === 'count'
    ? `COUNT(*)`
    : `${agg.toUpperCase()}(CAST(${quoteCol(valueCol)} AS REAL))`

  const groupBy = [...rowDims, ...(colDim ? [colDim] : [])].map(quoteCol).join(', ')
  const selectCols = [...rowDims, ...(colDim ? [colDim] : [])].map(quoteCol).join(', ')

  const PIVOT_LIMIT = 50000
  const sql = `SELECT ${selectCols}${selectCols ? ',' : ''} ${aggExpr} AS _v FROM "${TABLE}" ${groupBy ? 'GROUP BY ' + groupBy : ''} LIMIT ${PIVOT_LIMIT + 1}`
  const raw = db.prepare(sql).all()
  const truncated = raw.length > PIVOT_LIMIT
  const data = truncated ? raw.slice(0, PIVOT_LIMIT) : raw

  if (!colDim) {
    // 1D table
    return {
      rowDims,
      cols: ['_v'],
      rows: data.map(r => ({ keys: rowDims.map(d => r[d] ?? ''), values: { _v: r._v } })),
      truncated,
    }
  }

  // Pivot: bucket by colDim
  const colKeys = new Set()
  const map = new Map() // rowKey → { [colKey]: value }
  for (const r of data) {
    const rk = rowDims.map(d => String(r[d] ?? '')).join('\x1f')
    const ck = String(r[colDim] ?? '')
    colKeys.add(ck)
    if (!map.has(rk)) map.set(rk, { __keys: rowDims.map(d => r[d] ?? '') })
    map.get(rk)[ck] = r._v
  }
  const colList = [...colKeys].sort()
  const rows = [...map.values()].map(o => ({ keys: o.__keys, values: Object.fromEntries(colList.map(c => [c, o[c] ?? null])) }))
  return { rowDims, colDim, cols: colList, rows, truncated }
}
