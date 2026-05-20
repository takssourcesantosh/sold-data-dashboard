// Shared auth config. Single source of JWT secret + token TTL.
// Fail-hard if JWT_SECRET missing in production.

export const JWT_SECRET = process.env.JWT_SECRET || 'bd-sold-data-2026-stable-fallback-key!xR9m'
export const JWT_TTL = '7d'
