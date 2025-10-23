// This is iteration 1 of lib/shape/validators-i1.test.mjs
// Mode: Validation for the new module's public contract (pure, no side effects).
import test from 'node:test'
import assert from 'node:assert/strict'

import { assertShape, assertMjsShape } from './validators-i1.mjs'

test('assertMjsShape accepts valid { code: string }', () => {
	const input = { code: 'console.log(\'ok\')' }
	const out = assertMjsShape(input)
	assert.equal(out, input) // returns the same reference
	assert.equal(out.code, 'console.log(\'ok\')')
})

test('assertMjsShape rejects non-object', () => {
	assert.throws(() => assertMjsShape(null), {
		name: 'TypeError',
		message: 'MJS response must be an object',
	})
	assert.throws(() => assertMjsShape('nope'), {
		name: 'TypeError',
		message: 'MJS response must be an object',
	})
})

test('assertMjsShape rejects missing or non-string code', () => {
	assert.throws(() => assertMjsShape({}), {
		name: 'TypeError',
		message: 'MJS response must contain a string field "code"',
	})
	assert.throws(() => assertMjsShape({ code: 123 }), {
		name: 'TypeError',
		message: 'MJS response must contain a string field "code"',
	})
})

test('assertShape(format="mjs") enforces MJS contract', () => {
	const ok = { code: 'console.log(\'ok\')' }
	assert.equal(assertShape(ok, 'mjs'), ok)
	assert.throws(() => assertShape({}, 'mjs'), /string field "code"/)
})

test('assertShape(format="json") accepts non-null objects only', () => {
	assert.equal(assertShape({ a: 1 }, 'json').a, 1)
	assert.throws(() => assertShape(null, 'json'), {
		name: 'TypeError',
		message: 'JSON response must be a non-null object',
	})
	assert.throws(() => assertShape('x', 'json'), {
		name: 'TypeError',
		message: 'JSON response must be a non-null object',
	})
})

test('assertShape(format="text"/"markdown"/unknown) is a no-op', () => {
	const input = 'hello'
	assert.equal(assertShape(input, 'text'), input)
	assert.equal(assertShape(input, 'markdown'), input)
	assert.equal(assertShape(input, 'plain'), input)
	assert.equal(assertShape(input, 'unknown'), input)
})
