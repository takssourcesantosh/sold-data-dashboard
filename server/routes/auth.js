import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { findUserByCredentials, logAudit, getUserTokenVersion, bumpUserTokenVersion, checkRateLimit, clearExpiredRateLimits } from '../db.js'
import { JWT_SECRET, JWT_TTL } from '../auth-config.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

// Periodic cleanup of stale DB rate-limit entries
setInterval(() => {
  try { clearExpiredRateLimits() }
  catch (err) { console.error('[auth] rate-limit cleanup failed:', err.message) }
}, 5 * 60 * 1000).unref?.()

router.post('/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' })

  const ip = req.ip || 'unknown'
  const rate = checkRateLimit(ip, username)
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

// Refresh: exchange a still-valid token for a fresh one with full TTL.
router.post('/refresh', requireAuth, (req, res) => {
  const tv = getUserTokenVersion(req.user.id)
  const token = jwt.sign(
    { id: req.user.id, username: req.user.username, role: req.user.role, tv },
    JWT_SECRET,
    { expiresIn: JWT_TTL }
  )
  logAudit({ userId: req.user.id, username: req.user.username, action: 'token.refresh', ip: req.ip })
  res.json({ token })
})

// Logout: bump token_version → all existing tokens invalid.
router.post('/logout', requireAuth, (req, res) => {
  bumpUserTokenVersion(req.user.id)
  logAudit({ userId: req.user.id, username: req.user.username, action: 'logout', ip: req.ip })
  res.json({ ok: true })
})

export default router
