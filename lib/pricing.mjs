// Pricing data management — fetch, cache, lookup, cost calculation.
// Codestyle: tabs, single quotes, no semicolons, trailing commas, ESM.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_PATH = path.join(__dirname, 'pricing.json')
const STALE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

export const fetchPricingFromAPI = async (baseUrl) => {
	const url = `${String(baseUrl).replace(/\/+$/, '')}/models`
	const res = await fetch(url)
	if (!res.ok) {
		throw new Error(`Failed to fetch models: ${res.status} ${res.statusText}`)
	}
	const json = await res.json()
	return json.data ?? json
}

export const writePricingCache = async (models) => {
	const indexed = {}
	for (const m of models) {
		if (!m.id) continue
		indexed[m.id] = {
			name: m.name ?? m.id,
			description: m.description ?? '',
			context_length: m.context_length ?? null,
			max_completion_tokens: m.top_provider?.max_completion_tokens ?? null,
			pricing: {
				prompt: m.pricing?.prompt ?? null,
				completion: m.pricing?.completion ?? null,
			},
		}
	}
	const cache = {
		fetched_at: new Date().toISOString(),
		models: indexed,
	}
	await fs.writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + '\n', 'utf8')
	return cache
}

export const readPricingCache = async () => {
	try {
		const raw = await fs.readFile(CACHE_PATH, 'utf8')
		return JSON.parse(raw)
	} catch {
		return null
	}
}

export const isCacheStale = (cache) => {
	if (!cache?.fetched_at) return true
	const age = Date.now() - new Date(cache.fetched_at).getTime()
	return age > STALE_MS
}

export const ensurePricingCache = async (baseUrl, { force } = {}) => {
	if (!force) {
		const existing = await readPricingCache()
		if (existing && !isCacheStale(existing)) return existing
	}
	const models = await fetchPricingFromAPI(baseUrl)
	return writePricingCache(models)
}

export const lookupPricing = (cache, modelId) => {
	if (!cache?.models) return null
	if (cache.models[modelId]) return cache.models[modelId]
	// Try progressively stripping trailing segments that look like version/date suffixes
	// e.g. openai/gpt-4.1-nano-2025-04-14 → openai/gpt-4.1-nano
	// e.g. deepseek/deepseek-v3.2-20251201 → deepseek/deepseek-v3.2
	// e.g. mistralai/mistral-small-3.2-24b-instruct-2506 → ...-24b-instruct → ...
	const candidates = new Set()
	// Strip trailing date patterns: -YYYYMMDD or -YYYY-MM-DD or -YYMM
	candidates.add(modelId.replace(/-\d{4,8}(-\d{2}){0,2}$/, ''))
	// Strip trailing -NNNNN (short numeric suffix like -2506)
	candidates.add(modelId.replace(/-\d{2,4}$/, ''))
	for (const c of candidates) {
		if (c !== modelId && cache.models[c]) return cache.models[c]
	}
	return null
}

export const formatCostPerMillion = (perTokenStr) => {
	if (perTokenStr == null) return '—'
	const perToken = parseFloat(perTokenStr)
	if (isNaN(perToken)) return '—'
	const perMillion = perToken * 1_000_000
	if (perMillion === 0) return '$0.00'
	if (perMillion < 0.01) return `$${perMillion.toFixed(4)}`
	return `$${perMillion.toFixed(2)}`
}

export const calculateCost = (usage, pricingEntry) => {
	const promptTokens = usage?.prompt_tokens ?? 0
	const completionTokens = usage?.completion_tokens ?? 0
	const totalTokens = usage?.total_tokens ?? (promptTokens + completionTokens)

	if (pricingEntry?.pricing?.prompt != null && pricingEntry?.pricing?.completion != null) {
		const promptCost = promptTokens * parseFloat(pricingEntry.pricing.prompt)
		const completionCost = completionTokens * parseFloat(pricingEntry.pricing.completion)
		return {
			promptTokens,
			completionTokens,
			totalTokens,
			cost: promptCost + completionCost,
			source: 'local',
		}
	}

	// Fallback to OpenRouter's usage.cost
	if (usage?.cost != null) {
		return {
			promptTokens,
			completionTokens,
			totalTokens,
			cost: usage.cost,
			source: 'api',
		}
	}

	return {
		promptTokens,
		completionTokens,
		totalTokens,
		cost: null,
		source: 'none',
	}
}

// Braille fill states (9 levels): minimal dot → full
const BRAILLE = ['⢀', '⢀', '⣀', '⣠', '⣤', '⣴', '⣶', '⣾', '⣿']

// Heat ramp from fstop
const HEAT_RAMP = [
	{ max: 14, color: '\x1b[34m' },   // blue
	{ max: 29, color: '\x1b[96m' },   // brightCyan
	{ max: 43, color: '\x1b[36m' },   // cyan
	{ max: 57, color: '\x1b[95m' },   // brightMagenta
	{ max: 71, color: '\x1b[35m' },   // magenta
	{ max: 85, color: '\x1b[31m' },   // red
	{ max: 100, color: '\x1b[91m' },  // brightRed
]

export const contextIndicator = (usage, contextLength) => {
	if (!contextLength || !usage) return null
	const totalUsed = (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0)
	const percent = Math.min(100, Math.round((totalUsed / contextLength) * 100))
	const idx = Math.min(BRAILLE.length - 1, Math.floor((percent / 100) * (BRAILLE.length - 1)))
	const glyph = BRAILLE[idx]
	let color = HEAT_RAMP[HEAT_RAMP.length - 1].color
	for (const step of HEAT_RAMP) {
		if (percent <= step.max) {
			color = step.color
			break
		}
	}
	return { glyph, color, percent }
}

export const formatContextSize = (contextLength) => {
	if (!contextLength) return '—'
	if (contextLength >= 1_000_000) {
		const m = contextLength / 1_000_000
		return m % 1 === 0 ? `${m}M` : `${m.toFixed(1)}M`
	}
	return `${Math.round(contextLength / 1000)}k`
}

// Format a cost value with enough precision to show meaningful digits
export const formatCost = (cost) => {
	if (cost === 0) return '$0'
	if (cost >= 0.01) return `$${cost.toFixed(4)}`
	if (cost >= 0.0001) return `$${cost.toFixed(4)}`
	if (cost >= 0.000001) return `$${cost.toFixed(6)}`
	return `$${cost.toExponential(1)}`
}

export const formatUsageLine = (costInfo, indicator, { sessionCost, totalCost } = {}) => {
	const R = '\x1b[0m'
	const green = '\x1b[32m'
	const red = '\x1b[31m'
	const yellow = '\x1b[33m'
	const cyan = '\x1b[36m'
	const dim = '\x1b[2m'

	// Context: bright magenta label, heat-ramp braille on dark gray background
	const ctxStyle = '\x1b[45;97m' // dark magenta bg, bright white text
	let line = ''
	if (indicator) {
		const bg = '\x1b[48;5;236m' // dark gray background
		line += `${ctxStyle} Context: ${indicator.glyph} ${indicator.percent}% ${R}`
		line += ` ${dim}|${R} `
	}

	// Tokens: green(in↑) / red(out↓)
	line += `${dim}Tokens: ${R}${green}${costInfo.promptTokens}\u2191${R}${dim}/${R}${red}${costInfo.completionTokens}\u2193${R}`

	// Cost: green(query) / yellow(session) / red(total)
	if (costInfo.cost != null) {
		line += ` ${dim}| Cost: ${R}${green}${formatCost(costInfo.cost)}q${R}`
		line += `${dim}/${R}${yellow}${formatCost(sessionCost ?? costInfo.cost)}s${R}`
		line += `${dim}/${R}${red}${formatCost(totalCost ?? sessionCost ?? costInfo.cost)}t${R}`
	}

	return line
}
