// Validation Mode — Iteration 2
// Characterization test: renderer contains OSC8 support, table parsing, and width utilities
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const file = resolve(process.cwd(), 'lib/markdown-renderer-i5.mjs')

test('renderer includes OSC8 link open/close sequences', async () => {
	const src = await readFile(file, 'utf8')
	// Match the literal source escape sequences (backslash + x + 1 + b), not a real ESC char
	assert.match(src, /\\x1b\]8;;/u, 'missing OSC8 open sequence')
	assert.match(src, /\\x1b\\\\/u, 'missing OSC8 close sequence')
})

test('renderer implements table parsing helpers', async () => {
	const src = await readFile(file, 'utf8')
	assert.ok(/parseTableRow|parseAlignRow/u.test(src), 'table parsing helpers not found')
})

test('renderer defines displayWidth/countRows utilities', async () => {
	const src = await readFile(file, 'utf8')
	assert.ok(/displayWidth\s*=|function\s+displayWidth/u.test(src), 'displayWidth not found')
	assert.ok(/countRows\s*=|function\s+countRows/u.test(src), 'countRows not found')
})
