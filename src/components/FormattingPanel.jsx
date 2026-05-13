import { useEffect, useState } from 'react'
import { listFormattingApi, saveFormattingApi } from '../api'
import { useToast, useEscClose } from './Toast'

// Rule shape: { kind: 'threshold' | 'heatmap', op?: 'gt'|'lt'|'gte'|'lte'|'eq', value?: any, color?: string, min?: number, max?: number, colorMin?: string, colorMax?: string }

const KINDS = [
  { value: 'threshold', label: 'Threshold (color cells matching condition)' },
  { value: 'heatmap',   label: 'Heatmap (gradient by numeric value)' },
]

const OPS = [
  { value: 'gt',  label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt',  label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'eq',  label: '=' },
]

const DEFAULT_RULE = {
  threshold: { kind: 'threshold', op: 'gt', value: '', color: '#fde68a' },
  heatmap:   { kind: 'heatmap', colorMin: '#fee2e2', colorMax: '#bbf7d0' },
}

export default function FormattingPanel({ columns, onClose, onApplied }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const toast = useToast()
  useEscClose(onClose)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try { setRules(await listFormattingApi()) } catch (e) { toast.error(e.message) }
    setLoading(false)
  }

  function addRule() {
    setRules(r => [...r, {
      column_name: columns[0] || '',
      rule: { ...DEFAULT_RULE.threshold }
    }])
  }

  // replaceRule=true: replace entire rule object (used when kind changes)
  function updateRule(idx, patch, replaceRule = false) {
    setRules(r => r.map((x, i) => {
      if (i !== idx) return x
      const newRule = replaceRule ? (patch.rule ?? {}) : { ...x.rule, ...(patch.rule ?? {}) }
      return { ...x, ...patch, rule: newRule }
    }))
  }

  function removeRule(idx) {
    setRules(r => r.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveFormattingApi(rules)
      toast.success('Formatting saved')
      onApplied?.()   // signal App to reload from server
      onClose()
    } catch (e) {
      toast.error(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="pp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="fmt-panel" role="dialog" aria-modal="true" aria-labelledby="fm-title">
        <div className="pp-header">
          <span id="fm-title" className="pp-title">🎨 Conditional Formatting</span>
          <button className="bp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="fmt-body">
          {loading && <div className="vw-empty">Loading…</div>}
          {!loading && rules.length === 0 && <div className="vw-empty">No rules yet. Add one below.</div>}
          {rules.map((r, idx) => (
            <div key={idx} className="fmt-rule">
              <select value={r.column_name} onChange={(e) => updateRule(idx, { column_name: e.target.value })}>
                {columns.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={r.rule.kind} onChange={(e) => updateRule(idx, { rule: { ...DEFAULT_RULE[e.target.value] } }, true)}>
                {KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              {r.rule.kind === 'threshold' && (
                <>
                  <select value={r.rule.op} onChange={(e) => updateRule(idx, { rule: { op: e.target.value } })}>
                    {OPS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <input
                    className="vw-input"
                    type="text"
                    placeholder="Value"
                    value={r.rule.value ?? ''}
                    onChange={(e) => updateRule(idx, { rule: { value: e.target.value } })}
                    style={{ maxWidth: 100 }}
                  />
                  <input
                    type="color"
                    value={r.rule.color ?? '#fde68a'}
                    onChange={(e) => updateRule(idx, { rule: { color: e.target.value } })}
                    aria-label="Color"
                  />
                </>
              )}
              {r.rule.kind === 'heatmap' && (
                <>
                  <input type="color" value={r.rule.colorMin ?? '#fee2e2'} onChange={(e) => updateRule(idx, { rule: { colorMin: e.target.value } })} aria-label="Low color" title="Low" />
                  <input type="color" value={r.rule.colorMax ?? '#bbf7d0'} onChange={(e) => updateRule(idx, { rule: { colorMax: e.target.value } })} aria-label="High color" title="High" />
                </>
              )}
              <button className="btn-small btn-danger" onClick={() => removeRule(idx)} aria-label="Remove">✕</button>
            </div>
          ))}

          <button className="btn-secondary" onClick={addRule}>+ Add rule</button>
        </div>

        <div className="fmt-footer">
          <button className="vp-btn" onClick={onClose}>Cancel</button>
          <button className="vp-btn vp-btn-ok" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

// Compute style for a cell given rules + numeric stats per column.
// rules: from server. stats: Map<col, { min, max }>
export function cellFormattingStyle(col, val, rules, stats) {
  if (!rules?.length) return null
  for (const r of rules) {
    if (r.column_name !== col) continue
    const kind = r.rule?.kind
    if (kind === 'threshold') {
      const num = parseFloat(val)
      const tgt = parseFloat(r.rule.value)
      if (!isNaN(num) && !isNaN(tgt)) {
        const op = r.rule.op
        const ok = (op === 'gt' && num > tgt) || (op === 'gte' && num >= tgt) ||
                   (op === 'lt' && num < tgt) || (op === 'lte' && num <= tgt) ||
                   (op === 'eq' && num === tgt)
        if (ok) return { backgroundColor: r.rule.color }
      } else if (String(val) === String(r.rule.value)) {
        return { backgroundColor: r.rule.color }
      }
    } else if (kind === 'heatmap') {
      const s = stats?.get(col)
      const num = parseFloat(val)
      if (!s || isNaN(num) || s.max === s.min) continue
      const t = (num - s.min) / (s.max - s.min)
      const c = lerpHex(r.rule.colorMin ?? '#fee2e2', r.rule.colorMax ?? '#bbf7d0', t)
      return { backgroundColor: c }
    }
  }
  return null
}

function lerpHex(a, b, t) {
  const pa = parseHex(a), pb = parseHex(b)
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t))
  return `rgb(${c[0]},${c[1]},${c[2]})`
}
function parseHex(h) {
  h = h.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}
