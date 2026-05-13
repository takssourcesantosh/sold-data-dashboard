import { Router } from 'express'
import multer from 'multer'
import Papa from 'papaparse'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import {
  getMeta, queryRows, createTableFromCSV, appendFromCSV,
  clearAllData, updateCell, getDistinctValues, streamCsvExport, getRowCount,
  createBackup, listBackups, restoreBackup, pinBackup, diffBackup,
  listViews, createView, updateView, deleteView,
  listAlerts, createAlert, updateAlert, deleteAlert, evaluateAlerts,
  listFormatting, saveFormatting,
  pivot,
  logAudit,
} from '../db.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

const MAX_HEADERS = 200
const MAX_ROWS = 5_000_000

async function parseBuffer(filename, buffer) {
  const ext = (filename || '').toLowerCase().split('.').pop()
  if (ext === 'xlsx' || ext === 'xls' || ext === 'xlsm') {
    const { read, utils } = await import('xlsx')
    const wb = read(buffer, { type: 'buffer', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = utils.sheet_to_json(ws, { header: 1, defval: '' })
      .filter(r => r.some(c => c !== ''))
    if (raw.length < 2) throw new Error('File has no data rows')
    const [rawHeaders, ...dataRows] = raw
    if (rawHeaders.length > MAX_HEADERS) throw new Error(`Too many columns (max ${MAX_HEADERS})`)
    if (dataRows.length > MAX_ROWS) throw new Error(`Too many rows (max ${MAX_ROWS.toLocaleString()})`)
    return { headers: sanitize(rawHeaders), dataRows }
  } else if (ext === 'csv') {
    const text = buffer.toString('utf8')
    const { data, errors } = Papa.parse(text, { skipEmptyLines: true, dynamicTyping: false })
    if (errors.length && !data.length) throw new Error(errors[0]?.message || 'CSV parse error')
    if (data.length < 2) throw new Error('File has no data rows')
    const [rawHeaders, ...dataRows] = data
    if (rawHeaders.length > MAX_HEADERS) throw new Error(`Too many columns (max ${MAX_HEADERS})`)
    if (dataRows.length > MAX_ROWS) throw new Error(`Too many rows (max ${MAX_ROWS.toLocaleString()})`)
    return { headers: sanitize(rawHeaders), dataRows }
  } else {
    throw new Error('Unsupported file type. Use CSV, XLSX, XLS, or XLSM.')
  }
}

function sanitize(rawHeaders) {
  const seen = new Map()
  return rawHeaders.map(h => {
    const base = String(h ?? '').trim() || 'Column'
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}_${count}`
  })
}

// ── Core data routes ─────────────────────────────────────────────────────────

router.get('/meta', requireAuth, (req, res) => res.json(getMeta()))

router.get('/rows', requireAuth, (req, res) => {
  try {
    const {
      search = '',
      sortCol = '',
      sortDir = 'asc',
      columnFilters: cfStr = '{}',
      valueFilters: vfStr = '{}',
      advancedFilters: afStr = '[]',
      limit: limitStr = '100000',
      offset: offsetStr = '0',
    } = req.query
    const result = queryRows({
      search,
      sortCol: sortCol || null,
      sortDir,
      columnFilters: JSON.parse(cfStr),
      valueFilters: JSON.parse(vfStr),
      advancedFilters: JSON.parse(afStr),
      limit: Math.min(parseInt(limitStr, 10) || 100_000, 100_000),
      offset: parseInt(offsetStr, 10) || 0,
    })
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    // Parse first — don't consume a backup slot if the file is invalid
    const { headers, dataRows } = await parseBuffer(req.file.originalname, req.file.buffer)
    createBackup(req.file.originalname)
    createTableFromCSV(headers, dataRows)
    logAudit({ userId: req.user.id, username: req.user.username, action: 'data.upload', details: { rows: dataRows.length, file: req.file.originalname }, ip: req.ip })
    const triggered = evaluateAlerts()
    res.json({ ok: true, columns: headers, rowCount: getRowCount(), triggeredAlerts: triggered })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/append', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const { headers, dataRows } = await parseBuffer(req.file.originalname, req.file.buffer)
    appendFromCSV(headers, dataRows)
    logAudit({ userId: req.user.id, username: req.user.username, action: 'data.append', details: { rows: dataRows.length, file: req.file.originalname }, ip: req.ip })
    const triggered = evaluateAlerts()
    res.json({ ok: true, rowCount: getRowCount(), triggeredAlerts: triggered })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.delete('/', requireAdmin, (req, res) => {
  createBackup('Manual clear')
  clearAllData()
  logAudit({ userId: req.user.id, username: req.user.username, action: 'data.clear', ip: req.ip })
  res.json({ ok: true })
})

router.get('/backups', requireAdmin, (req, res) => res.json(listBackups()))

router.post('/restore/:slot', requireAdmin, (req, res) => {
  try {
    const slot = parseInt(req.params.slot, 10)
    if (!slot || slot < 1 || slot > 5) return res.status(400).json({ error: 'Invalid slot' })
    const result = restoreBackup(slot)
    logAudit({ userId: req.user.id, username: req.user.username, action: 'data.restore', details: { slot }, ip: req.ip })
    res.json({ ok: true, ...result })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/backups/:slot/pin', requireAdmin, (req, res) => {
  const slot = parseInt(req.params.slot, 10)
  const { pinned } = req.body || {}
  pinBackup(slot, !!pinned)
  res.json({ ok: true })
})

router.get('/diff/:slot', requireAuth, (req, res) => {
  try {
    const slot = parseInt(req.params.slot, 10)
    res.json(diffBackup(slot))
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.put('/cell', requireAdmin, (req, res) => {
  const { rowId, column, value } = req.body || {}
  if (rowId == null || !column) return res.status(400).json({ error: 'rowId and column required' })
  updateCell(rowId, column, value ?? '')
  res.json({ ok: true })
})

router.get('/distinct/:col', requireAuth, (req, res) => {
  const values = getDistinctValues(req.params.col)
  res.json(values)
})

router.get('/export', requireAuth, (req, res) => {
  try {
    const {
      search = '',
      sortCol = '',
      sortDir = 'asc',
      columnFilters: cfStr = '{}',
      valueFilters: vfStr = '{}',
      advancedFilters: afStr = '[]',
    } = req.query
    logAudit({ userId: req.user.id, username: req.user.username, action: 'data.export', ip: req.ip })
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename="export.csv"')
    streamCsvExport(res, {
      search,
      sortCol: sortCol || null,
      sortDir,
      columnFilters: JSON.parse(cfStr),
      valueFilters: JSON.parse(vfStr),
      advancedFilters: JSON.parse(afStr),
    })
  } catch (err) {
    if (!res.headersSent) res.status(400).json({ error: err.message })
  }
})

// ── Saved Views ──────────────────────────────────────────────────────────────

router.get('/views', requireAuth, (req, res) => {
  const rows = listViews(req.user.id).map(r => ({ ...r, payload: JSON.parse(r.payload) }))
  res.json(rows)
})

router.post('/views', requireAuth, (req, res) => {
  const { name, payload, shared } = req.body || {}
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' })
  if (!payload || typeof payload !== 'object') return res.status(400).json({ error: 'Payload required' })
  const view = createView({ userId: req.user.id, name: name.trim(), payload, shared })
  res.json({ ...view, payload: JSON.parse(view.payload) })
})

router.put('/views/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const view = updateView(id, req.user.id, req.body || {})
    res.json({ ...view, payload: JSON.parse(view.payload) })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

router.delete('/views/:id', requireAuth, (req, res) => {
  try {
    deleteView(parseInt(req.params.id, 10), req.user.id)
    res.json({ ok: true })
  } catch (err) { res.status(400).json({ error: err.message }) }
})

// ── Alerts ───────────────────────────────────────────────────────────────────

router.get('/alerts', requireAuth, (req, res) => res.json(listAlerts(req.user.id)))

router.post('/alerts', requireAuth, (req, res) => {
  const { name, column_name, op, threshold } = req.body || {}
  if (!name?.trim() || !column_name || !op) return res.status(400).json({ error: 'name, column_name, op required' })
  res.json(createAlert({ userId: req.user.id, name: name.trim(), column_name, op, threshold }))
})

router.put('/alerts/:id', requireAuth, (req, res) => {
  try {
    res.json(updateAlert(parseInt(req.params.id, 10), req.user.id, req.body || {}))
  } catch (err) { res.status(400).json({ error: err.message }) }
})

router.delete('/alerts/:id', requireAuth, (req, res) => {
  deleteAlert(parseInt(req.params.id, 10), req.user.id)
  res.json({ ok: true })
})

router.post('/alerts/evaluate', requireAuth, (req, res) => {
  res.json(evaluateAlerts())
})

// ── Conditional Formatting ───────────────────────────────────────────────────

router.get('/formatting', requireAuth, (req, res) => {
  const rows = listFormatting(req.user.id).map(r => ({ id: r.id, column_name: r.column_name, rule: JSON.parse(r.rule) }))
  res.json(rows)
})

router.put('/formatting', requireAuth, (req, res) => {
  const { rules } = req.body || {}
  if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules array required' })
  saveFormatting(req.user.id, rules)
  res.json({ ok: true })
})

// ── Pivot ────────────────────────────────────────────────────────────────────

router.post('/pivot', requireAuth, (req, res) => {
  try {
    const { rowDims, colDim, valueCol, agg } = req.body || {}
    res.json(pivot({ rowDims: rowDims || [], colDim: colDim || null, valueCol, agg }))
  } catch (err) { res.status(400).json({ error: err.message }) }
})

export default router
