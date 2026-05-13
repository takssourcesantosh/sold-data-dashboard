// Serialize current view state to and from URL hash + recent-searches list.

const RECENT_KEY = 'bd-recent-searches'
const RECENT_MAX = 10

export function getRecentSearches() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || [] } catch { return [] }
}

export function addRecentSearch(q) {
  if (!q || !q.trim()) return
  const t = q.trim()
  const list = getRecentSearches().filter(x => x !== t)
  list.unshift(t)
  while (list.length > RECENT_MAX) list.pop()
  localStorage.setItem(RECENT_KEY, JSON.stringify(list))
}

export function clearRecentSearches() {
  localStorage.removeItem(RECENT_KEY)
}

// Encode/decode view payload for URL hash (base64url of JSON).
export function encodeViewToHash(payload) {
  const json = JSON.stringify(payload)
  const bytes = new TextEncoder().encode(json)
  const b64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeViewFromHash(hash) {
  try {
    let b64 = hash.replace(/-/g, '+').replace(/_/g, '/')
    while (b64.length % 4) b64 += '='
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    return JSON.parse(new TextDecoder().decode(bytes))
  } catch { return null }
}

// Build full shareable URL from current state
export function buildShareUrl(payload) {
  const hash = encodeViewToHash(payload)
  return `${location.origin}${location.pathname}#v=${hash}`
}

// Parse view from current location.hash; returns null if absent or bad
export function readViewFromUrl() {
  const m = /[#&]v=([^&]+)/.exec(location.hash || '')
  if (!m) return null
  return decodeViewFromHash(m[1])
}

// Clear hash without page reload
export function clearViewHash() {
  if (location.hash.includes('v=')) {
    history.replaceState(null, '', location.pathname + location.search)
  }
}
