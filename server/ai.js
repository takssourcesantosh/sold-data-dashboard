import 'dotenv/config'

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1'
export const DEFAULT_MODEL = process.env.AI_MODEL || 'meta-llama/llama-3.3-70b-instruct:free'

// Fallback chain — tried in order when primary model hits 429 or 404
// Updated 2026-05-19 from live OpenRouter /api/v1/models
const FALLBACK_MODELS = [
  process.env.AI_MODEL || 'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'openai/gpt-oss-120b:free',
  'openai/gpt-oss-20b:free',
  'deepseek/deepseek-v4-flash:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'qwen/qwen3-coder:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-nano-30b-a3b:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'z-ai/glm-4.5-air:free',
  'minimax/minimax-m2.5:free',
  'arcee-ai/trinity-large-thinking:free',
  'poolside/laguna-m.1:free',
  'poolside/laguna-xs.2:free',
  'baidu/cobuddy:free',
].filter((v, i, a) => a.indexOf(v) === i) // dedupe

export function isAiConfigured() {
  return !!process.env.OPENROUTER_API_KEY
}

async function callModel(model, messages, temperature, max_tokens, key) {
  const res = await fetch(`${OPENROUTER_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.APP_URL || 'http://localhost:3001',
      'X-Title': 'Belgium Diamonds Dashboard',
    },
    body: JSON.stringify({ model, messages, temperature, max_tokens })
  })
  return res
}

export async function openRouterChat(messages, { model = DEFAULT_MODEL, temperature = 0.2, max_tokens = 2048 } = {}) {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY not set in .env')

  // Build model chain: requested model first, then fallbacks (skip duplicates)
  const chain = [model, ...FALLBACK_MODELS.filter(m => m !== model)]

  let lastError = null
  for (const m of chain) {
    const res = await callModel(m, messages, temperature, max_tokens, key)

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '2', 10)
      console.log(`[AI] ${m} rate-limited — waiting ${retryAfter}s then trying next model`)
      await new Promise(r => setTimeout(r, retryAfter * 1000))
      // Try same model once more before moving on
      const retry = await callModel(m, messages, temperature, max_tokens, key)
      if (retry.status === 429) {
        console.log(`[AI] ${m} still rate-limited — switching to next fallback`)
        lastError = `${m} rate-limited`
        continue
      }
      if (!retry.ok) { lastError = `${m}: ${retry.status}`; continue }
      const data = await retry.json()
      const content = data.choices?.[0]?.message?.content
      if (content) { console.log(`[AI] used ${m} (after retry)`); return content }
      continue
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      lastError = `${m}: ${res.status}`
      console.log(`[AI] ${m} failed (${res.status}) — trying next`)
      continue // skip immediately, no wait on 404/500
    }

    const data = await res.json()
    const content = data.choices?.[0]?.message?.content
    if (!content) { lastError = `${m}: empty response`; continue }
    if (m !== model) console.log(`[AI] used fallback model: ${m}`)
    return content
  }

  throw new Error(`All AI models failed. Last error: ${lastError}`)
}

// Strip markdown code fences and parse JSON — multiple fallback strategies
export function parseAiJson(text) {
  // 1. Strip code fences
  let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim()
  // 2. Strip <think>...</think> tags (some models emit reasoning blocks)
  clean = clean.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  // 3. Sanitize bad control characters inside JSON strings
  //    Replace unescaped control chars (0x00-0x1F except \n \r \t) with a space
  //    Also replace literal newlines/tabs inside string values with escaped versions
  function sanitizeControlChars(str) {
    // Replace control chars that are illegal in JSON strings
    return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ' ')
  }
  clean = sanitizeControlChars(clean)
  // 4. Direct parse
  try { return JSON.parse(clean) } catch {}
  // 5. Extract first JSON object or array
  const m = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
  if (m) {
    try { return JSON.parse(m[1]) } catch {}
    // Try sanitizing the extracted block too
    try { return JSON.parse(sanitizeControlChars(m[1])) } catch {}
  }
  // 6. Try to find JSON after a newline (model may add preamble text)
  const lines = clean.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const slice = lines.slice(i).join('\n').trim()
    if (slice.startsWith('{') || slice.startsWith('[')) {
      try { return JSON.parse(slice) } catch {}
    }
  }
  // 7. Last resort: truncate at last valid closing brace
  const lastBrace = clean.lastIndexOf('}')
  if (lastBrace > 0) {
    const truncated = clean.slice(0, lastBrace + 1)
    try { return JSON.parse(truncated) } catch {}
  }
  throw new Error('AI returned invalid JSON: ' + clean.slice(0, 300))
}
