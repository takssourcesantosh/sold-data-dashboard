import { useEffect, useState } from 'react'
import { listViewsApi, saveViewApi, updateViewApi, deleteViewApi } from '../api'
import { buildShareUrl } from '../lib/view-state'
import { useToast, useConfirm, useEscClose } from './Toast'

export default function ViewsPanel({ currentUserId, currentPayload, onApply, onClose }) {
  const [views, setViews] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [shared, setShared] = useState(false)
  const toast = useToast()
  const [ask, ConfirmModal] = useConfirm()
  useEscClose(onClose)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try { setViews(await listViewsApi()) }
    catch (e) { toast.error(e.message) }
    setLoading(false)
  }

  async function handleSave() {
    if (!name.trim()) return toast.warn('View name required')
    try {
      await saveViewApi(name.trim(), currentPayload, shared)
      toast.success('View saved')
      setName('')
      setShared(false)
      load()
    } catch (e) { toast.error(e.message) }
  }

  async function handleDelete(v) {
    if (!(await ask(`Delete "${v.name}"?`, { danger: true, confirmLabel: 'Delete' }))) return
    try { await deleteViewApi(v.id); toast.success('Deleted'); load() }
    catch (e) { toast.error(e.message) }
  }

  async function handleApply(v) {
    onApply(v.payload)
    onClose()
  }

  async function handleShare(v) {
    const url = buildShareUrl(v.payload)
    try { await navigator.clipboard.writeText(url); toast.success('Share link copied to clipboard') }
    catch { toast.info(url) }
  }

  async function toggleShared(v) {
    try { await updateViewApi(v.id, { shared: !v.shared }); load() }
    catch (e) { toast.error(e.message) }
  }

  return (
    <div className="pp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="views-panel" role="dialog" aria-modal="true" aria-labelledby="vw-title">
        <div className="pp-header">
          <span id="vw-title" className="pp-title">💾 Saved Views</span>
          <button className="bp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="vw-save">
          <input
            className="vw-input"
            type="text"
            placeholder="View name (e.g. 'High-value diamonds')"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
          />
          <label className="vw-shared">
            <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />
            <span>Share with team</span>
          </label>
          <button className="btn-primary" onClick={handleSave}>Save current view</button>
        </div>

        <div className="vw-list">
          {loading && <div className="vw-empty">Loading…</div>}
          {!loading && views.length === 0 && <div className="vw-empty">No saved views yet. Save your current filters above.</div>}
          {views.map(v => {
            const mine = v.user_id === currentUserId
            return (
              <div key={v.id} className="vw-row">
                <div className="vw-info">
                  <span className="vw-name">{v.name}</span>
                  {v.shared ? <span className="vw-tag vw-tag-shared">Team</span> : null}
                  {!mine && <span className="vw-tag">by user #{v.user_id}</span>}
                </div>
                <div className="vw-actions">
                  <button className="btn-small" onClick={() => handleApply(v)}>Apply</button>
                  <button className="btn-small" onClick={() => handleShare(v)} title="Copy share link">🔗</button>
                  {mine && <button className="btn-small" onClick={() => toggleShared(v)} title="Toggle team-share">{v.shared ? '🔓' : '🔒'}</button>}
                  {mine && <button className="btn-small btn-danger" onClick={() => handleDelete(v)} title="Delete">✕</button>}
                </div>
              </div>
            )
          })}
        </div>
        {ConfirmModal}
      </div>
    </div>
  )
}
