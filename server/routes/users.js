import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import {
  getUserById, listAllUsers, createUser, updateUser, deleteUser,
  updateUserAvatar, updateUserPassword, logAudit, listAudit,
} from '../db.js'

const router = Router()

const MIN_PASSWORD_LEN = 8
const MAX_USERNAME_LEN = 64
const MAX_AVATAR_BYTES = 200 * 1024 // 200 KB
const AVATAR_RX = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890',
  'qwerty123', 'letmein1', 'welcome1', 'iloveyou1',
])

function validatePassword(pw) {
  if (typeof pw !== 'string') return 'Password required'
  if (pw.length < MIN_PASSWORD_LEN) return `Password must be at least ${MIN_PASSWORD_LEN} characters`
  if (pw.length > 200) return 'Password too long'
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 'Password is too common'
  // Require at least 2 of: lower, upper, digit, symbol
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter(rx => rx.test(pw)).length
  if (classes < 2) return 'Password must include at least 2 of: lowercase letter, uppercase letter, number, symbol (e.g. Admin@123)'
  return null
}

function validateUsername(u) {
  if (typeof u !== 'string' || !u.trim()) return 'Username required'
  if (u.length > MAX_USERNAME_LEN) return 'Username too long'
  if (!/^[a-zA-Z0-9._-]+$/.test(u.trim())) return 'Username may only contain letters, numbers, dot, underscore, hyphen'
  return null
}

function validateAvatar(av) {
  if (av == null || av === '') return null
  if (typeof av !== 'string') return 'Invalid avatar'
  if (av.length > MAX_AVATAR_BYTES * 1.4) return 'Avatar too large (max 200 KB)' // base64 inflation
  if (!AVATAR_RX.test(av)) return 'Avatar must be a JPEG, PNG, or WebP data URL'
  return null
}

router.get('/me', requireAuth, (req, res) => {
  const user = getUserById(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
})

router.put('/me/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword) return res.status(400).json({ error: 'Current password required' })
  const err = validatePassword(newPassword)
  if (err) return res.status(400).json({ error: err })
  try {
    updateUserPassword(req.user.id, currentPassword, newPassword)
    logAudit({ userId: req.user.id, username: req.user.username, action: 'password.change', ip: req.ip })
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.put('/me/avatar', requireAuth, (req, res) => {
  const { avatar } = req.body || {}
  const err = validateAvatar(avatar)
  if (err) return res.status(400).json({ error: err })
  try {
    updateUserAvatar(req.user.id, avatar ?? null)
    res.json({ ok: true })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

router.get('/', requireAdmin, (req, res) => {
  try { res.json(listAllUsers()) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

router.post('/', requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {}
  const uErr = validateUsername(username)
  if (uErr) return res.status(400).json({ error: uErr })
  const pErr = validatePassword(password)
  if (pErr) return res.status(400).json({ error: pErr })
  if (!['admin', 'user'].includes(role))
    return res.status(400).json({ error: 'Role must be admin or user' })
  try {
    const user = createUser({ username: username.trim(), password, role })
    logAudit({ userId: req.user.id, username: req.user.username, action: 'user.create', details: { target: user.id, role }, ip: req.ip })
    res.json(user)
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'Username already taken' })
    res.status(400).json({ error: err.message })
  }
})

router.put('/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { username, password, role } = req.body || {}
  if (username != null) {
    const e = validateUsername(username)
    if (e) return res.status(400).json({ error: e })
  }
  if (role && !['admin', 'user'].includes(role))
    return res.status(400).json({ error: 'Role must be admin or user' })
  if (password) {
    const e = validatePassword(password)
    if (e) return res.status(400).json({ error: e })
  }
  try {
    const user = updateUser(id, { username: username?.trim() || null, password: password || null, role: role || null })
    logAudit({ userId: req.user.id, username: req.user.username, action: 'user.update', details: { target: id }, ip: req.ip })
    res.json(user)
  } catch (err) {
    if (err.message.includes('UNIQUE'))
      return res.status(400).json({ error: 'Username already taken' })
    res.status(400).json({ error: err.message })
  }
})

router.delete('/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (id === req.user.id) return res.status(400).json({ error: "Cannot delete your own account" })
  try {
    deleteUser(id)
    logAudit({ userId: req.user.id, username: req.user.username, action: 'user.delete', details: { target: id }, ip: req.ip })
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.get('/audit', requireAdmin, (req, res) => {
  try { res.json(listAudit({ limit: 500 })) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
