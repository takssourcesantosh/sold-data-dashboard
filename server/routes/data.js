import { Router } from 'express'
import multer from 'multer'
import Papa from 'papaparse'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import {
  getMeta, queryRows, createTableFromCSV, appendFromCSV,
  clearAllData, updateCell, getDistinctValues, exportCsv, getRowCount,
  createBackup, listBackups, restoreBackup,
} from '../db.js'

const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } })

// ── Parse uploaded file buffer → { headers, dataRows } ───────────────────────

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
    return { headers: sanitize(rawHeaders), dataRows }
  } else {
    const text = buffer.toString('utf8')
    const { data, errors } = Papa.parse(text, { skipEmptyLines: true, dynamicTyping: false })
    if (errors.length && !data.length) throw new Error(errors[0]?.message || 'CSV parse error')
    if (data.length < 2) throw new Error('File has no data rows')
    const [rawHeaders, ...dataRows] = data
    return { headers: sanitize(rawHeaders), dataRows }
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

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/meta', requireAuth, (req, res) => {
  res.json(getMeta())
})

router.get('/rows', requireAuth, (req, res) => {
  try {
    const {
      search = '',
      sortCol = '',
      sortDir = 'asc',
      columnFilters: cfStr = '{}',
      valueFilters: vfStr = '{}',
      advancedFilters: afStr = '[]',
    } = req.query

    const columnFilters = JSON.parse(cfStr)
    const valueFilters  = JSON.parse(vfStr)
    const advancedFilters = JSON.parse(afStr)

    const result = queryRows({
      search,
      sortCol: sortCol || null,
      sortDir,
      columnFilters,
      valueFilters,
      advancedFilters,
    })
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/upload', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    createBackup(req.file.originalname)
    const { headers, dataRows } = await parseBuffer(req.file.originalname, req.file.buffer)
    createTableFromCSV(headers, dataRows)
    res.json({ ok: true, columns: headers, rowCount: getRowCount() })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.post('/append', requireAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const { headers, dataRows } = await parseBuffer(req.file.originalname, req.file.buffer)
    appendFromCSV(headers, dataRows)
    res.json({ ok: true, rowCount: getRowCount() })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.delete('/', requireAdmin, (req, res) => {
  createBackup('Manual clear')
  clearAllData()
  res.json({ ok: true })
})

router.get('/backups', requireAdmin, (req, res) => {
  res.json(listBackups())
})

router.post('/restore/:slot', requireAdmin, (req, res) => {
  try {
    const slot = parseInt(req.params.slot, 10)
    if (!slot || slot < 1 || slot > 5) return res.status(400).json({ error: 'Invalid slot' })
    const result = restoreBackup(slot)
    res.json({ ok: true, ...result })
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
  const csv = exportCsv()
  if (!csv) return res.status(404).json({ error: 'No data' })
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="export.csv"')
  res.send(csv)
})

export default router
