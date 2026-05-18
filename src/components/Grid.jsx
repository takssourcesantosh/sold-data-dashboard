import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import ColumnValuePicker from './ColumnValuePicker'
import { cellFormattingStyle } from './FormattingPanel'

const _dateRx = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}:\d{2}:\d{2}))?/
const _numFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtDate(val) {
  if (!val) return val
  const m = _dateRx.exec(String(val))
  if (!m) return val
  const [, yr, mo, dy, time] = m
  const base = `${dy}/${mo}/${yr}`
  return time && time !== '00:00:00' ? `${base} ${time}` : base
}

function fmtFixed2(val) {
  if (val === '' || val == null) return val
  const n = parseFloat(val)
  return isNaN(n) ? val : n.toFixed(2)
}

function fmtAmount(val) {
  if (val === '' || val == null) return val
  const n = parseFloat(val)
  return isNaN(n) ? val : _numFmt.format(n)
}

// Explicit per-column formatters. Date format applies ONLY to columns
// whose name suggests a date — no longer applied globally to all cells.
const COL_FORMATTERS = { Amount: fmtAmount, RATE: fmtAmount, 'RAP RTE': fmtAmount, 'RAP DIS': fmtFixed2 }
const DATE_COL_RX = /date|dt$|^dt|day|time/i

function defaultFormatter(col) {
  return COL_FORMATTERS[col] ?? (DATE_COL_RX.test(col) ? fmtDate : (v) => v)
}

const _statFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

const ROW_HEIGHT = 32
const HEADER_HEIGHT = 36
const FILTER_HEIGHT = 30
const ROW_NUM_WIDTH = 52
const COL_WIDTH = 160

export default function Grid({
  columns, columnOrder, onColumnReorder,
  rows, sortCol, sortDir, onSort,
  columnFilters, onColumnFilter,
  valueFilters, onValueFilter, getDistinctValues,
  formattingRules, // [{column_name, rule}]
  totalCount,
  hiddenColumns = [],
  dateFilters = {},
  onDateFilter,
  frozenCount = 0,
  sortSpec = [],
  onColumnStats,
}) {
  const displayColumns = useMemo(() => {
    const ordered = (columnOrder && columnOrder.length === columns.length) ? columnOrder : columns
    return hiddenColumns.length ? ordered.filter(c => !hiddenColumns.includes(c)) : ordered
  }, [columnOrder, columns, hiddenColumns])
  const parentRef = useRef(null)
  const gridRef = useRef(null)

  const [selected, setSelected] = useState(null)
  const [anchor,   setAnchor]   = useState(null)

  const [picker, setPicker] = useState(null)
  const pickerActiveRef = useRef(false)
  const openPickerRef = useRef(null)

  const [dragCol, setDragCol] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)

  const [colWidths, setColWidths] = useState(() => {
    try { return JSON.parse(localStorage.getItem('col-widths') || '{}') } catch { return {} }
  })
  const [resizingCol, setResizingCol] = useState(null)
  const resizeCleanupRef = useRef(null)

  const getColWidth = useCallback((col) => colWidths[col] ?? COL_WIDTH, [colWidths])

  const startResize = useCallback((e, col) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startW = getColWidth(col)
    setResizingCol(col)
    document.body.classList.add('resizing-col')
    const onMove = (ev) => {
      const w = Math.max(60, startW + (ev.clientX - startX))
      setColWidths(prev => ({ ...prev, [col]: w }))
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing-col')
      setResizingCol(null)
      setColWidths(prev => { localStorage.setItem('col-widths', JSON.stringify(prev)); return prev })
      resizeCleanupRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    resizeCleanupRef.current = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.classList.remove('resizing-col')
    }
  }, [getColWidth])

  // Cleanup any resize listeners on unmount
  useEffect(() => () => { resizeCleanupRef.current?.() }, [])

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })

  // Only clear selection if column set changes (not on every row refresh).
  // This preserves selection across filter/search keystrokes.
  const colSig = columns.join('\x1f')
  useEffect(() => {
    setSelected(null)
    setAnchor(null)
  }, [colSig])

  // Compute per-column min/max for heatmap formatting (numeric cols only)
  const heatmapStats = useMemo(() => {
    const map = new Map()
    if (!formattingRules?.some(r => r.rule?.kind === 'heatmap')) return map
    const heatCols = new Set(formattingRules.filter(r => r.rule?.kind === 'heatmap').map(r => r.column_name))
    for (const col of heatCols) {
      const idx = columns.indexOf(col)
      if (idx < 0) continue
      let min = Infinity, max = -Infinity, any = false
      for (const row of rows) {
        const n = parseFloat(row[idx + 1])
        if (!isNaN(n)) { any = true; if (n < min) min = n; if (n > max) max = n }
      }
      if (any) map.set(col, { min, max })
    }
    return map
  }, [formattingRules, rows, columns])

  // Sticky left offsets for frozen columns
  const frozenLeftOffset = useMemo(() => {
    const offsets = {}
    let left = ROW_NUM_WIDTH
    for (let i = 0; i < Math.min(frozenCount, displayColumns.length); i++) {
      offsets[displayColumns[i]] = left
      left += getColWidth(displayColumns[i])
    }
    return offsets
  }, [frozenCount, displayColumns, getColWidth])

  // Column totals (sum) for numeric columns
  const columnTotals = useMemo(() => {
    const totals = {}
    for (const col of displayColumns) {
      const idx = columns.indexOf(col)
      if (idx < 0) continue
      let sum = 0, hasNum = false
      for (const row of rows) {
        const n = parseFloat(row[idx + 1])
        if (!isNaN(n)) { sum += n; hasNum = true }
      }
      if (hasNum) totals[col] = sum
    }
    return totals
  }, [rows, columns, displayColumns])
  const hasTotals = Object.keys(columnTotals).length > 0

  // ── helpers ──────────────────────────────────────────────────────────────────

  const scrollTo = (rowIdx, align = 'auto') =>
    rowVirtualizer.scrollToIndex(rowIdx, { align })

  const scrollColIntoView = (colIdx) => {
    const el = parentRef.current
    if (!el) return
    let colLeft = ROW_NUM_WIDTH
    for (let i = 0; i < colIdx; i++) colLeft += getColWidth(displayColumns[i])
    const colRight = colLeft + getColWidth(displayColumns[colIdx])
    if (colRight > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = colRight - el.clientWidth + 8
    } else if (colLeft < el.scrollLeft + ROW_NUM_WIDTH) {
      el.scrollLeft = colLeft - ROW_NUM_WIDTH
    }
  }

  // ── keyboard: grid-level (when not editing) ───────────────────────────────

  const handleGridKeyDown = useCallback((e) => {
    if (!selected) return

    const { rowIdx, colIdx } = selected
    const maxRow = rows.length - 1
    const maxCol = columns.length - 1

    const moveTo = (r, c, alignV = 'auto') => {
      const nr = Math.max(0, Math.min(maxRow, r))
      const nc = Math.max(0, Math.min(maxCol, c))
      setSelected({ rowIdx: nr, colIdx: nc })
      if (!e.shiftKey) setAnchor({ rowIdx: nr, colIdx: nc })
      scrollTo(nr, alignV)
      scrollColIntoView(nc)
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault()
      setAnchor({ rowIdx: 0, colIdx: 0 })
      setSelected({ rowIdx: rows.length - 1, colIdx: columns.length - 1 })
      return
    }

    if (e.key === 'PageDown') {
      e.preventDefault()
      const pageRows = Math.floor((parentRef.current?.clientHeight ?? 400) / ROW_HEIGHT)
      moveTo(Math.min(rows.length - 1, rowIdx + pageRows), colIdx, 'auto')
      return
    }
    if (e.key === 'PageUp') {
      e.preventDefault()
      const pageRows = Math.floor((parentRef.current?.clientHeight ?? 400) / ROW_HEIGHT)
      moveTo(Math.max(0, rowIdx - pageRows), colIdx, 'auto')
      return
    }

    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault()
      const col = columns[colIdx]
      if (col && openPickerRef.current) {
        const filterInput = parentRef.current?.querySelector(
          `.filter-cell:nth-child(${colIdx + 2}) .filter-input`
        )
        const anchor = filterInput ?? gridRef.current
        const fakeE = { stopPropagation: () => {}, currentTarget: { getBoundingClientRect: () => anchor?.getBoundingClientRect() ?? { left: 100, bottom: 100, top: 100 } } }
        openPickerRef.current(col, fakeE)
      }
      return
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        moveTo((e.ctrlKey || e.metaKey) ? 0 : rowIdx - 1, colIdx,
               (e.ctrlKey || e.metaKey) ? 'start' : 'auto')
        break
      case 'ArrowDown':
        e.preventDefault()
        moveTo((e.ctrlKey || e.metaKey) ? maxRow : rowIdx + 1, colIdx,
               (e.ctrlKey || e.metaKey) ? 'end' : 'auto')
        break
      case 'ArrowLeft':
        e.preventDefault()
        moveTo(rowIdx, (e.ctrlKey || e.metaKey) ? 0 : colIdx - 1)
        break
      case 'ArrowRight':
        e.preventDefault()
        moveTo(rowIdx, (e.ctrlKey || e.metaKey) ? maxCol : colIdx + 1)
        break
      case 'Home':
        e.preventDefault()
        moveTo((e.ctrlKey || e.metaKey) ? 0 : rowIdx, 0, 'start')
        break
      case 'End':
        e.preventDefault()
        moveTo((e.ctrlKey || e.metaKey) ? maxRow : rowIdx, maxCol, 'end')
        break
      case 'Tab':
        // Only intercept Tab when shift+arrow-style intra-grid nav is intended.
        // Plain Tab escapes the grid to the next focusable page element.
        if (!e.shiftKey && colIdx === maxCol && rowIdx === maxRow) return // let Tab leave
        if (e.shiftKey && colIdx === 0 && rowIdx === 0) return // let Shift+Tab leave
        e.preventDefault()
        if (e.shiftKey) {
          if (colIdx > 0) moveTo(rowIdx, colIdx - 1)
          else moveTo(rowIdx - 1, maxCol)
        } else {
          if (colIdx < maxCol) moveTo(rowIdx, colIdx + 1)
          else moveTo(rowIdx + 1, 0)
        }
        break
      case 'Escape':
        e.preventDefault()
        setSelected(null)
        setAnchor(null)
        break
      default:
        if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
          e.preventDefault()
          const minR = Math.min(anchor?.rowIdx ?? rowIdx, rowIdx)
          const maxR = Math.max(anchor?.rowIdx ?? rowIdx, rowIdx)
          const minC = Math.min(anchor?.colIdx ?? colIdx, colIdx)
          const maxC = Math.max(anchor?.colIdx ?? colIdx, colIdx)
          const lines = []
          for (let r = minR; r <= maxR; r++) {
            const row = rows[r]
            if (!row) continue
            const cells = []
            for (let c = minC; c <= maxC; c++) cells.push(row[c + 1] ?? '')
            lines.push(cells.join('\t'))
          }
          navigator.clipboard.writeText(lines.join('\n')).catch(() => {})
        }
    }
  }, [selected, anchor, rows, columns]) // eslint-disable-line

  // ── value picker ─────────────────────────────────────────────────────────

  const openPicker = useCallback(async (col, e) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    pickerActiveRef.current = true
    setPicker({ col, anchorRect: rect, allValues: [], truncated: false })
    const result = getDistinctValues ? await getDistinctValues(col) : { values: [], truncated: false }
    const { values = [], truncated = false } = result && typeof result === 'object' && !Array.isArray(result) ? result : { values: result ?? [], truncated: false }
    setPicker(p => p && p.col === col ? { col, anchorRect: rect, allValues: values, truncated } : p)
  }, [getDistinctValues])
  openPickerRef.current = openPicker

  const closePicker = useCallback(() => {
    pickerActiveRef.current = false
    setPicker(null)
  }, [])

  const handlePickerApply = useCallback((col, selectedVals) => {
    onValueFilter?.(col, selectedVals)
  }, [onValueFilter])

  // ── render ────────────────────────────────────────────────────────────────

  const totalWidth = ROW_NUM_WIDTH + displayColumns.reduce((sum, col) => sum + getColWidth(col), 0)
  const hasActiveFilters =
    (columnFilters && Object.keys(columnFilters).some(k => columnFilters[k])) ||
    (valueFilters && Object.keys(valueFilters).length > 0)

  const rangeMinRow = (anchor && selected) ? Math.min(anchor.rowIdx, selected.rowIdx) : -1
  const rangeMaxRow = (anchor && selected) ? Math.max(anchor.rowIdx, selected.rowIdx) : -1
  const rangeMinCol = (anchor && selected) ? Math.min(anchor.colIdx, selected.colIdx) : -1
  const rangeMaxCol = (anchor && selected) ? Math.max(anchor.colIdx, selected.colIdx) : -1
  const hasRange    = rangeMinRow !== rangeMaxRow || rangeMinCol !== rangeMaxCol
  const inRange = (r, c) => r >= rangeMinRow && r <= rangeMaxRow && c >= rangeMinCol && c <= rangeMaxCol

  // Expanded selection stats: Avg, Count, Sum, Min, Max, Median, StdDev
  const selectionStats = useMemo(() => {
    if (!selected) return null
    const minR = hasRange ? rangeMinRow : selected.rowIdx
    const maxR = hasRange ? rangeMaxRow : selected.rowIdx
    const minC = hasRange ? rangeMinCol : selected.colIdx
    const maxC = hasRange ? rangeMaxCol : selected.colIdx
    const cellCount = (maxR - minR + 1) * (maxC - minC + 1)
    if (cellCount > 100_000) return null
    let count = 0
    const nums = []
    let sum = 0, min = Infinity, max = -Infinity
    for (let r = minR; r <= maxR; r++) {
      const row = rows[r]
      if (!row) continue
      for (let c = minC; c <= maxC; c++) {
        const col = displayColumns[c]
        const val = row[columns.indexOf(col) + 1]
        if (val !== '' && val != null) {
          count++
          const n = parseFloat(val)
          if (!isNaN(n)) {
            nums.push(n); sum += n
            if (n < min) min = n
            if (n > max) max = n
          }
        }
      }
    }
    const numCount = nums.length
    if (numCount === 0) return { count, numCount: 0, sum: 0, avg: null, min: null, max: null, median: null, stddev: null }
    const avg = sum / numCount
    // Median
    const sorted = [...nums].sort((a, b) => a - b)
    const median = numCount % 2 === 1 ? sorted[numCount >> 1] : (sorted[numCount/2 - 1] + sorted[numCount/2]) / 2
    // StdDev (population)
    let sse = 0; for (const n of nums) sse += (n - avg) ** 2
    const stddev = Math.sqrt(sse / numCount)
    return { count, numCount, sum, avg, min, max, median, stddev }
  }, [selected, rows, columns, displayColumns, hasRange, rangeMinRow, rangeMaxRow, rangeMinCol, rangeMaxCol])

  return (
    <div className="grid-wrap">
      {selected && (
        <div className="kbd-hint">
          <kbd>↑↓←→</kbd> navigate &nbsp;·&nbsp;
          <kbd>Shift+↑↓←→</kbd> select range &nbsp;·&nbsp;
          <kbd>Ctrl+↑↓</kbd> first/last row &nbsp;·&nbsp;
          <kbd>Alt+↓</kbd> open filter &nbsp;·&nbsp;
          <kbd>?</kbd> all shortcuts
        </div>
      )}

      <div
        ref={parentRef}
        className="grid-scroll"
        style={{ '--total-width': `${totalWidth}px` }}
      >
        <div className="grid-header-group" style={{ width: totalWidth }}>
          <div className="grid-header" style={{ height: HEADER_HEIGHT }}>
            <div className="cell rn-cell" style={{ width: ROW_NUM_WIDTH, position: 'sticky', left: 0, zIndex: 5 }}>#</div>
            {displayColumns.map((col, colVisIdx) => {
              const hasValueFilter = valueFilters?.[col]?.length > 0
              const isDragging = dragCol === col
              const isDragOver = dragOverCol === col && dragCol !== col
              const isFrozen = colVisIdx < frozenCount
              const sortRank = sortSpec?.findIndex(s => s.col === col) ?? -1
              const frozenStyle = isFrozen ? { position: 'sticky', left: frozenLeftOffset[col], zIndex: 4, background: 'var(--header-bg, var(--bg2))' } : {}
              return (
                <div
                  key={col}
                  className={`cell header-cell${sortCol === col ? ' sorted' : ''}${isDragging ? ' col-dragging' : ''}${isDragOver ? ' col-drag-over' : ''}${isFrozen ? ' col-frozen' : ''}`}
                  style={{ width: getColWidth(col), ...frozenStyle }}
                  onClick={(e) => onSort(col, e)}
                  title={`Sort by ${col} · Ctrl+click multi-sort · Drag to reorder`}
                  draggable
                  onDragStart={(e) => {
                    setDragCol(col)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', col)
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (col !== dragCol) setDragOverCol(col) }}
                  onDragLeave={() => setDragOverCol(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (dragCol && dragCol !== col) onColumnReorder?.(dragCol, col)
                    setDragCol(null); setDragOverCol(null)
                  }}
                  onDragEnd={() => { setDragCol(null); setDragOverCol(null) }}
                >
                  <span className="drag-handle" title="Drag to reorder">⠿</span>
                  <span className="header-text">{col}</span>
                  <button
                    className={`col-filter-btn${hasValueFilter ? ' col-filter-btn--active' : ''}`}
                    onClick={(e) => openPicker(col, e)}
                    title={`Filter ${col}`}
                    aria-label={`Filter ${col}`}
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill={hasValueFilter ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                  </button>
                  <button
                    className="col-stats-btn"
                    onClick={(e) => { e.stopPropagation(); onColumnStats?.(col) }}
                    title={`Column statistics: ${col}`}
                    aria-label={`Stats for ${col}`}
                  >ⓘ</button>
                  <span className="sort-arrow">
                    {sortCol === col
                      ? (sortDir === 'asc' ? '↑' : '↓')
                      : sortRank >= 0
                        ? <span className="sort-multi">{sortRank + 1}{sortSpec[sortRank].dir === 'asc' ? '↑' : '↓'}</span>
                        : <span className="sort-hint">↕</span>}
                  </span>
                  <span
                    className={`resize-handle${resizingCol === col ? ' resize-handle--active' : ''}`}
                    onMouseDown={(e) => startResize(e, col)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )
            })}
          </div>

          <div className="grid-filter-row" style={{ height: FILTER_HEIGHT }}>
            <div className="cell rn-cell filter-rn" style={{ width: ROW_NUM_WIDTH, position: 'sticky', left: 0, zIndex: 3, background: 'var(--header-bg, var(--bg2))' }}>
              {(hasActiveFilters) && <span className="filter-dot" />}
            </div>
            {displayColumns.map((col, colVisIdx) => {
              const isFrozen = colVisIdx < frozenCount
              const frozenStyle = isFrozen ? { position: 'sticky', left: frozenLeftOffset[col], zIndex: 3, background: 'var(--header-bg, var(--bg2))' } : {}
              const isDateCol = DATE_COL_RX.test(col)
              return (
                <div key={col} className="cell filter-cell" style={{ width: getColWidth(col), ...frozenStyle }}>
                  {isDateCol ? (
                    <div className="date-filter-wrap">
                      <input type="date" className="filter-input date-filter-input"
                        value={dateFilters?.[col]?.from || ''}
                        onChange={e => onDateFilter?.(col, { ...(dateFilters?.[col] || {}), from: e.target.value })}
                        title="From date"
                      />
                      <input type="date" className="filter-input date-filter-input"
                        value={dateFilters?.[col]?.to || ''}
                        onChange={e => onDateFilter?.(col, { ...(dateFilters?.[col] || {}), to: e.target.value })}
                        title="To date"
                      />
                      {(dateFilters?.[col]?.from || dateFilters?.[col]?.to) && (
                        <button className="filter-clear-btn" onClick={() => onDateFilter?.(col, null)}>✕</button>
                      )}
                    </div>
                  ) : (
                    <>
                      <input
                        className="filter-input"
                        type="text"
                        placeholder="Filter…"
                        value={columnFilters?.[col] ?? ''}
                        onChange={(e) => onColumnFilter(col, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.altKey && e.key === 'ArrowDown') {
                            e.preventDefault()
                            openPicker(col, { stopPropagation: () => {}, currentTarget: e.currentTarget })
                          }
                        }}
                      />
                      {columnFilters?.[col] && (
                        <button className="filter-clear-btn" onClick={() => onColumnFilter(col, '')}>✕</button>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div
          ref={gridRef}
          className="grid-body"
          style={{ height: rowVirtualizer.getTotalSize(), width: totalWidth }}
          tabIndex={0}
          role="grid"
          aria-label="Data grid"
          onKeyDown={handleGridKeyDown}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) setSelected(null)
          }}
        >
          {rowVirtualizer.getVirtualItems().map((vRow) => {
            const row = rows[vRow.index]
            const rowId = row[0]
            const isSelectedRow = selected?.rowIdx === vRow.index && !hasRange

            return (
              <div
                key={vRow.key}
                className={`grid-row${isSelectedRow ? ' selected-row' : ''}`}
                style={{ top: vRow.start, width: totalWidth, height: ROW_HEIGHT }}
              >
                <div className="cell rn-cell" style={{ width: ROW_NUM_WIDTH }}>
                  {vRow.index + 1}
                </div>
                {displayColumns.map((col, colIdx) => {
                  const cellVal    = row[columns.indexOf(col) + 1]
                  const isSel      = selected?.rowIdx === vRow.index && selected?.colIdx === colIdx
                  const isFiltered = !!columnFilters?.[col]
                  const isInRange  = hasRange && inRange(vRow.index, colIdx)
                  const fmtStyle   = cellFormattingStyle(col, cellVal, formattingRules, heatmapStats)
                  const isFrozen   = colIdx < frozenCount
                  const frozenCellStyle = isFrozen ? { position: 'sticky', left: frozenLeftOffset[col], zIndex: 1, background: 'var(--cell-bg)' } : {}

                  return (
                    <div
                      key={col}
                      className={`cell data-cell${isSel ? ' selected-cell' : ''}${isInRange ? ' range-cell' : ''}${isFiltered ? ' filtered-col' : ''}${isFrozen ? ' col-frozen' : ''}`}
                      style={{ width: getColWidth(col), ...(fmtStyle ?? {}), ...frozenCellStyle }}
                      onClick={(e) => {
                        const ri = vRow.index
                        if (e.shiftKey && anchor) {
                          setSelected({ rowIdx: ri, colIdx })
                        } else {
                          setSelected({ rowIdx: ri, colIdx })
                          setAnchor({ rowIdx: ri, colIdx })
                        }
                        gridRef.current?.focus()
                      }}
                    >
                      <span className="cell-text">{defaultFormatter(col)(cellVal)}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Column totals row — sticky at bottom of scroll area */}
        {hasTotals && (
          <div className="grid-totals-row" style={{ width: totalWidth, minWidth: totalWidth }}>
            <div className="cell rn-cell totals-rn" style={{ width: ROW_NUM_WIDTH, position: 'sticky', left: 0, zIndex: 2 }}>Σ</div>
            {displayColumns.map((col, colIdx) => {
              const isFrozen = colIdx < frozenCount
              const stickyStyle = isFrozen ? { position: 'sticky', left: frozenLeftOffset[col], zIndex: 2 } : {}
              return (
                <div key={col} className="cell totals-cell" style={{ width: getColWidth(col), ...stickyStyle }}>
                  {columnTotals[col] != null ? _numFmt.format(columnTotals[col]) : ''}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid-footer">
        {totalCount > rows.length ? (
          <span className="footer-cap-warn">
            ⚠ Showing {rows.length.toLocaleString()} of {totalCount.toLocaleString()} rows — apply filters to narrow results
          </span>
        ) : (
          <span>{rows.length.toLocaleString()} row{rows.length !== 1 ? 's' : ''}</span>
        )}
        {hasActiveFilters && <span className="footer-filter-note"> (filtered)</span>}
        {selected && !hasRange && (
          <span className="footer-cell-ref">
            &nbsp;·&nbsp; Row {selected.rowIdx + 1}, {columns[selected.colIdx]}
          </span>
        )}
        {hasRange && (
          <span className="footer-cell-ref">
            &nbsp;·&nbsp; {rangeMaxRow - rangeMinRow + 1} × {rangeMaxCol - rangeMinCol + 1} selected
          </span>
        )}
        {selectionStats && selectionStats.count > 0 && (
          <span className="footer-selection-stats">
            <span className="footer-stat">Count: {selectionStats.count.toLocaleString()}</span>
            {selectionStats.numCount > 0 && (
              <>
                <span className="footer-stat">Sum: {_statFmt.format(selectionStats.sum)}</span>
                <span className="footer-stat">Avg: {_statFmt.format(selectionStats.avg)}</span>
                <span className="footer-stat">Min: {_statFmt.format(selectionStats.min)}</span>
                <span className="footer-stat">Max: {_statFmt.format(selectionStats.max)}</span>
                {selectionStats.numCount > 1 && (
                  <>
                    <span className="footer-stat">Median: {_statFmt.format(selectionStats.median)}</span>
                    <span className="footer-stat">σ: {_statFmt.format(selectionStats.stddev)}</span>
                  </>
                )}
              </>
            )}
          </span>
        )}
      </div>

      {picker && (
        <ColumnValuePicker
          col={picker.col}
          anchorRect={picker.anchorRect}
          allValues={picker.allValues}
          truncated={picker.truncated}
          activeValues={valueFilters?.[picker.col] ?? null}
          onApply={handlePickerApply}
          onClose={closePicker}
        />
      )}
    </div>
  )
}
