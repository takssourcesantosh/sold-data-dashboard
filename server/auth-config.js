// Shared auth config. Single source of JWT secret + token TTL.
// Fail-hard if JWT_SECRET missing in production.

const isProd = process.env.NODE_ENV === 'production'

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET env var required in production. Refusing to start with a default secret.')
}

export const JWT_SECRET = process.env.JWT_SECRET || 'bd-dev-secret-change-in-production'
export const JWT_TTL = '7d'

if (!isProd && JWT_SECRET === 'bd-dev-secret-change-in-production') {
  console.warn('[WARN] Using default JWT secret. Set JWT_SECRET in .env before deploying.')
}
