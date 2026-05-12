import { useState, useEffect, useRef, useMemo } from 'react'

export default function ColumnValuePicker({ col, anchorRect, allValues, activeValues, onApply, onClose }) {
  // activeValues = string[] currently filtered, or null/undefined = all selected
  const initialSet = useMemo(() => new Set(activeValues ?? allValues), []) // eslint-disable-line

  const [checked, setChecked] = useState(initialSet)
  const [search, setSearch] = useState('')
  const boxRef = useRef(null)

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) onClose()
    }
    // slight delay so the header click that opened us doesn't immediately close
    const id = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const filtered = useMemo(() => {
    if (!search.trim()) return allValues
    const q = search.trim().toLowerCase()
    return allValues.filter((v) => v.toLowerCase().includes(q))
  }, [allValues, search])

  const allChecked = filtered.length > 0 && filtered.every((v) => checked.has(v))
  const someChecked = !allChecked && filtered.some((v) => checked.has(v))

  const toggleSelectAll = () => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (allChecked) {
        filtered.forEach((v) => next.delete(v))
      } else {
        filtered.forEach((v) => next.add(v))
      }
      return next
    })
  }

  const toggleItem = (val) => {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(val) ? next.delete(val) : next.add(val)
      return next
    })
  }

  const handleOk = () => {
    const selected = [...checked]
    // If everything in allValues is selected → treat as "no filter" (null)
    if (selected.length === allValues.length) {
      onApply(col, null)
    } else if (selected.length === 0) {
      // Nothing checked — keep filter that matches nothing
      onApply(col, [])
    } else {
      onApply(col, selected)
    }
    onClose()
  }

  // Position picker below anchor
  const style = useMemo(() => {
    if (!anchorRect) return {}
    const pickerW = 240
    const pickerH = 320
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = anchorRect.left
    let top = anchorRect.bottom + 2
    if (left + pickerW > vw - 8) left = vw - pickerW - 8
    if (top + pickerH > vh - 8) top = anchorRect.top - pickerH - 2
    return { left, top }
  }, [anchorRect])

  return (
    <div className="vp-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="value-picker" ref={boxRef} style={style}>
        <div className="vp-header">
          <span className="vp-title">Filter: {col}</span>
        </div>

        <div className="vp-search-wrap">
          <input
            className="vp-search"
            type="text"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
          {search && (
            <button className="vp-search-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className="vp-select-all">
          <label className="vp-item">
            <input
              type="checkbox"
              checked={allChecked}
              ref={(el) => { if (el) el.indeterminate = someChecked }}
              onChange={toggleSelectAll}
            />
            <span className="vp-item-label">(Select All)</span>
            <span className="vp-count">{filtered.length}</span>
          </label>
        </div>

        <div className="vp-list">
          {filtered.map((val) => (
            <label key={val} className="vp-item">
              <input
                type="checkbox"
                checked={checked.has(val)}
                onChange={() => toggleItem(val)}
              />
              <span className="vp-item-label">{val === '' ? <em className="vp-blank">(Blank)</em> : val}</span>
            </label>
          ))}
          {filtered.length === 0 && (
            <div className="vp-empty">No matches</div>
          )}
        </div>

        <div className="vp-footer">
          <button className="vp-btn" onClick={onClose}>Cancel</button>
          <button className="vp-btn vp-btn-ok" onClick={handleOk}>OK</button>
        </div>
      </div>
    </div>
  )
}
