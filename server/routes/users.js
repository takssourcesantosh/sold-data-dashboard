import { Router } from 'express'
import { requireAuth, requireAdmin } from '../middleware/auth.js'
import {
  getUserById, listAllUsers, createUser, updateUser, deleteUser,
  updateUserAvatar, updateUserPassword,
} from '../db.js'

const router = Router()

router.get('/me', requireAuth, (req, res) => {
  const user = getUserById(req.user.id)
  if (!user) return res.status(404).json({ error: 'User not found' })
  res.json(user)
})

router.put('/me/password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body || {}
  if (!currentPassword || !newPassword)
    return res.status(400).json({ error: 'Both passwords required' })
  if (newPassword.length < 6)
    return res.status(400).json({ error: 'New password must be at least 6 characters' })
  try {
    updateUserPassword(req.user.id, currentPassword, newPassword)
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

router.put('/me/avatar', requireAuth, (req, res) => {
  const { avatar } = req.body || {}
  updateUserAvatar(req.user.id, avatar ?? null)
  res.json({ ok: true })
})

router.get('/', requireAdmin, (req, res) => {
  res.json(listAllUsers())
})

router.post('/', requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {}
  if (!username?.trim()) return res.status(400).json({ error: 'Username required' })
  if (!password || password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  if (!['admin', 'user'].includes(role))
    return res.status(400).json({ error: 'Role must be admin or user' })
  try {
    const user = createUser({ username: username.trim(), password, role })
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
  if (role && !['admin', 'user'].includes(role))
    return res.status(400).json({ error: 'Role must be admin or user' })
  if (password && password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  try {
    const user = updateUser(id, { username: username?.trim() || null, password: password || null, role: role || null })
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
    res.json({ ok: true })
  } catch (err) {
    res.status(400).json({ error: err.message })
  }
})

export default router
