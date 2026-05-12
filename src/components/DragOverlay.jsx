import { useEffect, useRef } from 'react'

export default function DragOverlay({ onUpload, onClose }) {
  const overlayRef = useRef(null)

  useEffect(() => {
    const el = overlayRef.current
    if (!el) return

    const onDrop = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const file = e.dataTransfer?.files?.[0]
      if (file) onUpload(file)
      onClose()
    }

    const onDragOver = (e) => e.preventDefault()

    el.addEventListener('drop', onDrop)
    el.addEventListener('dragover', onDragOver)
    return () => {
      el.removeEventListener('drop', onDrop)
      el.removeEventListener('dragover', onDragOver)
    }
  }, [onUpload, onClose])

  return (
    <div ref={overlayRef} className="drag-overlay" onClick={onClose}>
      <div className="drag-overlay-box">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <p>Drop CSV or Excel file here</p>
      </div>
    </div>
  )
}
