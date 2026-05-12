const OPERATORS = [
  { value: 'contains',     label: 'contains' },
  { value: 'not_contains', label: 'does not contain' },
  { value: 'equals',       label: 'equals' },
  { value: 'not_equals',   label: 'does not equal' },
  { value: 'starts',       label: 'starts with' },
  { value: 'ends',         label: 'ends with' },
  { value: 'is_empty',     label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
  { value: 'gt',           label: '> greater than' },
  { value: 'lt',           label: '< less than' },
  { value: 'gte',          label: '≥ greater or equal' },
  { value: 'lte',          label: '≤ less or equal' },
]

const NO_VALUE_OPS = new Set(['is_empty', 'is_not_empty'])

function newRule(col) {
  return { id: crypto.randomUUID(), col: col || '', op: 'contains', val: '' }
}

export default function AdvancedFilterPanel({ open, columns, filters, onChange }) {
  if (!open) return null

  const update = (id, patch) => {
    onChange(filters.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const remove = (id) => onChange(filters.filter(r => r.id !== id))

  const add = () => onChange([...filters, newRule(columns[0] || '')])

  return (
    <div className="adv-panel">
      <div className="adv-panel-inner">
        {filters.length === 0 ? (
          <div className="adv-empty">No filter rules. Click <strong>Add Rule</strong> to start.</div>
        ) : (
          <div className="adv-rules">
            {filters.map((rule, i) => (
              <div className="adv-rule" key={rule.id}>
                <span className="adv-connector">{i === 0 ? 'Where' : 'And'}</span>

                <select
                  className="adv-select adv-col"
                  value={rule.col}
                  onChange={e => update(rule.id, { col: e.target.value })}
                >
                  {columns.map(c => <option key={c} value={c}>{c}</option>)}
                </select>

                <select
                  className="adv-select adv-op"
                  value={rule.op}
                  onChange={e => update(rule.id, { op: e.target.value, val: '' })}
                >
                  {OPERATORS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>

                {!NO_VALUE_OPS.has(rule.op) && (
                  <input
                    className="adv-val"
                    type="text"
                    placeholder="value…"
                    value={rule.val}
                    onChange={e => update(rule.id, { val: e.target.value })}
                  />
                )}

                <button className="adv-remove" onClick={() => remove(rule.id)} title="Remove rule">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <button className="adv-add" onClick={add}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Rule
        </button>
      </div>
    </div>
  )
}
