import { useState } from 'react'
import UserAvatar from './UserAvatar'
import { listUsers, createUser, updateUser, deleteUser } from '../api'

function RoleBadge({ role }) {
  return <span className={`ump-role-badge ump-role-${role}`}>{role}</span>
}

function UserModal({ title, initial, onSave, onClose, isNew, isSelf }) {
  const [username, setUsername] = useState(initial?.username || '')
  const [password, setPassword] = useState('')
  const [role, setRole]         = useState(initial?.role || 'user')
  const [err, setErr]           = useState('')
  const [saving, setSaving]     = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErr('')
    if (!username.trim()) { setErr('Username required'); return }
    if (isNew && !password) { setErr('Password required'); return }
    setSaving(true)
    try {
      await onSave({ username: username.trim(), password: password || undefined, role })
      onClose()
    } catch (ex) {
      setErr(ex.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ump-modal-overlay" onMouseDown={onClose}>
      <div className="ump-modal" onMouseDown={e => e.stopPropagation()}>
        <div className="pp-header">
          <span className="pp-title">{title}</span>
          <button className="bp-close" onClick={onClose}>✕</button>
        </div>
        <form className="pp-form" style={{ padding: '16px 18px' }} onSubmit={handleSubmit}>
          <label className="ump-label">Username</label>
          <input className="pp-input" type="text" value={username}
            onChange={e => { setUsername(e.target.value); setErr('') }}
            autoFocus autoComplete="off" />

          <label className="ump-label">{isNew ? 'Password' : 'New Password (leave blank to keep)'}</label>
          <input className="pp-input" type="password" value={password}
            onChange={e => { setPassword(e.target.value); setErr('') }}
            placeholder={isNew ? 'Min 6 characters' : 'Leave blank to keep current'}
            autoComplete="new-password" />

          <label className="ump-label">Role</label>
          <select className="pp-input" value={role}
            onChange={e => setRole(e.target.value)}
            disabled={isSelf}>
            <option value="user">user — read only</option>
            <option value="admin">admin — full access</option>
          </select>
          {isSelf && <p className="pp-msg" style={{ marginTop: 4 }}>Cannot change your own role.</p>}

          {err && <p className="pp-err">{err}</p>}

          <button className="btn pp-save-btn" type="submit"
            disabled={saving || !username.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function UserManagementPanel({ currentUser, onClose }) {
  const [users, setUsers]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal]   = useState(null)  // null | 'add' | { user }

  const load = async () => {
    setLoading(true)
    try { setUsers(await listUsers()) } catch {}
    setLoading(false)
  }

  if (users === null && loading) { load() }

  const handleCreate = async (data) => {
    const user = await createUser(data)
    if (user.error) throw new Error(user.error)
    await load()
  }

  const handleUpdate = async (id, data) => {
    const user = await updateUser(id, data)
    if (user.error) throw new Error(user.error)
    await load()
  }

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) return
    const res = await deleteUser(user.id)
    if (res.error) { alert(res.error); return }
    await load()
  }

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString('en-GB', { dateStyle: 'medium' }) }
    catch { return iso }
  }

  return (
    <div className="pp-overlay" onMouseDown={onClose}>
      <div className="ump-card" onMouseDown={e => e.stopPropagation()}>
        <div className="pp-header">
          <span className="pp-title">Manage Users</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn pp-save-btn" onClick={() => setModal('add')}>+ Add User</button>
            <button className="bp-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="ump-body">
          {loading ? (
            <p className="bp-empty">Loading…</p>
          ) : (users || []).length === 0 ? (
            <p className="bp-empty">No users found.</p>
          ) : (
            <table className="ump-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(users || []).map(u => (
                  <tr key={u.id} className={u.id === currentUser.id ? 'ump-self-row' : ''}>
                    <td className="ump-user-cell">
                      <UserAvatar user={u} size={28} />
                      <span className="ump-username">{u.username}</span>
                      {u.id === currentUser.id && <span className="ump-you-tag">you</span>}
                    </td>
                    <td><RoleBadge role={u.role} /></td>
                    <td className="ump-date">{fmtDate(u.created_at)}</td>
                    <td className="ump-actions">
                      <button className="btn ump-edit-btn"
                        onClick={() => setModal({ user: u })}>
                        Edit
                      </button>
                      <button className="btn ump-del-btn"
                        onClick={() => handleDelete(u)}
                        disabled={u.id === currentUser.id}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {modal === 'add' && (
        <UserModal title="Add User" initial={null} isNew onClose={() => setModal(null)}
          onSave={handleCreate} />
      )}
      {modal?.user && (
        <UserModal title={`Edit — ${modal.user.username}`} initial={modal.user} isNew={false}
          isSelf={modal.user.id === currentUser.id}
          onClose={() => setModal(null)}
          onSave={(data) => handleUpdate(modal.user.id, data)} />
      )}
    </div>
  )
}
