import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const ToastCtx = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts(t => t.filter(x => x.id !== id))
  }, [])

  const push = useCallback((message, opts = {}) => {
    const id = Math.random().toString(36).slice(2)
    const tone = opts.tone || 'info' // info | success | warn | error
    const ttl = opts.ttl ?? 4500
    setToasts(t => [...t, { id, message, tone, action: opts.action }])
    if (ttl > 0) setTimeout(() => dismiss(id), ttl)
    return id
  }, [dismiss])

  const api = {
    info:    (m, o) => push(m, { ...o, tone: 'info' }),
    success: (m, o) => push(m, { ...o, tone: 'success' }),
    warn:    (m, o) => push(m, { ...o, tone: 'warn' }),
    error:   (m, o) => push(m, { ...o, tone: 'error', ttl: o?.ttl ?? 7000 }),
    dismiss,
  }

  return (
    <ToastCtx.Provider value={api}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            <span className="toast-msg">{t.message}</span>
            {t.action && (
              <button className="toast-action" onClick={() => { t.action.onClick(); dismiss(t.id) }}>
                {t.action.label}
              </button>
            )}
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">✕</button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}

// Confirm dialog using promise-based modal
export function useConfirm() {
  const [state, setState] = useState(null) // { message, resolve }
  const ask = useCallback((message, opts = {}) => new Promise(resolve => {
    setState({ message, opts, resolve })
  }), [])
  const Modal = state ? (
    <div className="confirm-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) { state.resolve(false); setState(null) } }}>
      <div className="confirm-box" role="dialog" aria-modal="true">
        <div className="confirm-msg">{state.message}</div>
        <div className="confirm-actions">
          <button className="vp-btn" onClick={() => { state.resolve(false); setState(null) }}>{state.opts.cancelLabel ?? 'Cancel'}</button>
          <button className={`vp-btn ${state.opts.danger ? 'vp-btn-danger' : 'vp-btn-ok'}`} onClick={() => { state.resolve(true); setState(null) }}>{state.opts.confirmLabel ?? 'Confirm'}</button>
        </div>
      </div>
    </div>
  ) : null
  return [ask, Modal]
}

// Hook for ESC-to-close on a modal element
export function useEscClose(onClose) {
  useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onClose])
}
