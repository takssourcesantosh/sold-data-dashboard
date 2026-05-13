import { useEffect, useState } from 'react'
import { listAlertsApi, createAlertApi, updateAlertApi, deleteAlertApi } from '../api'
import { useToast, useConfirm, useEscClose } from './Toast'

const OPS = [
  { value: 'gt',  label: 'greater than' },
  { value: 'gte', label: '≥' },
  { value: 'lt',  label: 'less than' },
  { value: 'lte', label: '≤' },
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '≠' },
  { value: 'contains', label: 'contains' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
]

export default function AlertsPanel({ columns, onClose }) {
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState({ name: '', column_name: columns[0] || '', op: 'gt', threshold: '' })
  const toast = useToast()
  const [ask, ConfirmModal] = useConfirm()
  useEscClose(onClose)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try { setAlerts(await listAlertsApi()) } catch (e) { toast.error(e.message) }
    setLoading(false)
  }

  async function handleCreate() {
    if (!draft.name.trim()) return toast.warn('Alert name required')
    if (!draft.column_name) return toast.warn('Column required')
    try {
      await createAlertApi(draft)
      // Ask for browser notification permission on first create
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      toast.success('Alert created')
      setDraft({ name: '', column_name: columns[0] || '', op: 'gt', threshold: '' })
      load()
    } catch (e) { toast.error(e.message) }
  }

  async function handleToggle(a) {
    try { await updateAlertApi(a.id, { enabled: !a.enabled }); load() }
    catch (e) { toast.error(e.message) }
  }

  async function handleDelete(a) {
    if (!(await ask(`Delete alert "${a.name}"?`, { danger: true, confirmLabel: 'Delete' }))) return
    try { await deleteAlertApi(a.id); load() }
    catch (e) { toast.error(e.message) }
  }

  return (
    <div className="pp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="alerts-panel" role="dialog" aria-modal="true" aria-labelledby="al-title">
        <div className="pp-header">
          <span id="al-title" className="pp-title">🔔 Threshold Alerts</span>
          <button className="bp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="al-help">
          Alerts trigger after each data upload. You'll get a browser notification + toast when any row matches.
        </div>

        <div className="al-create">
          <input
            className="vw-input"
            type="text"
            placeholder="Alert name"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <select value={draft.column_name} onChange={(e) => setDraft({ ...draft, column_name: e.target.value })}>
            {columns.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={draft.op} onChange={(e) => setDraft({ ...draft, op: e.target.value })}>
            {OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          {!['is_empty', 'is_not_empty'].includes(draft.op) && (
            <input
              className="vw-input"
              type="text"
              placeholder="Threshold"
              value={draft.threshold}
              onChange={(e) => setDraft({ ...draft, threshold: e.target.value })}
              style={{ maxWidth: 120 }}
            />
          )}
          <button className="btn-primary" onClick={handleCreate}>Add</button>
        </div>

        <div className="vw-list">
          {loading && <div className="vw-empty">Loading…</div>}
          {!loading && alerts.length === 0 && <div className="vw-empty">No alerts yet.</div>}
          {alerts.map(a => (
            <div key={a.id} className="vw-row">
              <div className="vw-info">
                <span className="vw-name">{a.name}</span>
                <span className="al-rule">{a.column_name} {OPS.find(o => o.value === a.op)?.label ?? a.op} {a.threshold}</span>
                {a.last_triggered_at && <span className="vw-tag">last: {new Date(a.last_triggered_at).toLocaleString()}</span>}
              </div>
              <div className="vw-actions">
                <label className="al-toggle">
                  <input type="checkbox" checked={!!a.enabled} onChange={() => handleToggle(a)} />
                  <span>{a.enabled ? 'On' : 'Off'}</span>
                </label>
                <button className="btn-small btn-danger" onClick={() => handleDelete(a)} aria-label="Delete">✕</button>
              </div>
            </div>
          ))}
        </div>
        {ConfirmModal}
      </div>
    </div>
  )
}
