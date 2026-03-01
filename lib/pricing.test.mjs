import test from 'node:test'
import assert from 'node:assert/strict'
import {
	isCacheStale,
	lookupPricing,
	formatCostPerMillion,
	calculateCost,
	contextIndicator,
	formatContextSize,
	formatUsageLine,
	formatCost,
} from './pricing.mjs'

// --- isCacheStale ---

test('isCacheStale returns true for null cache', () => {
	assert.equal(isCacheStale(null), true)
})

test('isCacheStale returns true for missing fetched_at', () => {
	assert.equal(isCacheStale({ models: {} }), true)
})

test('isCacheStale returns false for recent cache', () => {
	const cache = { fetched_at: new Date().toISOString(), models: {} }
	assert.equal(isCacheStale(cache), false)
})

test('isCacheStale returns true for old cache', () => {
	const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString()
	assert.equal(isCacheStale({ fetched_at: old, models: {} }), true)
})

// --- lookupPricing ---

test('lookupPricing returns entry for known model', () => {
	const cache = {
		models: {
			'openai/gpt-4.1-nano': { name: 'Nano', pricing: { prompt: '0.0000001' } },
		},
	}
	const entry = lookupPricing(cache, 'openai/gpt-4.1-nano')
	assert.equal(entry.name, 'Nano')
})

test('lookupPricing returns null for unknown model', () => {
	const cache = { models: {} }
	assert.equal(lookupPricing(cache, 'unknown/model'), null)
})

test('lookupPricing returns null for null cache', () => {
	assert.equal(lookupPricing(null, 'foo'), null)
})

// --- formatCostPerMillion ---

test('formatCostPerMillion formats per-token string to per-million', () => {
	assert.equal(formatCostPerMillion('0.0000001'), '$0.10')
})

test('formatCostPerMillion formats larger costs', () => {
	assert.equal(formatCostPerMillion('0.000003'), '$3.00')
})

test('formatCostPerMillion returns dash for null', () => {
	assert.equal(formatCostPerMillion(null), '—')
})

test('formatCostPerMillion returns dash for non-numeric', () => {
	assert.equal(formatCostPerMillion('abc'), '—')
})

test('formatCostPerMillion handles zero', () => {
	assert.equal(formatCostPerMillion('0'), '$0.00')
})

test('formatCostPerMillion handles very small costs', () => {
	const result = formatCostPerMillion('0.00000000001')
	assert.equal(result, '$0.0000')
})

// --- calculateCost ---

test('calculateCost uses local pricing when available', () => {
	const usage = { prompt_tokens: 100, completion_tokens: 50 }
	const entry = { pricing: { prompt: '0.000001', completion: '0.000002' } }
	const result = calculateCost(usage, entry)
	assert.equal(result.promptTokens, 100)
	assert.equal(result.completionTokens, 50)
	assert.equal(result.cost, 100 * 0.000001 + 50 * 0.000002)
	assert.equal(result.source, 'local')
})

test('calculateCost falls back to usage.cost from API', () => {
	const usage = { prompt_tokens: 100, completion_tokens: 50, cost: 0.005 }
	const result = calculateCost(usage, null)
	assert.equal(result.cost, 0.005)
	assert.equal(result.source, 'api')
})

test('calculateCost returns null cost when no pricing', () => {
	const usage = { prompt_tokens: 100, completion_tokens: 50 }
	const result = calculateCost(usage, null)
	assert.equal(result.cost, null)
	assert.equal(result.source, 'none')
})

// --- contextIndicator ---

test('contextIndicator returns null without context length', () => {
	assert.equal(contextIndicator({ prompt_tokens: 100 }, null), null)
})

test('contextIndicator returns correct percent at low usage', () => {
	const result = contextIndicator({ prompt_tokens: 1000, completion_tokens: 0 }, 100000)
	assert.equal(result.percent, 1)
	assert.equal(result.glyph, '⢀') // minimum visible dot at low usage
	assert.ok(result.color.includes('[34m')) // blue
})

test('contextIndicator returns correct percent at high usage', () => {
	const result = contextIndicator({ prompt_tokens: 90000, completion_tokens: 5000 }, 100000)
	assert.equal(result.percent, 95)
	assert.equal(result.glyph, '⣾')
	assert.ok(result.color.includes('[91m')) // brightRed
})

test('contextIndicator returns full glyph at 100%', () => {
	const result = contextIndicator({ prompt_tokens: 100000, completion_tokens: 0 }, 100000)
	assert.equal(result.percent, 100)
	assert.equal(result.glyph, '⣿')
})

test('contextIndicator caps at 100%', () => {
	const result = contextIndicator({ prompt_tokens: 200000, completion_tokens: 0 }, 100000)
	assert.equal(result.percent, 100)
})

// --- formatContextSize ---

test('formatContextSize formats millions', () => {
	assert.equal(formatContextSize(1000000), '1M')
	assert.equal(formatContextSize(1047576), '1.0M')
})

test('formatContextSize formats thousands', () => {
	assert.equal(formatContextSize(128000), '128k')
	assert.equal(formatContextSize(32768), '33k')
})

test('formatContextSize returns dash for null', () => {
	assert.equal(formatContextSize(null), '—')
})

// --- formatUsageLine ---

test('formatUsageLine with cost and indicator', () => {
	const costInfo = { promptTokens: 150, completionTokens: 800, cost: 0.0012 }
	const indicator = { glyph: '⢀', color: '\x1b[34m', percent: 12 }
	const line = formatUsageLine(costInfo, indicator)
	assert.ok(line.includes('150\u2191'))  // green up-arrow for input
	assert.ok(line.includes('800\u2193'))  // red down-arrow for output
	assert.ok(line.includes('12%'))
	assert.ok(line.includes('$0.0012q'))   // query cost
	assert.ok(line.includes('$0.0012s'))   // session defaults to query
	assert.ok(line.includes('$0.0012t'))   // total defaults to query
})

test('formatUsageLine without indicator', () => {
	const costInfo = { promptTokens: 100, completionTokens: 200, cost: 0.0005 }
	const line = formatUsageLine(costInfo, null)
	assert.ok(line.includes('100\u2191'))
	assert.ok(line.includes('200\u2193'))
	assert.ok(!line.includes('Context'))
	assert.ok(line.includes('$0.0005q'))
	assert.ok(line.includes('$0.0005s'))
	assert.ok(line.includes('$0.0005t'))
})

test('formatUsageLine without cost', () => {
	const costInfo = { promptTokens: 50, completionTokens: 100, cost: null }
	const line = formatUsageLine(costInfo, null)
	assert.ok(line.includes('50\u2191'))
	assert.ok(!line.includes('Cost'))
})

test('formatUsageLine shows session and total costs', () => {
	const costInfo = { promptTokens: 100, completionTokens: 200, cost: 0.001 }
	const line = formatUsageLine(costInfo, null, { sessionCost: 0.005, totalCost: 0.012 })
	assert.ok(line.includes('$0.0010q'))  // query
	assert.ok(line.includes('$0.0050s'))   // session
	assert.ok(line.includes('$0.0120t'))   // total
})

// --- formatCost ---

test('formatCost shows 4 decimals for normal costs', () => {
	assert.equal(formatCost(0.0012), '$0.0012')
	assert.equal(formatCost(0.15), '$0.1500')
})

test('formatCost shows 6 decimals for tiny costs', () => {
	assert.equal(formatCost(0.000002), '$0.000002')
	assert.equal(formatCost(0.0000105), '$0.000010')
})

test('formatCost handles zero', () => {
	assert.equal(formatCost(0), '$0')
})
