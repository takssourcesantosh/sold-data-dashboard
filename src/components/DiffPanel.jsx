import { useEffect, useState, useRef } from 'react'
import { listBackups, diffBackupApi } from '../api'
import { useToast, useEscClose } from './Toast'

export default function DiffPanel({ onClose }) {
  const [backups, setBackups] = useState([])
  const [slot, setSlot] = useState(null)
  const [diff, setDiff] = useState(null)
  const [loading, setLoading] = useState(false)
  const toast = useToast()
  useEscClose(onClose)
  const reqIdRef = useRef(0)

  useEffect(() => { (async () => {
    try {
      const list = await listBackups()
      setBackups(list)
      if (list.length) setSlot(list[0].slot)
    } catch (e) { toast.error(e.message) }
  })() }, [])

  async function compute(s) {
    if (!s) return
    const myId = ++reqIdRef.current
    setLoading(true)
    setDiff(null)
    try {
      const d = await diffBackupApi(s)
      if (reqIdRef.current === myId) setDiff(d)
    } catch (e) {
      if (reqIdRef.current === myId) toast.error(e.message)
    } finally {
      if (reqIdRef.current === myId) setLoading(false)
    }
  }

  useEffect(() => { compute(slot) }, [slot])

  return (
    <div className="pp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="diff-panel" role="dialog" aria-modal="true" aria-labelledby="df-title">
        <div className="pp-header">
          <span id="df-title" className="pp-title">🔍 Diff vs Previous Upload</span>
          <button className="bp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="diff-controls">
          <label>Compare current data to:</label>
          <select value={slot ?? ''} onChange={(e) => setSlot(parseInt(e.target.value, 10))}>
            {backups.map(b => (
              <option key={b.slot} value={b.slot}>
                Slot {b.slot} — {b.label} ({b.row_count.toLocaleString()} rows, {new Date(b.created_at).toLocaleString()})
              </option>
            ))}
          </select>
        </div>

        {loading && <div className="vw-empty">Computing diff…</div>}
        {!loading && diff && (
          <>
            <div className="diff-summary">
              <span className="diff-stat diff-added">+{diff.addedCount.toLocaleString()} added</span>
              <span className="diff-stat diff-removed">−{diff.removedCount.toLocaleString()} removed</span>
              {(diff.addedCount === 5000 || diff.removedCount === 5000) &&
                <span className="diff-note">Capped at 5000 rows per side</span>}
            </div>

            <div className="diff-section">
              <h4 className="diff-h">Added rows ({diff.addedCount})</h4>
              {diff.addedRows.length === 0 && <div className="vw-empty">None</div>}
              {diff.addedRows.length > 0 && (
                <div className="diff-table-wrap">
                  <table className="diff-table">
                    <thead><tr>{diff.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                    <tbody>{diff.addedRows.slice(0, 200).map((r, i) => (
                      <tr key={i} className="diff-row-added">{r.map((v, j) => <td key={j}>{v}</td>)}</tr>
                    ))}</tbody>
                  </table>
                  {diff.addedRows.length > 200 && <div className="diff-note">Showing first 200 of {diff.addedRows.length}</div>}
                </div>
              )}
            </div>

            <div className="diff-section">
              <h4 className="diff-h">Removed rows ({diff.removedCount})</h4>
              {diff.removedRows.length === 0 && <div className="vw-empty">None</div>}
              {diff.removedRows.length > 0 && (
                <div className="diff-table-wrap">
                  <table className="diff-table">
                    <thead><tr>{diff.columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
                    <tbody>{diff.removedRows.slice(0, 200).map((r, i) => (
                      <tr key={i} className="diff-row-removed">{r.map((v, j) => <td key={j}>{v}</td>)}</tr>
                    ))}</tbody>
                  </table>
                  {diff.removedRows.length > 200 && <div className="diff-note">Showing first 200 of {diff.removedRows.length}</div>}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
