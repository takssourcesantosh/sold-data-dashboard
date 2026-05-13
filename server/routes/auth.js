import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { findUserByCredentials, logAudit, getUserTokenVersion, bumpUserTokenVersion } from '../db.js'
import { JWT_SECRET, JWT_TTL } from '../auth-config.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// Sliding-window rate limit: per (IP, username). 10 attempts / 15 min.
const attempts = new Map() // key → { count, reset }
const WINDOW = 15 * 60 * 1000
const MAX = 10

function rlKey(ip, username) {
  return `${ip}::${(username || '').toLowerCase().trim()}`
}

function checkRate(ip, username) {
  const now = Date.now()
  const key = rlKey(ip, username)
  const entry = attempts.get(key)
  if (entry && now < entry.reset) {
    if (entry.count >= MAX) return { ok: false, retryIn: entry.reset - now }
    entry.count++
  } else {
    attempts.set(key, { count: 1, reset: now + WINDOW })
  }
  return { ok: true }
}

// Periodic cleanup of stale entries (avoid unbounded growth)
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k)
}, 5 * 60 * 1000).unref?.()

router.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' })

  const ip = req.ip || 'unknown'
  const rate = checkRate(ip, username)
  if (!rate.ok) {
    return res.status(429).json({ error: `Too many attempts. Try again in ${Math.ceil(rate.retryIn / 60000)} minutes.` })
  }

  const result = findUserByCredentials(username, password)
  if (result.reason === 'locked') {
    logAudit({ username, action: 'login.locked', ip })
    return res.status(429).json({ error: 'Account locked due to repeated failures. Try again later.' })
  }
  if (!result.user) {
    logAudit({ username, action: 'login.failed', ip })
    return res.status(401).json({ error: 'Invalid username or password' })
  }

  const token = jwt.sign(
    { id: result.user.id, username: result.user.username, role: result.user.role, tv: result.tokenVersion },
    JWT_SECRET,
    { expiresIn: JWT_TTL }
  )
  logAudit({ userId: result.user.id, username: result.user.username, action: 'login.success', ip })
  res.json({
    token,
    user: {
      id: result.user.id,
      username: result.user.username,
      role: result.user.role,
      must_change_password: result.user.must_change_password ?? 0,
    },
  })
})

// Logout: bump token_version → all existing tokens invalid.
router.post('/logout', requireAuth, (req, res) => {
  bumpUserTokenVersion(req.user.id)
  logAudit({ userId: req.user.id, username: req.user.username, action: 'logout', ip: req.ip })
  res.json({ ok: true })
})

export default router
