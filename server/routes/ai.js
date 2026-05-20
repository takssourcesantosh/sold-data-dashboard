import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { openRouterChat, parseAiJson, isAiConfigured } from '../ai.js'
import {
  tableExists, getColumns, getColumnStats, getColumnSamples,
  findDuplicateClusters, findReusedCerts, getTimeSeries,
  getBuyerStats, getColumnPercentile, getRowCount,
  listAlerts, listFormatting, diffBackup,
} from '../db.js'

const router = Router()

// Health check — tells client if AI is configured
router.get('/status', requireAuth, (req, res) => {
  res.json({ configured: isAiConfigured(), model: process.env.AI_MODEL || 'anthropic/claude-3-haiku' })
})

// ── 1. Natural Language Query → Filter Spec ──────────────────────────────────
router.post('/nl-query', requireAuth, async (req, res) => {
  try {
    const { query } = req.body || {}
    if (!query?.trim()) return res.status(400).json({ error: 'query required' })
    if (!tableExists()) return res.status(400).json({ error: 'No data loaded' })
    const columns = getColumns()
    const samples = getColumnSamples(5)
    const sampleStr = columns.map(c => `  ${c}: [${(samples[c] || []).slice(0, 5).join(', ')}]`).join('\n')
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a filter assistant for a diamond sales dashboard. Convert natural language queries into JSON filter specs.

Available columns and sample values:
${sampleStr}

Return ONLY valid JSON (no markdown, no explanation outside JSON):
{
  "search": "",
  "columnFilters": { "COLUMN_NAME": "value" },
  "advancedFilters": [{ "col": "COLUMN_NAME", "op": "contains|equals|not_equals|gt|lt|gte|lte|starts|ends|is_empty|is_not_empty", "val": "value" }],
  "explanation": "1 sentence describing what the filter does"
}

Rules:
- Use exact column names from the list above
- For numeric comparisons use advancedFilters with op: gt/lt/gte/lte
- For text matching use columnFilters (substring match) or advancedFilters with contains/equals
- For "above X", "more than X" use op: gt; for "at least X" use gte
- For "below X", "less than X" use op: lt; for "at most X" use lte
- Return empty strings/arrays for unused fields, never null`
      },
      { role: 'user', content: query }
    ], { max_tokens: 512 })
    const filters = parseAiJson(content)
    res.json({ filters, explanation: filters.explanation || '' })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 2. Anomaly Detection (post-upload) ───────────────────────────────────────
router.post('/analyze-upload', requireAuth, async (req, res) => {
  try {
    if (!tableExists()) return res.status(400).json({ error: 'No data loaded' })
    const columns = getColumns()
    const totalRows = getRowCount()
    // Gather stats for all columns
    const statsArr = columns.map(c => {
      const s = getColumnStats(c)
      return { column: c, nullPct: s ? ((s.nullCount / s.total) * 100).toFixed(1) : 0,
        uniqueCount: s?.uniqueCount, numMin: s?.numMin, numMax: s?.numMax, numAvg: s?.numAvg }
    })
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a data quality analyst for a diamond sales database. Analyze column statistics and identify anomalies, data quality issues, and suspicious patterns.

Return JSON only:
{
  "anomalies": [
    { "column": "column name", "issue": "description of the issue", "severity": "high|medium|low", "suggestion": "how to fix" }
  ],
  "summary": "1-2 sentence overall assessment"
}

Consider flagging: >20% null rate, impossible numeric values (negative carats, price=0), suspicious min/max outliers, low unique counts in ID-type columns.`
      },
      { role: 'user', content: `Dataset: ${totalRows.toLocaleString()} rows, ${columns.length} columns\n\nColumn statistics:\n${JSON.stringify(statsArr, null, 2)}` }
    ], { max_tokens: 1024 })
    const result = parseAiJson(content)
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 3. Data Quality Score ─────────────────────────────────────────────────────
router.post('/data-quality', requireAuth, async (req, res) => {
  try {
    if (!tableExists()) return res.status(400).json({ error: 'No data loaded' })
    const columns = getColumns()
    const totalRows = getRowCount()
    const statsArr = columns.map(c => {
      const s = getColumnStats(c)
      const nullPct = s ? parseFloat(((s.nullCount / s.total) * 100).toFixed(1)) : 0
      return { column: c, nullPct, uniqueCount: s?.uniqueCount, total: s?.total }
    })
    const avgNullPct = statsArr.reduce((sum, s) => sum + s.nullPct, 0) / statsArr.length
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a data quality scorer for a diamond sales database. Score the dataset and return JSON only:
{
  "score": 85,
  "grade": "B",
  "issues": [
    { "column": "name", "issue": "description", "impact": "high|medium|low" }
  ],
  "strengths": ["strength 1", "strength 2"],
  "summary": "1-2 sentence summary"
}

Score 0-100. Grade: A(90+), B(75-89), C(60-74), D(40-59), F(<40).
Penalize: high null rates, single-value columns, suspicious distributions.
Reward: complete data, reasonable distributions, no anomalies.`
      },
      { role: 'user', content: `${totalRows.toLocaleString()} rows, ${columns.length} columns. Avg null rate: ${avgNullPct.toFixed(1)}%\n\nStats:\n${JSON.stringify(statsArr, null, 2)}` }
    ], { max_tokens: 768 })
    const result = parseAiJson(content)
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 4. Executive Summary ──────────────────────────────────────────────────────
router.post('/summary', requireAuth, async (req, res) => {
  try {
    const { filters = {} } = req.body || {}
    if (!tableExists()) return res.status(400).json({ error: 'No data loaded' })
    const columns = getColumns()
    const totalRows = getRowCount()
    // Get stats for key columns
    const keyStats = {}
    for (const col of columns) {
      const s = getColumnStats(col)
      if (s && s.numMin != null) keyStats[col] = { min: s.numMin, max: s.numMax, avg: s.numAvg, sum: s.numSum }
    }
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a business intelligence analyst writing an executive summary for a diamond sales team. Be concise, insightful, and business-focused. Use specific numbers. Write in plain text (no markdown headers). 3-4 paragraphs max.`
      },
      { role: 'user', content: `Diamond sales dataset summary:\nTotal records: ${totalRows.toLocaleString()}\nColumns: ${columns.join(', ')}\n\nNumeric column stats:\n${JSON.stringify(keyStats, null, 2)}\n\nWrite a business executive summary highlighting key metrics, performance indicators, and notable patterns.` }
    ], { temperature: 0.4, max_tokens: 512 })
    res.json({ summary: content })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 5. Smart Filter Suggestions (zero results) ────────────────────────────────
router.post('/suggest-filters', requireAuth, async (req, res) => {
  try {
    const { query, currentFilters } = req.body || {}
    if (!tableExists()) return res.status(400).json({ error: 'No data loaded' })
    const columns = getColumns()
    const samples = getColumnSamples(5)
    const sampleStr = columns.map(c => `  ${c}: [${(samples[c] || []).slice(0, 5).join(', ')}]`).join('\n')
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a search assistant for a diamond sales dashboard. The user's search returned no results. Suggest 3 alternative filter combinations that might find related data.

Return JSON only:
{
  "suggestions": [
    {
      "description": "human readable description",
      "columnFilters": { "COLUMN": "value" },
      "advancedFilters": []
    }
  ]
}

Available columns and sample values:
${sampleStr}`
      },
      { role: 'user', content: `User searched for: "${query || ''}"\nCurrent filters: ${JSON.stringify(currentFilters || {})}\n\nSuggest 3 alternative searches that might find relevant results.` }
    ], { max_tokens: 512 })
    const result = parseAiJson(content)
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 6. Column Auto-Labeling ───────────────────────────────────────────────────
router.post('/label-columns', requireAuth, async (req, res) => {
  try {
    if (!tableExists()) return res.status(400).json({ error: 'No data loaded' })
    const columns = getColumns()
    const samples = getColumnSamples(5)
    // Only suggest labels for ambiguous/short column names
    const ambiguous = columns.filter(c => c.length <= 4 || /^col\d*$/i.test(c) || /^[A-Z]\d*$/.test(c))
    if (!ambiguous.length) return res.json({ labels: {} })
    const colData = ambiguous.map(c => ({ name: c, samples: samples[c] || [] }))
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a data labeling assistant for a diamond sales database. Suggest human-readable display names for ambiguous column names based on their sample values.

Return JSON only:
{ "labels": { "originalName": "Suggested Display Name" } }

Only include columns where you can make a confident suggestion. Keep names short (2-3 words max). This is a diamond/gemstone sales context.`
      },
      { role: 'user', content: `Columns to label:\n${JSON.stringify(colData, null, 2)}` }
    ], { max_tokens: 256 })
    const result = parseAiJson(content)
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 7. Upload Change Narrative ────────────────────────────────────────────────
router.post('/change-narrative', requireAuth, async (req, res) => {
  try {
    const { slot = 1 } = req.body || {}
    let diff
    try { diff = diffBackup(slot) } catch { return res.status(400).json({ error: 'Diff not available' }) }
    const columns = getColumns()
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a data analyst summarizing changes in a diamond sales dataset. Write a concise business-friendly narrative (2-3 sentences) describing what changed between uploads. Focus on business meaning, not technical details.`
      },
      { role: 'user', content: `Dataset change summary:\nAdded rows: ${diff.addedCount || 0}\nRemoved rows: ${diff.removedCount || 0}\nColumns: ${columns.join(', ')}\n\nSample added rows (first 3): ${JSON.stringify((diff.addedRows || []).slice(0, 3))}\nSample removed rows (first 3): ${JSON.stringify((diff.removedRows || []).slice(0, 3))}\n\nWrite a business narrative of these changes.` }
    ], { temperature: 0.4, max_tokens: 256 })
    res.json({ narrative: content })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 8. Duplicate Detection ────────────────────────────────────────────────────
router.post('/detect-duplicates', requireAuth, async (req, res) => {
  try {
    if (!tableExists()) return res.status(400).json({ error: 'No data loaded' })
    const columns = getColumns()
    // Use cert column if available, else shape+carat+color+clarity
    const certCol = columns.find(c => /cert|certificate|gia|igi|hrd|lab|report/i.test(c))
    const keyColumns = certCol ? [certCol]
      : ['Shape','Color','Clarity','Carat','Carats'].filter(c => columns.includes(c))
    if (!keyColumns.length) return res.json({ keyColumns: [], clusters: [], summary: 'No suitable key columns found.' })
    const clusters = findDuplicateClusters(keyColumns)
    if (!clusters.length) return res.json({ keyColumns, clusters: [], summary: 'No duplicate entries found.' })
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a fraud and data quality analyst for a diamond trading company. Analyze duplicate entries and assess risk.

Return JSON only:
{
  "riskLevel": "high|medium|low",
  "summary": "2-3 sentence business assessment",
  "recommendations": ["action item 1", "action item 2"]
}`
      },
      { role: 'user', content: `Found ${clusters.length} duplicate groups using key columns: ${keyColumns.join(', ')}\n\nTop duplicates:\n${JSON.stringify(clusters.slice(0, 10), null, 2)}` }
    ], { max_tokens: 512 })
    const aiResult = parseAiJson(content)
    res.json({ keyColumns, clusters: clusters.slice(0, 50), totalGroups: clusters.length, ...aiResult })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 9. Price Benchmark ────────────────────────────────────────────────────────
router.post('/benchmark', requireAuth, async (req, res) => {
  try {
    const { column, value, rowContext = {} } = req.body || {}
    if (!column || value == null) return res.status(400).json({ error: 'column and value required' })
    if (!tableExists()) return res.status(400).json({ error: 'No data loaded' })
    const stats = getColumnStats(column)
    if (!stats || stats.numMin == null) return res.status(400).json({ error: 'Not a numeric column' })
    const percentile = getColumnPercentile(column, value)
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a diamond pricing analyst. Provide a concise benchmark assessment (2-3 sentences) comparing a specific value to overall distribution. Be specific with numbers and business context.`
      },
      { role: 'user', content: `Column: ${column}\nValue being benchmarked: ${value}\nPercentile rank: ${percentile}th percentile\nDataset stats: min=${stats.numMin?.toFixed(2)}, max=${stats.numMax?.toFixed(2)}, avg=${stats.numAvg?.toFixed(2)}\nRow context: ${JSON.stringify(rowContext)}\n\nWrite a benchmark assessment.` }
    ], { temperature: 0.3, max_tokens: 200 })
    res.json({ column, value, percentile, stats: { min: stats.numMin, max: stats.numMax, avg: stats.numAvg }, assessment: content })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 10. Buyer Profile Analysis ────────────────────────────────────────────────
router.post('/buyer-profile', requireAuth, async (req, res) => {
  try {
    const { buyerCol, buyerValue } = req.body || {}
    if (!buyerCol || !buyerValue) return res.status(400).json({ error: 'buyerCol and buyerValue required' })
    const stats = getBuyerStats(buyerCol, buyerValue)
    if (!stats) return res.status(400).json({ error: 'Column not found or no data' })
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a CRM analyst for a diamond trading company. Write a concise buyer profile (3-4 sentences) covering purchase patterns, preferences, and business value. Be specific with numbers.`
      },
      { role: 'user', content: `Buyer: ${buyerValue}\nTotal purchases: ${stats.total}\nNumeric stats: ${JSON.stringify(stats.numStats)}\nTop preferences: ${JSON.stringify(stats.topCats)}\n\nWrite a buyer profile.` }
    ], { temperature: 0.4, max_tokens: 250 })
    res.json({ buyerValue, stats, profile: content })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 11. Trend Forecasting ──────────────────────────────────────────────────────
router.post('/forecast', requireAuth, async (req, res) => {
  try {
    const { dateCol, valueCol, agg = 'sum', periods = 3 } = req.body || {}
    if (!dateCol || !valueCol) return res.status(400).json({ error: 'dateCol and valueCol required' })
    const series = getTimeSeries(dateCol, valueCol, agg, 24)
    if (series.length < 3) return res.status(400).json({ error: 'Not enough time series data (need at least 3 periods)' })
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a business forecasting analyst. Analyze a time series of diamond sales data and provide forecasts.

Return JSON only:
{
  "trend": "up|down|flat|volatile",
  "forecast": [
    { "period": "YYYY-MM", "value": 12345.67, "confidence": "high|medium|low" }
  ],
  "narrative": "2-3 sentence business explanation of the trend and forecast",
  "seasonality": "description of any seasonal patterns or null"
}`
      },
      { role: 'user', content: `Historical ${agg} of ${valueCol} by month:\n${JSON.stringify(series, null, 2)}\n\nForecast the next ${periods} months.` }
    ], { max_tokens: 512 })
    const result = parseAiJson(content)
    res.json({ series, ...result })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 12. Suggest Alert Conditions ──────────────────────────────────────────────
router.post('/suggest-alerts', requireAuth, async (req, res) => {
  try {
    if (!tableExists()) return res.status(400).json({ error: 'No data loaded' })
    const columns = getColumns()
    const existing = listAlerts(req.user.id).map(a => `${a.column_name} ${a.op} ${a.threshold}`)
    const numCols = columns.filter(c => {
      const s = getColumnStats(c)
      return s?.numMin != null
    })
    const statsStr = numCols.map(c => {
      const s = getColumnStats(c)
      return `${c}: min=${s.numMin?.toFixed(2)}, max=${s.numMax?.toFixed(2)}, avg=${s.numAvg?.toFixed(2)}`
    }).join('\n')
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a business analyst for a diamond trading company. Suggest useful alert conditions based on column statistics. Alerts notify when certain thresholds are crossed.

Available ops: gt, lt, gte, lte, contains, equals, is_empty

Return JSON only:
{
  "suggestions": [
    {
      "name": "Alert name",
      "column_name": "exact column name",
      "op": "gt|lt|gte|lte|contains|equals|is_empty",
      "threshold": "value as string",
      "reason": "why this alert is useful"
    }
  ]
}

Suggest 5-7 meaningful business alerts. Use exact column names from the list.`
      },
      { role: 'user', content: `Available numeric columns:\n${statsStr}\n\nAll columns: ${columns.join(', ')}\n\nExisting alerts: ${existing.length ? existing.join('; ') : 'none'}\n\nSuggest useful business alerts.` }
    ], { max_tokens: 768 })
    const result = parseAiJson(content)
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 13. Suggest Conditional Formatting Rules ───────────────────────────────────
router.post('/suggest-formatting', requireAuth, async (req, res) => {
  try {
    if (!tableExists()) return res.status(400).json({ error: 'No data loaded' })
    const columns = getColumns()
    const numCols = []
    for (const c of columns) {
      const s = getColumnStats(c)
      if (s?.numMin != null) numCols.push({ column: c, min: s.numMin, max: s.numMax, avg: s.numAvg })
    }
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a UX analyst for a diamond trading dashboard. Suggest conditional formatting rules to highlight important patterns.

Supported rule kinds:
- "highlight": { "kind": "highlight", "op": "gt|lt|gte|lte|equals|contains", "value": "...", "color": "#hex", "bgColor": "#hex" }
- "heatmap": { "kind": "heatmap", "colorFrom": "#hex", "colorTo": "#hex" }

Return JSON only:
{
  "rules": [
    {
      "column_name": "exact column name",
      "rule": { ... rule object ... },
      "reason": "why this formatting helps"
    }
  ]
}

Suggest 4-6 meaningful formatting rules. Common patterns: red for high discounts, green for high amounts, heatmap for rate columns.`
      },
      { role: 'user', content: `Columns: ${columns.join(', ')}\n\nNumeric column ranges:\n${JSON.stringify(numCols, null, 2)}\n\nSuggest formatting rules.` }
    ], { max_tokens: 768 })
    const result = parseAiJson(content)
    res.json(result)
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 14. Cell Insight (percentile context) ─────────────────────────────────────
router.post('/cell-insight', requireAuth, async (req, res) => {
  try {
    const { column, value, rowContext = {} } = req.body || {}
    if (!column || value == null) return res.status(400).json({ error: 'column and value required' })
    if (!tableExists()) return res.status(400).json({ error: 'No data loaded' })
    const stats = getColumnStats(column)
    if (!stats || stats.numMin == null) return res.json({ insight: null })
    const percentile = getColumnPercentile(column, value)
    if (percentile == null) return res.json({ insight: null })
    // For simple percentile insights, compute without AI for speed
    let insight
    if (percentile >= 90) insight = `Top 10% — this ${column} value is among the highest in the dataset.`
    else if (percentile >= 75) insight = `Above average — higher than ${percentile}% of all ${column} values.`
    else if (percentile >= 25) insight = `Mid-range — at the ${percentile}th percentile for ${column}.`
    else if (percentile >= 10) insight = `Below average — lower than ${100 - percentile}% of all ${column} values.`
    else insight = `Bottom 10% — this ${column} value is among the lowest in the dataset.`
    res.json({ percentile, stats: { min: stats.numMin, max: stats.numMax, avg: stats.numAvg }, insight })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 15. Certificate Re-use Detection ──────────────────────────────────────────
router.post('/cert-reuse', requireAuth, async (req, res) => {
  try {
    if (!tableExists()) return res.status(400).json({ error: 'No data loaded' })
    const { certColumn, reused } = findReusedCerts()
    if (!certColumn) return res.json({ certColumn: null, reused: [], summary: 'No certificate column detected in dataset.' })
    if (!reused.length) return res.json({ certColumn, reused: [], summary: 'No reused certificate numbers found — dataset looks clean.' })
    const content = await openRouterChat([
      {
        role: 'system',
        content: `You are a compliance analyst for a diamond trading company. Certificate numbers should be unique per stone. Multiple transactions with the same certificate may indicate re-selling, data entry errors, or fraud.

Return JSON only:
{
  "riskLevel": "high|medium|low",
  "summary": "2-3 sentence assessment",
  "recommendations": ["action 1", "action 2"]
}`
      },
      { role: 'user', content: `Certificate column: ${certColumn}\nTotal reused cert numbers: ${reused.length}\nTop reused certificates:\n${JSON.stringify(reused.slice(0, 10), null, 2)}` }
    ], { max_tokens: 384 })
    const aiResult = parseAiJson(content)
    res.json({ certColumn, reused: reused.slice(0, 100), totalReused: reused.length, ...aiResult })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

// ── 16. Conversational Chat ───────────────────────────────────────────────────
router.post('/chat', requireAuth, async (req, res) => {
  try {
    const { message, context = '', history = [] } = req.body || {}
    if (!message?.trim()) return res.status(400).json({ error: 'message required' })
    if (!tableExists()) return res.status(400).json({ error: 'No data loaded' })
    const columns = getColumns()
    const totalRows = getRowCount()
    const messages = [
      {
        role: 'system',
        content: `You are a helpful AI assistant embedded in a diamond sales dashboard. Answer questions concisely (2-3 sentences). Be specific and business-focused.

Dataset: ${totalRows.toLocaleString()} rows. Columns: ${columns.join(', ')}.
${context ? `\nContext from current analysis:\n${context.slice(0, 800)}` : ''}`
      },
      ...history.slice(-6).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: message.trim() }
    ]
    const reply = await openRouterChat(messages, { temperature: 0.4, max_tokens: 300 })
    res.json({ reply })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

export default router
