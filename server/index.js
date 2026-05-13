import 'dotenv/config'
import express from 'express'
import compression from 'compression'
import helmet from 'helmet'
import { fileURLToPath } from 'url'
import path from 'path'
import { existsSync, readFileSync } from 'fs'
import { initDb, tableExists, createTableFromCSV, seedUsersFromConfig } from './db.js'
import { getUsers } from './config/users.js'
import authRouter from './routes/auth.js'
import dataRouter from './routes/data.js'
import usersRouter from './routes/users.js'
import './auth-config.js' // fail-hard on missing JWT_SECRET in prod

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001
const isProd = process.env.NODE_ENV === 'production'

const app = express()
app.set('trust proxy', 1)

// Security headers
app.use(helmet({
  contentSecurityPolicy: isProd ? {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"], // CSS-in-JS
      'img-src': ["'self'", 'data:', 'blob:'],
      'font-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
    },
  } : false,
  crossOriginEmbedderPolicy: false,
}))

app.use(compression())
app.use(express.json({ limit: '500kb' }))

app.get('/api/health', (req, res) => res.json({ ok: true }))
app.use('/api/auth', authRouter)
app.use('/api/data', dataRouter)
app.use('/api/users', usersRouter)

if (isProd) {
  const dist = path.join(__dirname, '..', 'dist')
  app.use(express.static(dist))
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) return res.status(404).json({ error: 'Not found' })
    res.sendFile(path.join(dist, 'index.html'))
  })
}

async function seedIfEmpty() {
  if (tableExists()) return
  const csvPath = path.join(__dirname, '..', 'public', 'sale-data.csv')
  if (!existsSync(csvPath)) return
  try {
    const text = readFileSync(csvPath, 'utf8')
    const Papa = (await import('papaparse')).default
    const { data } = Papa.parse(text, { skipEmptyLines: true, dynamicTyping: false })
    if (data.length < 2) return
    const [rawHeaders, ...dataRows] = data
    const seen = new Map()
    const headers = rawHeaders.map(h => {
      const base = String(h ?? '').trim() || 'Column'
      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      return count === 0 ? base : `${base}_${count}`
    })
    createTableFromCSV(headers, dataRows)
    console.log(`Seeded ${dataRows.length.toLocaleString()} rows from sale-data.csv`)
  } catch (err) {
    console.error('Seed failed:', err.message)
  }
}

initDb()
seedUsersFromConfig(getUsers())
seedIfEmpty().then(() => {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
})
