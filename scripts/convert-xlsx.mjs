import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const src = process.argv[2]
if (!src) {
  console.error('Usage: node scripts/convert-xlsx.mjs <path-to-xlsx>')
  process.exit(1)
}

console.log(`Reading ${src} ...`)
const wb = XLSX.readFile(src, { cellDates: true })
const ws = wb.Sheets[wb.SheetNames[0]]
const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

// Filter blank rows
const rows = raw.filter(r => r.some(c => c !== '' && c != null))
console.log(`Sheet: "${wb.SheetNames[0]}" — ${rows.length - 1} data rows, ${rows[0]?.length ?? 0} columns`)

// Build CSV
const esc = (v) => {
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '')
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s
}

const csv = rows.map(row => row.map(esc).join(',')).join('\n')

if (!existsSync('public')) mkdirSync('public', { recursive: true })
writeFileSync('public/sale-data.csv', csv, 'utf8')
console.log(`Written to public/sale-data.csv (${(csv.length / 1024).toFixed(0)} KB)`)
