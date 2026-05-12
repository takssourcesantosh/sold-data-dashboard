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
  db.exec(`
    CREATE TABLE IF NOT EXISTS _backup_meta (
      slot    INTEGER PRIMARY KEY,
      label   TEXT,
      row_count INTEGER,
      created_at TEXT
    )
  `)
  db.exec(`
    CREATE TABLE IF NOT EXISTS _users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      username     TEXT UNIQUE NOT NULL COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role         TEXT NOT NULL DEFAULT 'user',
      avatar       TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `)
  return db
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
      'INSERT OR IGNORE INTO _users (username, password_hash, role) VALUES (?, ?, ?)'
    ).run(u.username, hashPassword(u.password), u.role)
  }
}

export function findUserByCredentials(username, password) {
  const row = db.prepare('SELECT * FROM _users WHERE username = ?').get(username?.trim())
  if (!row || !verifyPassword(password, row.password_hash)) return null
  return safeUser(row)
}

export function getUserById(id) {
  return safeUser(db.prepare('SELECT * FROM _users WHERE id = ?').get(id))
}

export function listAllUsers() {
  return db.prepare(
    'SELECT id, username, role, avatar, created_at FROM _users ORDER BY created_at ASC'
  ).all()
}

export function createUser({ username, password, role }) {
  const stmt = db.prepare(
    'INSERT INTO _users (username, password_hash, role) VALUES (?, ?, ?)'
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
  if (password) db.prepare('UPDATE _users SET password_hash=? WHERE id=?').run(hashPassword(password), id)

  return getUserById(id)
}

export function deleteUser(id) {
  const user = db.prepare('SELECT role FROM _users WHERE id=?').get(id)
  if (!user) throw new Error('User not found')
  if (user.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) AS c FROM _users WHERE role='admin'").get().c
    if (adminCount <= 1) throw new Error("Cannot delete the last admin account")
  }
  db.prepare('DELETE FROM _users WHERE id=?').run(id)
}

export function updateUserPassword(id, currentPassword, newPassword) {
  const row = db.prepare('SELECT password_hash FROM _users WHERE id=?').get(id)
  if (!row) throw new Error('User not found')
  if (!verifyPassword(currentPassword, row.password_hash))
    throw new Error('Current password is incorrect')
  db.prepare('UPDATE _users SET password_hash=? WHERE id=?').run(hashPassword(newPassword), id)
}

export function updateUserAvatar(id, avatar) {
  db.prepare('UPDATE _users SET avatar=? WHERE id=?').run(avatar, id)
}

// ── Backup / restore ──────────────────────────────────────────────────────────

const MAX_BACKUPS = 5

export function createBackup(label = '') {
  if (!tableExists()) return null

  // Pick slot: fill gaps first, then overwrite oldest
  const existing = db.prepare(
    'SELECT slot, created_at FROM _backup_meta ORDER BY created_at ASC'
  ).all()

  let slot
  if (existing.length < MAX_BACKUPS) {
    const used = new Set(existing.map(r => r.slot))
    slot = [1, 2, 3, 4, 5].find(s => !used.has(s))
  } else {
    slot = existing[0].slot  // oldest
  }

  db.exec(`DROP TABLE IF EXISTS "_backup_${slot}"`)
  db.exec(`CREATE TABLE "_backup_${slot}" AS SELECT * FROM "${TABLE}"`)

  const rowCount = db.prepare(`SELECT COUNT(*) AS c FROM "_backup_${slot}"`).get().c

  db.prepare(`
    INSERT OR REPLACE INTO _backup_meta (slot, label, row_count, created_at)
    VALUES (?, ?, ?, ?)
  `).run(slot, label || new Date().toISOString(), rowCount, new Date().toISOString())

  return slot
}

export function listBackups() {
  return db.prepare(
    'SELECT slot, label, row_count, created_at FROM _backup_meta ORDER BY created_at DESC'
  ).all()
}

export function restoreBackup(slot) {
  const meta = db.prepare('SELECT * FROM _backup_meta WHERE slot = ?').get(slot)
  if (!meta) throw new Error('Backup not found')

  const backupTable = `_backup_${slot}`
  const cols = db.prepare(`PRAGMA table_info("${backupTable}")`).all()
    .filter(r => r.name !== '__id').map(r => r.name)
  if (!cols.length) throw new Error('Backup table is empty or corrupt')

  // Save current data before overwriting (so restore itself is also undoable)
  createBackup(`Before restore — ${meta.label}`)

  db.exec(`DROP TABLE IF EXISTS "${TABLE}"`)
  const colDefs = cols.map(c => `${quoteCol(c)} TEXT`).join(', ')
  db.exec(`CREATE TABLE "${TABLE}" (__id INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs})`)

  const colList = cols.map(quoteCol).join(', ')
  db.exec(`INSERT INTO "${TABLE}" (${colList}) SELECT ${colList} FROM "${backupTable}"`)

  return { columns: cols, rowCount: getRowCount() }
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

export function createTableFromCSV(columns, rows) {
  db.exec(`DROP TABLE IF EXISTS "${TABLE}"`)
  const colDefs = columns.map(c => `${quoteCol(c)} TEXT`).join(', ')
  db.exec(`CREATE TABLE "${TABLE}" (__id INTEGER PRIMARY KEY AUTOINCREMENT, ${colDefs})`)

  const colList = columns.map(quoteCol).join(', ')
  const placeholders = columns.map(() => '?').join(', ')
  const stmt = db.prepare(`INSERT INTO "${TABLE}" (${colList}) VALUES (${placeholders})`)

  db.exec('BEGIN')
  try {
    for (const row of rows) {
      stmt.run(...row.map(v => v == null ? '' : String(v)))
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function appendFromCSV(columns, rows) {
  const existing = getColumns()
  if (existing.length === 0) return createTableFromCSV(columns, rows)

  const match = columns.length === existing.length && columns.every((c, i) => c === existing[i])
  if (!match) throw new Error(`Column mismatch.\nExpected: ${existing.join(', ')}\nGot: ${columns.join(', ')}`)

  const colList = columns.map(quoteCol).join(', ')
  const placeholders = columns.map(() => '?').join(', ')
  const stmt = db.prepare(`INSERT INTO "${TABLE}" (${colList}) VALUES (${placeholders})`)

  db.exec('BEGIN')
  try {
    for (const row of rows) {
      stmt.run(...row.map(v => v == null ? '' : String(v)))
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
    case 'gt':           params.push(parseFloat(val) || 0); return `CAST(${q} AS REAL) > ?`
    case 'lt':           params.push(parseFloat(val) || 0); return `CAST(${q} AS REAL) < ?`
    case 'gte':          params.push(parseFloat(val) || 0); return `CAST(${q} AS REAL) >= ?`
    case 'lte':          params.push(parseFloat(val) || 0); return `CAST(${q} AS REAL) <= ?`
    default: return null
  }
}

export function queryRows({ search = '', sortCol = null, sortDir = 'asc', columnFilters = {}, valueFilters = {}, advancedFilters = [] } = {}) {
  if (!tableExists()) return { columns: [], rows: [] }

  const columns = getColumns()
  if (!columns.length) return { columns: [], rows: [] }

  const selectCols = ['__id', ...columns.map(quoteCol)].join(', ')
  let sql = `SELECT ${selectCols} FROM "${TABLE}"`
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

  if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`
  if (sortCol && columns.includes(sortCol)) {
    sql += ` ORDER BY ${quoteCol(sortCol)} ${sortDir === 'desc' ? 'DESC' : 'ASC'}`
  }

  const rawRows = db.prepare(sql).all(...params)
  return {
    columns,
    rows: rawRows.map(row => [row.__id, ...columns.map(c => row[c] ?? '')])
  }
}

export function updateCell(rowId, column, value) {
  if (!tableExists()) return
  const cols = getColumns()
  if (!cols.includes(column)) return
  db.prepare(`UPDATE "${TABLE}" SET ${quoteCol(column)} = ? WHERE __id = ?`).run(value, rowId)
}

export function getDistinctValues(column) {
  if (!tableExists()) return []
  const cols = getColumns()
  if (!cols.includes(column)) return []
  const rows = db.prepare(
    `SELECT DISTINCT ${quoteCol(column)} AS v FROM "${TABLE}" ORDER BY ${quoteCol(column)} ASC LIMIT 20000`
  ).all()
  return rows.map(r => r.v == null ? '' : String(r.v))
}

export function exportCsv() {
  const { columns, rows } = queryRows()
  if (!columns.length) return ''

  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  return [
    columns.map(esc).join(','),
    ...rows.map(row => row.slice(1).map(esc).join(',')),
  ].join('\n')
}
