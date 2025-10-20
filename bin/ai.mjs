#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/*
	Single-file CLI that:
	- Streams tokens to stdout (primary mode)
	- Writes the final full result to a file (default: ./ai.out.txt)
	- Uses OPENAI_API_KEY from the environment
	- Non-structured output (plain text)
	- Flags: --save <path>, --model <id>, --system <text>, --no-stream
	- Prompt is taken from the first positional argument OR from stdin if no positional prompt
*/

export const DEFAULTS = {
	model: 'gpt-4o-mini',
	savePath: 'ai.out.txt',
	system: 'You are a helpful assistant.',
	stream: true,
}

export const parseArgs = (argv) => {
	const opts = {
		model: DEFAULTS.model,
		savePath: DEFAULTS.savePath,
		system: DEFAULTS.system,
		stream: DEFAULTS.stream,
		prompt: undefined,
	}

	// Skip node and script paths
	const args = argv.slice(2)

	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i]

		// First non-flag token is the prompt (keep quotes intact via shell)
		if (!arg.startsWith('--') && opts.prompt === undefined) {
			opts.prompt = arg
			continue
		}

		if (arg === '--save') {
			opts.savePath = args[i + 1]
			i += 1
			continue
		}
		if (arg === '--model') {
			opts.model = args[i + 1]
			i += 1
			continue
		}
		if (arg === '--system') {
			opts.system = args[i + 1]
			i += 1
			continue
		}
		if (arg === '--no-stream') {
			opts.stream = false
			continue
		}
	}

	return opts
}

export const readAllStdin = async () => {
	if (process.stdin.isTTY) {
		return ''
	}
	let data = ''
	for await (const chunk of process.stdin) {
		data += chunk
	}
	return String(data).trim()
}

export const buildChatRequestBody = ({ system, prompt, model, stream }) => {
	return {
		model,
		stream,
		messages: [
			{ role: 'system', content: system },
			{ role: 'user', content: prompt },
		],
	}
}

const openaiFetch = async ({ apiKey, body }) => {
	const res = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(body),
	})
	if (!res.ok || !res.body) {
		const text = await res.text().catch(() => '')
		throw new Error(
			`OpenAI API error: ${res.status} ${res.statusText} ${text ? `- ${text}` : ''}`,
		)
	}
	return res
}

/*
	parseSseAndAccumulate
	- Accepts a string (for tests) or incremental chunks (runtime)
	- Calls onDelta(text) for each delta
	- Returns the final concatenated text
*/
export const parseSseAndAccumulate = async (bufferOrString, onDelta) => {
	const text = typeof bufferOrString === 'string'
		? bufferOrString
		: new TextDecoder().decode(bufferOrString)

	let final = ''
	const lines = text.split(/\r?\n/)

	for (const line of lines) {
		const trimmed = line.trim()
		if (!trimmed.startsWith('data:')) {
			continue
		}
		const payload = trimmed.slice(5).trim()
		if (!payload || payload === '[DONE]') {
			continue
		}
		try {
			const json = JSON.parse(payload)
			const delta = json?.choices?.[0]?.delta ?? {}
			const piece = typeof delta?.content === 'string' ? delta.content : ''
			if (piece) {
				onDelta(piece)
				final += piece
			}
		} catch {
			// ignore malformed lines
		}
	}

	return final
}

const streamCompletion = async ({ apiKey, body, savePath }) => {
	const res = await openaiFetch({ apiKey, body })

	// Accumulate full response to write to file at the end
	let finalText = ''
	const decoder = new TextDecoder()

	if (body.stream) {
		for await (const chunk of res.body) {
			const text = decoder.decode(chunk, { stream: true })
			const deltaText = await parseSseAndAccumulate(text, (piece) => {
				process.stdout.write(piece)
			})
			if (deltaText) {
				finalText += deltaText
			}
		}
		process.stdout.write('\n')
	} else {
		// Non-streaming fallback: parse once
		const json = await res.json()
		const content = json?.choices?.[0]?.message?.content ?? ''
		process.stdout.write(content + '\n')
		finalText = content
	}

	// Write final concatenated output to file
	const outPath = path.resolve(process.cwd(), savePath)
	await fs.writeFile(outPath, finalText, 'utf8')
	return { finalText, outPath }
}

const main = async () => {
	try {
		const opts = parseArgs(process.argv)

		const apiKey = process.env.OPENAI_API_KEY
		if (!apiKey) {
			console.error('Missing OPENAI_API_KEY in environment')
			process.exit(3)
			return
		}

		let prompt = opts.prompt
		if (!prompt) {
			prompt = await readAllStdin()
		}

		if (!prompt) {
			console.error('Usage: ai "<prompt text>" [--save file] [--model id] [--system text]')
			process.exit(1)
			return
		}

		const body = buildChatRequestBody({
			system: opts.system,
			prompt,
			model: opts.model,
			stream: opts.stream,
		})

		const { outPath } = await streamCompletion({
			apiKey,
			body,
			savePath: opts.savePath,
		})

		// Write a brief note to stderr so it doesn't pollute stdout pipelines
		process.stderr.write(`\n[Saved final output to: ${outPath}]\n`)
		process.exit(0)
	} catch (e) {
		console.error(e)
		process.exit(3)
	}
}
await main()
