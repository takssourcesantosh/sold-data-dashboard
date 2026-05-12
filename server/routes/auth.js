import { Router } from 'express'
import jwt from 'jsonwebtoken'
import { findUserByCredentials } from '../db.js'

const router = Router()
const SECRET = process.env.JWT_SECRET || 'bd-dev-secret-change-in-production'

// Simple in-memory rate limiter: max 10 attempts per IP per 15 minutes
const attempts = new Map()
function rateLimit(req, res, next) {
  const ip = req.ip || 'unknown'
  const now = Date.now()
  const WINDOW = 15 * 60 * 1000
  const MAX    = 10
  const entry  = attempts.get(ip)
  if (entry && now < entry.reset) {
    if (entry.count >= MAX) {
      return res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' })
    }
    entry.count++
  } else {
    attempts.set(ip, { count: 1, reset: now + WINDOW })
  }
  next()
}

router.post('/login', rateLimit, (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' })

  const user = findUserByCredentials(username, password)
  if (!user) return res.status(401).json({ error: 'Invalid username or password' })

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    SECRET,
    { expiresIn: '7d' }
  )
  res.json({ token, user: { id: user.id, username: user.username, role: user.role } })
})

export default router
