import jwt from 'jsonwebtoken'
import { JWT_SECRET } from '../auth-config.js'
import { getUserTokenVersion } from '../db.js'

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' })
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET)
    // Token revocation check: token_version must match current DB value.
    const currentVer = getUserTokenVersion(payload.id)
    if (currentVer == null) return res.status(401).json({ error: 'User no longer exists' })
    if ((payload.tv ?? 0) !== currentVer) {
      return res.status(401).json({ error: 'Session revoked. Please log in again.' })
    }
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid token' })
  }
}

export function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' })
    next()
  })
}
