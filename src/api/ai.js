const BASE = '/api'

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('bd-token') || ''
  const headers = { ...opts.headers }
  if (token) headers['Authorization'] = `Bearer ${token}`
  let body = opts.body
  if (body && typeof body === 'object' && !(body instanceof FormData)) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(body)
  }
  const res = await fetch(BASE + path, { ...opts, headers, body })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || res.statusText)
  }
  return res
}

export async function aiStatus() {
  const res = await apiFetch('/ai/status')
  return res.json()
}

export async function aiNlQuery(query) {
  const res = await apiFetch('/ai/nl-query', { method: 'POST', body: { query } })
  return res.json()
}

export async function aiAnalyzeUpload() {
  const res = await apiFetch('/ai/analyze-upload', { method: 'POST', body: {} })
  return res.json()
}

export async function aiDataQuality() {
  const res = await apiFetch('/ai/data-quality', { method: 'POST', body: {} })
  return res.json()
}

export async function aiSummary(filters = {}) {
  const res = await apiFetch('/ai/summary', { method: 'POST', body: { filters } })
  return res.json()
}

export async function aiSuggestFilters(query, currentFilters) {
  const res = await apiFetch('/ai/suggest-filters', { method: 'POST', body: { query, currentFilters } })
  return res.json()
}

export async function aiLabelColumns() {
  const res = await apiFetch('/ai/label-columns', { method: 'POST', body: {} })
  return res.json()
}

export async function aiChangeNarrative(slot = 1) {
  const res = await apiFetch('/ai/change-narrative', { method: 'POST', body: { slot } })
  return res.json()
}

export async function aiDetectDuplicates() {
  const res = await apiFetch('/ai/detect-duplicates', { method: 'POST', body: {} })
  return res.json()
}

export async function aiBenchmark(column, value, rowContext = {}) {
  const res = await apiFetch('/ai/benchmark', { method: 'POST', body: { column, value, rowContext } })
  return res.json()
}

export async function aiBuyerProfile(buyerCol, buyerValue) {
  const res = await apiFetch('/ai/buyer-profile', { method: 'POST', body: { buyerCol, buyerValue } })
  return res.json()
}

export async function aiForecast(dateCol, valueCol, agg = 'sum', periods = 3) {
  const res = await apiFetch('/ai/forecast', { method: 'POST', body: { dateCol, valueCol, agg, periods } })
  return res.json()
}

export async function aiSuggestAlerts() {
  const res = await apiFetch('/ai/suggest-alerts', { method: 'POST', body: {} })
  return res.json()
}

export async function aiSuggestFormatting() {
  const res = await apiFetch('/ai/suggest-formatting', { method: 'POST', body: {} })
  return res.json()
}

export async function aiCellInsight(column, value, rowContext = {}) {
  const res = await apiFetch('/ai/cell-insight', { method: 'POST', body: { column, value, rowContext } })
  return res.json()
}

export async function aiCertReuse() {
  const res = await apiFetch('/ai/cert-reuse', { method: 'POST', body: {} })
  return res.json()
}

export async function aiChat(message, context = '', history = []) {
  const res = await apiFetch('/ai/chat', { method: 'POST', body: { message, context, history } })
  return res.json()
}
