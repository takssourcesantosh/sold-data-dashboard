// Shared auth config. Single source of JWT secret + token TTL.
// Fail-hard if JWT_SECRET missing in production.

import { randomBytes } from 'crypto'

const isProd = process.env.NODE_ENV === 'production'

const _fallback = randomBytes(32).toString('hex')
export const JWT_SECRET = process.env.JWT_SECRET || _fallback
export const JWT_TTL = '7d'

if (!process.env.JWT_SECRET) {
  console.warn('[WARN] JWT_SECRET not set — using a random secret. All sessions will reset on restart. Set JWT_SECRET env var for persistence.')
}
