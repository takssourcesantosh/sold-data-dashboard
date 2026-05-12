import { useState, useRef } from 'react'
import UserAvatar from './UserAvatar'
import { updateMyPassword, updateMyAvatar } from '../api'

async function resizeToBase64(file, size = 96) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size; canvas.height = size
      const ctx = canvas.getContext('2d')
      const min = Math.min(img.width, img.height)
      const sx = (img.width - min) / 2
      const sy = (img.height - min) / 2
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(canvas.toDataURL('image/jpeg', 0.88))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Invalid image')) }
    img.src = url
  })
}

export default function ProfilePanel({ currentUser, onClose, onProfileUpdate }) {
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [avatarSaving, setAvatarSaving] = useState(false)
  const [avatarMsg, setAvatarMsg] = useState('')

  const [curPwd, setCurPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdMsg, setPwdMsg] = useState('')
  const [pwdErr, setPwdErr] = useState('')

  const fileRef = useRef(null)

  const handleAvatarFile = async (file) => {
    if (!file) return
    try {
      const b64 = await resizeToBase64(file)
      setAvatarPreview(b64)
      setAvatarMsg('')
    } catch {
      setAvatarMsg('Could not load image')
    }
  }

  const saveAvatar = async () => {
    setAvatarSaving(true)
    setAvatarMsg('')
    try {
      await updateMyAvatar(avatarPreview)
      onProfileUpdate({ ...currentUser, avatar: avatarPreview })
      setAvatarPreview(null)
      setAvatarMsg('Avatar updated.')
    } catch (err) {
      setAvatarMsg(err.message)
    } finally {
      setAvatarSaving(false)
    }
  }

  const removeAvatar = async () => {
    setAvatarSaving(true)
    try {
      await updateMyAvatar(null)
      onProfileUpdate({ ...currentUser, avatar: null })
      setAvatarPreview(null)
      setAvatarMsg('Avatar removed.')
    } catch (err) {
      setAvatarMsg(err.message)
    } finally {
      setAvatarSaving(false)
    }
  }

  const savePassword = async (e) => {
    e.preventDefault()
    setPwdErr(''); setPwdMsg('')
    if (newPwd !== confirmPwd) { setPwdErr('Passwords do not match'); return }
    if (newPwd.length < 6)     { setPwdErr('Password must be at least 6 characters'); return }
    setPwdSaving(true)
    try {
      await updateMyPassword(curPwd, newPwd)
      setCurPwd(''); setNewPwd(''); setConfirmPwd('')
      setPwdMsg('Password changed successfully.')
    } catch (err) {
      setPwdErr(err.message)
    } finally {
      setPwdSaving(false)
    }
  }

  const displayUser = avatarPreview ? { ...currentUser, avatar: avatarPreview } : currentUser

  return (
    <div className="pp-overlay" onMouseDown={onClose}>
      <div className="pp-card" onMouseDown={e => e.stopPropagation()}>
        <div className="pp-header">
          <span className="pp-title">My Profile</span>
          <button className="bp-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Avatar ── */}
        <div className="pp-section">
          <div className="pp-section-title">Profile Photo</div>
          <div className="pp-avatar-row">
            <UserAvatar user={displayUser} size={72} />
            <div className="pp-avatar-actions">
              <button className="btn" onClick={() => fileRef.current?.click()}>
                Change Photo
              </button>
              {currentUser.avatar && !avatarPreview && (
                <button className="btn pp-remove-btn" onClick={removeAvatar} disabled={avatarSaving}>
                  Remove
                </button>
              )}
              {avatarPreview && (
                <button className="btn pp-save-btn" onClick={saveAvatar} disabled={avatarSaving}>
                  {avatarSaving ? 'Saving…' : 'Save Photo'}
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => handleAvatarFile(e.target.files?.[0])}
              onClick={e => { e.target.value = '' }} />
          </div>
          {avatarMsg && <p className="pp-msg">{avatarMsg}</p>}
        </div>

        {/* ── Password ── */}
        <div className="pp-section">
          <div className="pp-section-title">Change Password</div>
          <form className="pp-form" onSubmit={savePassword}>
            <input className="pp-input" type="password" placeholder="Current password"
              value={curPwd} onChange={e => { setCurPwd(e.target.value); setPwdErr('') }}
              autoComplete="current-password" />
            <input className="pp-input" type="password" placeholder="New password (min 6 chars)"
              value={newPwd} onChange={e => { setNewPwd(e.target.value); setPwdErr('') }}
              autoComplete="new-password" />
            <input className="pp-input" type="password" placeholder="Confirm new password"
              value={confirmPwd} onChange={e => { setConfirmPwd(e.target.value); setPwdErr('') }}
              autoComplete="new-password" />
            {pwdErr && <p className="pp-err">{pwdErr}</p>}
            {pwdMsg && <p className="pp-msg">{pwdMsg}</p>}
            <button className="btn pp-save-btn" type="submit"
              disabled={pwdSaving || !curPwd || !newPwd || !confirmPwd}>
              {pwdSaving ? 'Saving…' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
