// WARNING: Default credentials are for local development only.
// In production, set the USERS environment variable instead:
//   USERS=admin:YourStrongPass!:admin,user2:AnotherPass!:user
const DEFAULT_USERS = [
  { username: 'admin',    password: 'Admin@BD2025!', role: 'admin' },
  { username: 'belgiumd', password: 'BelgiumD@2025', role: 'user'  },
]

export function getUsers() {
  const env = process.env.USERS
  if (!env) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('[SECURITY] USERS env var not set — using hardcoded default credentials. Set USERS before going live!')
    }
    return DEFAULT_USERS
  }
  try {
    const users = env.split(',').map((entry, i) => {
      const parts = entry.split(':')
      const username = parts[0]?.trim()
      const password = parts[1]?.trim()
      const role = parts[2]?.trim() || 'user'
      if (!username || !password) throw new Error(`USERS entry ${i + 1} is malformed (expected "username:password:role")`)
      if (!['admin', 'user'].includes(role)) throw new Error(`USERS entry ${i + 1} has invalid role "${role}" — must be "admin" or "user"`)
      return { username, password, role }
    })
    return users
  } catch (err) {
    console.error('[FATAL] Failed to parse USERS env var:', err.message)
    process.exit(1)
  }
}
