import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import ColumnValuePicker from './ColumnValuePicker'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const _dateRx = /^(\d{4})-(\d{2})-(\d{2})$/
const _numFmt = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function fmtDate(val) {
  if (!val) return val
  const m = _dateRx.exec(val)
  if (!m) return val
  return `${m[3]}-${MONTHS[parseInt(m[2], 10) - 1]}-${m[1]}`
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

const COL_FORMATTERS = { Amount: fmtAmount, RATE: fmtAmount, 'RAP RTE': fmtAmount, 'RAP DIS': fmtFixed2 }
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
}) {
  const displayColumns = (columnOrder && columnOrder.length === columns.length) ? columnOrder : columns
  const parentRef = useRef(null)
  const gridRef = useRef(null)

  const [selected, setSelected] = useState(null)  // { rowIdx, colIdx } — cursor/focus cell
  const [anchor,   setAnchor]   = useState(null)  // { rowIdx, colIdx } — range start (Shift+Arrow)

  // Value picker state
  const [picker, setPicker] = useState(null)  // { col, anchorRect, allValues }
  const pickerActiveRef = useRef(false)

  // Column drag-reorder state
  const [dragCol, setDragCol] = useState(null)
  const [dragOverCol, setDragOverCol] = useState(null)

  // Column resize state
  const [colWidths, setColWidths] = useState(() => {
    try { return JSON.parse(localStorage.getItem('col-widths') || '{}') } catch { return {} }
  })
  const [resizingCol, setResizingCol] = useState(null)

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
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [getColWidth])

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  })

  // Clear selection when rows change (search / filter / sort)
  useEffect(() => {
    setSelected(null)
    setAnchor(null)
  }, [rows])

  // ── helpers ──────────────────────────────────────────────────────────────────

  const focusGrid = () => setTimeout(() => gridRef.current?.focus(), 0)

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

    // Move cursor; if shift held, keep anchor fixed (range selection); else anchor = cursor
    const moveTo = (r, c, alignV = 'auto') => {
      const nr = Math.max(0, Math.min(maxRow, r))
      const nc = Math.max(0, Math.min(maxCol, c))
      setSelected({ rowIdx: nr, colIdx: nc })
      if (!e.shiftKey) setAnchor({ rowIdx: nr, colIdx: nc })
      scrollTo(nr, alignV)
      scrollColIntoView(nc)
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
    e.stopPropagation()  // don't trigger sort
    const rect = e.currentTarget.getBoundingClientRect()
    pickerActiveRef.current = true
    setPicker({ col, anchorRect: rect, allValues: [] })
    const allValues = getDistinctValues ? await getDistinctValues(col) : []
    setPicker({ col, anchorRect: rect, allValues })
  }, [getDistinctValues])

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

  // Range selection bounds
  const rangeMinRow = (anchor && selected) ? Math.min(anchor.rowIdx, selected.rowIdx) : -1
  const rangeMaxRow = (anchor && selected) ? Math.max(anchor.rowIdx, selected.rowIdx) : -1
  const rangeMinCol = (anchor && selected) ? Math.min(anchor.colIdx, selected.colIdx) : -1
  const rangeMaxCol = (anchor && selected) ? Math.max(anchor.colIdx, selected.colIdx) : -1
  const hasRange    = rangeMinRow !== rangeMaxRow || rangeMinCol !== rangeMaxCol
  const inRange = (r, c) => r >= rangeMinRow && r <= rangeMaxRow && c >= rangeMinCol && c <= rangeMaxCol

  // Footer selection stats (Average / Count / Sum)
  const selectionStats = useMemo(() => {
    if (!selected) return null
    const minR = hasRange ? rangeMinRow : selected.rowIdx
    const maxR = hasRange ? rangeMaxRow : selected.rowIdx
    const minC = hasRange ? rangeMinCol : selected.colIdx
    const maxC = hasRange ? rangeMaxCol : selected.colIdx
    const cellCount = (maxR - minR + 1) * (maxC - minC + 1)
    if (cellCount > 100_000) return null  // too large to compute
    let count = 0, numCount = 0, sum = 0
    for (let r = minR; r <= maxR; r++) {
      const row = rows[r]
      if (!row) continue
      for (let c = minC; c <= maxC; c++) {
        const col = displayColumns[c]
        const val = row[columns.indexOf(col) + 1]
        if (val !== '' && val != null) {
          count++
          const n = parseFloat(val)
          if (!isNaN(n)) { numCount++; sum += n }
        }
      }
    }
    return { count, numCount, sum, avg: numCount > 0 ? sum / numCount : null }
  }, [selected, rows, columns, displayColumns, hasRange, rangeMinRow, rangeMaxRow, rangeMinCol, rangeMaxCol])

  return (
    <div className="grid-wrap">
      {/* Keyboard nav hint bar */}
      {selected && (
        <div className="kbd-hint">
          <kbd>↑↓←→</kbd> navigate &nbsp;·&nbsp;
          <kbd>Shift+↑↓←→</kbd> select range &nbsp;·&nbsp;
          <kbd>Ctrl+↑↓</kbd> first/last row &nbsp;·&nbsp;
          <kbd>Ctrl+Home</kbd><kbd>Ctrl+End</kbd> first/last cell
        </div>
      )}

      {/* Scrollable grid */}
      <div
        ref={parentRef}
        className="grid-scroll"
        style={{ '--total-width': `${totalWidth}px` }}
      >
        {/* Sticky header group */}
        <div className="grid-header-group" style={{ width: totalWidth }}>
          <div className="grid-header" style={{ height: HEADER_HEIGHT }}>
            <div className="cell rn-cell" style={{ width: ROW_NUM_WIDTH }}>#</div>
            {displayColumns.map((col) => {
              const hasValueFilter = valueFilters?.[col]?.length > 0
              const isDragging = dragCol === col
              const isDragOver = dragOverCol === col && dragCol !== col
              return (
                <div
                  key={col}
                  className={`cell header-cell${sortCol === col ? ' sorted' : ''}${isDragging ? ' col-dragging' : ''}${isDragOver ? ' col-drag-over' : ''}`}
                  style={{ width: getColWidth(col) }}
                  onClick={() => onSort(col)}
                  title={`Sort by ${col} · Drag to reorder`}
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
                  >
                    <svg width="9" height="9" viewBox="0 0 24 24" fill={hasValueFilter ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5">
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                  </button>
                  <span className="sort-arrow">
                    {sortCol === col
                      ? (sortDir === 'asc' ? '↑' : '↓')
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
            <div className="cell rn-cell filter-rn" style={{ width: ROW_NUM_WIDTH }}>
              {(hasActiveFilters) && <span className="filter-dot" />}
            </div>
            {displayColumns.map((col) => (
              <div key={col} className="cell filter-cell" style={{ width: getColWidth(col) }}>
                <input
                  className="filter-input"
                  type="text"
                  placeholder="Filter…"
                  value={columnFilters?.[col] ?? ''}
                  onChange={(e) => onColumnFilter(col, e.target.value)}
                />
                {columnFilters?.[col] && (
                  <button className="filter-clear-btn" onClick={() => onColumnFilter(col, '')}>✕</button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Focusable virtual body — captures arrow keys */}
        <div
          ref={gridRef}
          className="grid-body"
          style={{ height: rowVirtualizer.getTotalSize(), width: totalWidth }}
          tabIndex={0}
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

                  return (
                    <div
                      key={col}
                      className={`cell data-cell${isSel ? ' selected-cell' : ''}${isInRange ? ' range-cell' : ''}${isFiltered ? ' filtered-col' : ''}`}
                      style={{ width: getColWidth(col) }}
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
                      <span className="cell-text">{(COL_FORMATTERS[col] ?? fmtDate)(cellVal)}</span>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid-footer">
        {rows.length.toLocaleString()} row{rows.length !== 1 ? 's' : ''}
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
            {selectionStats.numCount > 1 && (
              <span className="footer-stat">Average: {_statFmt.format(selectionStats.avg)}</span>
            )}
            <span className="footer-stat">Count: {selectionStats.count.toLocaleString()}</span>
            {selectionStats.numCount > 0 && (
              <span className="footer-stat">Sum: {_statFmt.format(selectionStats.sum)}</span>
            )}
          </span>
        )}
      </div>

      {picker && (
        <ColumnValuePicker
          col={picker.col}
          anchorRect={picker.anchorRect}
          allValues={picker.allValues}
          activeValues={valueFilters?.[picker.col] ?? null}
          onApply={handlePickerApply}
          onClose={closePicker}
        />
      )}
    </div>
  )
}
