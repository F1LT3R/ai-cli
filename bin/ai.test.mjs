import { test, mock } from 'node:test'
import assert from 'node:assert/strict'

// Import helpers from the CLI script (single-file design)
import {
	parseArgs,
	buildChatRequestBody,
	parseSseAndAccumulate,
} from '../bin/ai.mjs'

test('Given minimal args, When parsed, Then prompt is read from flag and streaming is default-on', () => {
	const argv = ['node', 'ai', '--prompt', 'hello world']
	const opts = parseArgs(argv)
	assert.equal(opts.prompt, 'hello world')
	assert.equal(opts.savePath, 'ai.out.txt') // default save path
	assert.equal(opts.model, 'gpt-4o-mini')
	assert.equal(opts.stream, true)
})

test('Given custom save path, When parsed, Then savePath is set', () => {
	const argv = ['node', 'ai', '--prompt', 'x', '--save', 'out.txt']
	const opts = parseArgs(argv)
	assert.equal(opts.savePath, 'out.txt')
})

test('Given no prompt flag, When stdin is intended, Then parseArgs leaves prompt undefined', () => {
	const argv = ['node', 'ai']
	const opts = parseArgs(argv)
	assert.equal(opts.prompt, undefined)
})

test('Given a user/system/model, When building request, Then body is constructed for streaming', () => {
	const body = buildChatRequestBody({
		system: 'You are helpful.',
		prompt: 'Say hi',
		model: 'gpt-4o-mini',
	})
	assert.equal(body.stream, true)
	assert.equal(body.model, 'gpt-4o-mini')
	assert.deepEqual(body.messages, [
		{ role: 'system', content: 'You are helpful.' },
		{ role: 'user', content: 'Say hi' },
	])
})

test('Given SSE chunks, When parsed, Then text is accumulated in order', async () => {
	// Simulate three server-sent "data:" lines from Chat Completions streaming API
	const sseLines = [
		'data: {"id":"1","object":"chat.completion.chunk","choices":[{"delta":{"content":"Hello"},"index":0,"finish_reason":null}]}',
		'data: {"id":"1","object":"chat.completion.chunk","choices":[{"delta":{"content":" there"},"index":0,"finish_reason":null}]}',
		'data: {"id":"1","object":"chat.completion.chunk","choices":[{"delta":{},"index":0,"finish_reason":"stop"}]}',
		'data: [DONE]',
	].join('\n')

	let printed = ''
	const onDelta = (text) => {
		printed += text
	}

	const final = await parseSseAndAccumulate(sseLines, onDelta)
	assert.equal(printed, 'Hello there')
	assert.equal(final, 'Hello there')
})
