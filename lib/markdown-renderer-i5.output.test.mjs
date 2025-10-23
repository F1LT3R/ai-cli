// Validation Mode — Iteration 3
// Dynamic characterization of MarkdownRenderer output without changing app code.
import test from 'node:test'
import assert from 'node:assert/strict'

// Import the class under test
import { MarkdownRenderer } from './markdown-renderer-i5.mjs'

const withEnv = (env, fn) => {
	const prev = { ...process.env }
	Object.assign(process.env, env)
	try {
		return fn()
	} finally {
		process.env = prev
	}
}

test('OSC8 hyperlinks are emitted when supported', () => {
	withEnv({ TERM_PROGRAM: 'iTerm.app' }, () => {
		const r = new MarkdownRenderer({ tty: true, noColor: false, width: 80 })
		let out = ''
		out += r.push('[link](https://example.com)\n')
		out += r.flush()
		// Expect OSC8 open/close sequences and the URL visible
		assert.match(out, /\x1b\]8;;https:\/\/example\.com\x1b\\/u, 'OSC8 open missing')
		assert.match(out, /\x1b\]8;;\x1b\\/u, 'OSC8 close missing')
		assert.match(out, /https:\/\/example\.com/u, 'URL not present')
	})
})

test('OSC8 hyperlinks are NOT emitted when unsupported terminal', () => {
	withEnv({ TERM_PROGRAM: 'Apple_Terminal' }, () => {
		const r = new MarkdownRenderer({ tty: true, noColor: false, width: 80 })
		let out = ''
		out += r.push('[link](https://example.com)\n')
		out += r.flush()
		assert.doesNotMatch(out, /\x1b\]8;;/u, 'OSC8 should be disabled')
		assert.match(out, /https:\/\/example\.com/u, 'URL not present')
	})
})

test('rowsPrinted increases according to line wrapping', () => {
	const width = 20
	const long = 'a'.repeat(100) + '\n' // 100 chars, no ANSI
	const r = new MarkdownRenderer({ tty: false, noColor: true, width })
	let out = ''
	out += r.push(long)
	// 100 cols across width 20 -> 5 rows
	assert.equal(r.rowsPrinted, 5, 'expected 5 wrapped rows')
	assert.equal(out.endsWith('\n'), true, 'should echo newline in output')
})

