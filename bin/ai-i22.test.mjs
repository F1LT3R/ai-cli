// Validation Mode — Iteration 2
// Characterization test: ensure CLI entrypoint wiring remains consistent (no runtime exec)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const file = resolve(process.cwd(), 'bin/ai-i22.mjs')

test('cli file exists and has shebang', async () => {
	const src = await readFile(file, 'utf8')
	assert.ok(src.startsWith('#!/usr/bin/env node'), 'missing shebang')
})

test('cli handles SIGINT via onSigint handler', async () => {
	const src = await readFile(file, 'utf8')
	assert.match(src, /onSigint\s*=\s*\(\)\s*=>/u, 'missing onSigint arrow')
})

test('cli references effectiveFormat or equivalent format resolution', async () => {
	const src = await readFile(file, 'utf8')
	// Accepts either an imported helper or inline function call
	assert.ok(/effectiveFormat\s*\(|format\s*[:=]/u.test(src), 'no obvious format resolution present')
})
