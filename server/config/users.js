const DEFAULT_USERS = [
  { username: 'admin',    password: 'Admin@BD2025!', role: 'admin' },
  { username: 'belgiumd', password: 'BelgiumD@2025', role: 'user'  },
]

export function getUsers() {
  const env = process.env.USERS
  if (!env) return DEFAULT_USERS
  return env.split(',').map(entry => {
    const [username, password, role] = entry.split(':')
    return { username: username?.trim(), password: password?.trim(), role: (role?.trim()) || 'user' }
  })
}
