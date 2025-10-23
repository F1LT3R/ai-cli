// Validation Mode — Iteration 2
// Characterization test: assert current options parsing contracts by source inspection
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const file = resolve(process.cwd(), 'lib/options-i3.mjs')

test('options maps --json to format=json', async () => {
	const src = await readFile(file, 'utf8')
	// Seen pattern: if (token === '--json') { out.f...
	assert.match(src, /token\s*===\s*['"]--json['"]/u, 'does not recognize --json token')
	assert.match(src, /format\s*[:=]\s*['"]json['"]/u, 'does not set format=json for --json')
})

test('options supports --format=<name> long flag', async () => {
	const src = await readFile(file, 'utf8')
	assert.match(src, /--format(?:=|\s+)/u, 'no long --format handling detected')
})

test('options has normalizeFormat or equivalent', async () => {
	const src = await readFile(file, 'utf8')
	assert.ok(/normalizeFormat\s*=|function\s+normalizeFormat/u.test(src), 'normalizeFormat helper missing')
})
