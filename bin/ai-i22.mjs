#!/usr/bin/env node
// This is iteration 22 of bin/ai-i21.mjs (pass effectiveFormat into streamCompletion)

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import * as readline from 'node:readline/promises'
import { stdin as rlIn, stderr as rlErr } from 'node:process'
import { MarkdownRenderer } from '../lib/markdown-renderer-i5.mjs'
import { parseOptions } from '../lib/options-i3.mjs'
import { shapeRequestBody } from '../lib/response-shape-i2.mjs'

const SGR = {
	reset: '\x1b[0m',
	yellow: '\x1b[33m',
	green: '\x1b[32m',
	cyan: '\x1b[36m',
	red: '\x1b[31m',
	magenta: '\x1b[35m',
	bold: '\x1b[1m',
	dim: '\x1b[2m',
}

const MODELS = [
	{ alias: 'nano', id: 'openai/gpt-4.1-nano-2025-04-14', description: 'Cheapest, fast' },
	{ alias: 'mini', id: 'openai/gpt-5-mini-2025-08-07', description: 'Low-cost OpenAI, good coding' },
	{ alias: 'gpt5', id: 'openai/gpt-5.2-20251211', description: 'OpenAI GPT-5.2' },
	{ alias: 'flash', id: 'google/gemini-2.5-flash', description: 'Gemini 2.5 Flash' },
	{ alias: 'gemma', id: 'google/gemma-3-27b-it', description: 'Google Gemma 3 27B' },
	{ alias: 'llama', id: 'meta-llama/llama-3.3-70b-instruct', description: 'Meta Llama 3.3 70B' },
	{ alias: 'mistral', id: 'mistralai/mistral-small-3.2-24b-instruct-2506', description: 'Mistral Small 3.2' },
	{ alias: 'deepseek', id: 'deepseek/deepseek-v3.2-20251201', description: 'DeepSeek V3.2' },
]

const resolveModel = (input) => {
	if (!input) return undefined
	const entry = MODELS.find((m) => m.alias === input)
	if (entry) return entry.id
	// Passthrough full model IDs (contain a slash)
	return input
}

/*
	CLI behavior:
	- Discover project root by walking up from CWD to the nearest folder containing package.json
	- Use `./.ai/config.json` under that root for settings + conversation
	- Auto-create the JSON file if missing (with sane defaults)
	- Prepend prior conversation to the next request for continuity
	- Stream tokens to stdout; then interactive autosave prompt (TTY-aware)
	- Flags: --model <id>, --system <text>, --no-stream, --raw (future), --debug (future)
	- Positional prompt OR stdin if none
*/

export const parseArgs = (argv) => {
	const opts = {
		model: undefined,
		system: undefined,
		stream: true,
		prompt: undefined,
		listModels: false,
	}

	const args = argv.slice(2)
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i]

		// First non-flag token becomes the prompt
		if (!arg.startsWith('--') && opts.prompt === undefined) {
			opts.prompt = arg
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
		if (arg === '--models') {
			opts.listModels = true
			continue
		}
	}

	return opts
}

const readAllStdin = async () => {
	if (process.stdin.isTTY) {
		return ''
	}
	let data = ''
	for await (const chunk of process.stdin) {
		data += chunk
	}
	return String(data).trim()
}

const fileExists = async (p) => {
	try {
		await fs.access(p)
		return true
	} catch {
		return false
	}
}

const findProjectRoot = async (startDir) => {
	let dir = path.resolve(startDir)
	while (true) {
		const pkg = path.join(dir, 'package.json')
		if (await fileExists(pkg)) {
			return dir
		}
		const parent = path.dirname(dir)
		if (parent === dir) {
			break
		}
		dir = parent
	}
	// Fallback: use current working directory if no package.json found
	return path.resolve(startDir)
}

const defaultConfig = () => ({
	provider: 'openrouter',
	base_url: 'https://openrouter.ai/api/v1',
	model: 'openai/gpt-4.1-nano-2025-04-14',
	system: 'You are a helpful assistant.',
	temperature: 0.7,
	max_tokens: 1024,
	stream_default: true,
	save_path_default: 'ai.out.txt',
	env_key: 'OPENROUTER_API_KEY',
	conversation: [],
	meta: {
		last_updated: null,
		total_turns: 0,
		notes: 'This file is updated by the CLI after each run. Do not check secrets into VCS.',
	},
})

const ensureConfig = async (rootDir) => {
	const aiDir = path.join(rootDir, '.ai')
	const cfgPath = path.join(aiDir, 'config.json')
	const oldPath = path.join(aiDir, 'openai.json')
	await fs.mkdir(aiDir, { recursive: true })
	// Migrate from old filename if needed
	if (!(await fileExists(cfgPath)) && (await fileExists(oldPath))) {
		await fs.rename(oldPath, cfgPath)
		// Patch stale OpenAI defaults to OpenRouter
		try {
			const raw = await fs.readFile(cfgPath, 'utf8')
			const obj = JSON.parse(raw)
			let changed = false
			if (obj.provider === 'openai') { obj.provider = 'openrouter'; changed = true }
			if (obj.base_url === 'https://api.openai.com/v1') { obj.base_url = 'https://openrouter.ai/api/v1'; changed = true }
			if (obj.env_key === 'OPENAI_API_KEY') { obj.env_key = 'OPENROUTER_API_KEY'; changed = true }
			if (changed) await fs.writeFile(cfgPath, JSON.stringify(obj, null, 2) + '\n', 'utf8')
		} catch {}
	}
	if (!(await fileExists(cfgPath))) {
		const cfg = defaultConfig()
		await fs.writeFile(cfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
	}
	return cfgPath
}

const readConfig = async (cfgPath) => {
	try {
		const raw = await fs.readFile(cfgPath, 'utf8')
		const parsed = JSON.parse(raw)
		// Merge defaults for any missing keys
		const d = defaultConfig()
		return {
			...d,
			...parsed,
			meta: { ...d.meta, ...parsed.meta },
			conversation: Array.isArray(parsed.conversation) ? parsed.conversation : d.conversation,
		}
	} catch (e) {
		// Backup invalid file and recreate
		try {
			const bak = cfgPath.replace(/config\.json$/, `config.json.bak-${Date.now()}`)
			await fs.copyFile(cfgPath, bak).catch(() => {})
		} catch {}
		const fresh = defaultConfig()
		await fs.writeFile(cfgPath, JSON.stringify(fresh, null, 2) + '\n', 'utf8')
		return fresh
	}
}

const writeConfigAtomic = async (cfgPath, obj) => {
	const tmp = cfgPath + '.tmp'
	await fs.writeFile(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8')
	await fs.rename(tmp, cfgPath)
}

const isoNow = () => new Date().toISOString()

const completionFetch = async ({ apiKey, body, baseUrl }) => {
	const url = `${String(baseUrl).replace(/\/+$/, '')}/chat/completions`
	const res = await fetch(url, {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			authorization: `Bearer ${apiKey}`,
			'HTTP-Referer': 'https://github.com/user/ai-cli',
			'X-Title': 'ai-cli',
		},
		body: JSON.stringify(body),
	})
	if (!res.ok || !res.body) {
		const text = await res.text().catch(() => '')
		throw new Error(`API error: ${res.status} ${res.statusText} ${text ? `- ${text}` : ''}`)
	}
	return res
}

// Robust SSE stream reader with line buffering across chunks
const streamAndAccumulate = async (readable, onDelta) => {
	const decoder = new TextDecoder()
	let buffer = ''
	let final = ''

	for await (const chunk of readable) {
		buffer += decoder.decode(chunk, { stream: true })
		let idx
		while ((idx = buffer.indexOf('\n')) !== -1) {
			const line = buffer.slice(0, idx)
			buffer = buffer.slice(idx + 1)
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
			} catch {}
		}
	}

	// Process any remaining buffered line
	const rest = buffer.trim()
	if (rest.startsWith('data:')) {
		const payload = rest.slice(5).trim()
		if (payload && payload !== '[DONE]') {
			try {
				const json = JSON.parse(payload)
				const delta = json?.choices?.[0]?.delta ?? {}
				const piece = typeof delta?.content === 'string' ? delta.content : ''
				if (piece) {
					onDelta(piece)
					final += piece
				}
			} catch {}
		}
	}

	return final
}

const buildMessages = ({ system, conversation, prompt }) => {
	const msgs = []
	if (system) {
		msgs.push({ role: 'system', content: system })
	}
	if (Array.isArray(conversation)) {
		for (const m of conversation) {
			if (m && typeof m.role === 'string' && typeof m.content === 'string') {
				msgs.push({ role: m.role, content: m.content })
			}
		}
	}
	msgs.push({ role: 'user', content: prompt })
	return msgs
}

const streamCompletion = async ({ apiKey, cfg, opts, prompt }, effectiveFormat) => {
	const body = {
		model: resolveModel(opts.model) ?? cfg.model,
		stream: opts.stream ?? cfg.stream_default,
		temperature: cfg.temperature,
		max_tokens: cfg.max_tokens,
		messages: buildMessages({
			system: opts.system ?? cfg.system,
			conversation: cfg.conversation,
			prompt,
		}),
	}

	const res = await completionFetch({
		apiKey,
		body: shapeRequestBody({ format: effectiveFormat, body }),
		baseUrl: cfg.base_url,
	})
	
	console.log(`\n${SGR.bold}${SGR.cyan}Response:${SGR.reset}\n`)

	let finalText = ''
	if (body.stream) {
		const renderer = new MarkdownRenderer({ tty: process.stdout.isTTY })
		finalText = await streamAndAccumulate(res.body, (piece) => {
			process.stdout.write(renderer.push(piece))
		})
		
		process.stdout.write(renderer.flush() + '\n\n')
	} else {
		const json = await res.json()
		const content = json?.choices?.[0]?.message?.content ?? ''
		process.stdout.write(content + '\n')
		finalText = content
	}

	return { finalText }
}

const promptSavePath = async ({ proposed }) => {
	// Only prompt if both stdout and stdin are TTY (interactive shell)
	/* Always prompt even if not TTY: fall back to default on failure */

	const rl = readline.createInterface({ input: rlIn, output: rlErr })
	let aborted = false
	const onSigint = () => {
		aborted = true
		try { rl.close() } catch {}
	}
	process.once('SIGINT', onSigint)

	try {
		const abs = path.resolve(process.cwd(), proposed)
		const answer = await rl.question(process.stdout.isTTY ? `${SGR.yellow}Save as ${SGR.yellow}[${SGR.reset}${abs}${SGR.yellow}]${SGR.reset}: ` : `Save as [${abs}]: `)
		await rl.close()
		process.removeListener('SIGINT', onSigint)
		if (aborted) {
			return null
		}
		return answer && answer.trim().length > 0 ? answer.trim() : proposed
	} catch {
		try { await rl.close() } catch {}
		process.removeListener('SIGINT', onSigint)
		return null
	}
}

const ensureParentDir = async (targetPath) => {
	const dir = path.dirname(targetPath)
	await fs.mkdir(dir, { recursive: true })
}

const confirmOverwriteIfExists = async (targetPath) => {
	if (!(await fileExists(targetPath))) {
		return true
	}
	// Only prompt on TTY; otherwise do not overwrite by default
	if (!(process.stdout.isTTY && process.stdin.isTTY)) {
		return false
	}
	const rl = readline.createInterface({ input: rlIn, output: rlErr })
	let ok = false
	try {
		const ans = await rl.question('File exists. Overwrite? (y/N): ')
		ok = String(ans).trim().toLowerCase() === 'y'
	} finally {
		try { await rl.close() } catch {}
	}
	return ok
}

const main = async () => {
	// Normalize high-level options (format/model) with our helper
	const __normalized = parseOptions(process.argv, { isTty: process.stdout.isTTY })

	try {
		const opts = parseArgs(process.argv)

		const root = await findProjectRoot(process.cwd())
		const cfgPath = await ensureConfig(root)
		let cfg = await readConfig(cfgPath)

		// Respect env key name in config
		const envKeyName = cfg.env_key || 'OPENAI_API_KEY'
		const apiKey = process.env[envKeyName]
		if (!apiKey) {
			console.error(`Missing ${envKeyName} in environment`)
			process.exit(3)
			return
		}

		// --models: list available models and exit
		if (opts.listModels) {
			const currentModel = cfg.model
			console.log(`\n${SGR.bold}Available models:${SGR.reset}\n`)
			for (const m of MODELS) {
				const marker = m.id === currentModel ? ` ${SGR.green}(current)${SGR.reset}` : ''
				console.log(`  ${SGR.cyan}${m.alias.padEnd(10)}${SGR.reset} ${SGR.dim}${m.id}${SGR.reset}  ${m.description}${marker}`)
			}
			if (currentModel && !MODELS.find((m) => m.id === currentModel)) {
				console.log(`\n  ${SGR.yellow}custom${SGR.reset}     ${SGR.dim}${currentModel}${SGR.reset} ${SGR.green}(current)${SGR.reset}`)
			}
			console.log()
			process.exit(0)
			return
		}

		let prompt = opts.prompt
		if (!prompt) {
			prompt = await readAllStdin()
		}

		if (!prompt) {
			console.error('Usage: ai "<prompt text>" [--model id] [--system text] [--no-stream] [--models]')
			process.exit(1)
			return
		}

		
		// Persist model/format if flags provided, and ensure defaults exist
		if (__normalized.model && __normalized.model.length > 0) {
			cfg.model = resolveModel(__normalized.model)
			await writeConfigAtomic(cfgPath, cfg)
		}
		if (__normalized.format) {
			cfg.meta = cfg.meta || {}
			cfg.meta.last_format = __normalized.format
			cfg.format = __normalized.format
			await writeConfigAtomic(cfgPath, cfg)
		}

		const effectiveFormat = (typeof cfg?.format === 'string' && cfg.format) || (typeof cfg?.meta?.last_format === 'string' && cfg.meta.last_format) || 'text'

		// console.log({effectiveFormat})
		// console.log({'cfg.format': cfg.format})
		// console.log({'cfg.meta.last_format': cfg.meta.last_format})

		const { finalText } = await streamCompletion({
			apiKey,
			cfg,
			opts,
			prompt,
		}, effectiveFormat)

		// Validate JSON in json format
		let validatedText = finalText
		if (effectiveFormat === 'json') {
			try {
				const parsed = JSON.parse(finalText)
				validatedText = JSON.stringify(parsed, null, 2)
			} catch (e) {
				// JSON invalid: we will save a partial sidecar after prompting for path
				validatedText = null
			}
		}

		// Update conversation + meta before computing default filename (turn = total_turns + 1)
		cfg = await readConfig(cfgPath) // re-read in case another process wrote
		cfg.conversation = Array.isArray(cfg.conversation) ? cfg.conversation : []
		cfg.conversation.push({ role: 'user', content: prompt, timestamp: isoNow() })
		cfg.conversation.push({ role: 'assistant', content: validatedText ?? finalText, timestamp: isoNow() })
		cfg.meta = cfg.meta || {}
		const nextTurn = Number(cfg.meta.total_turns || 0) + 1
		cfg.meta.total_turns = nextTurn
		cfg.meta.last_updated = isoNow()
		// await writeConfigAtomic(cfgPath, cfg)

		// Determine default filename and prompt user for save path (TTY-aware)
		const defaultName = (effectiveFormat === 'json') ? `conv-${nextTurn}.json` : `conv-${nextTurn}.md`
		let chosen = await promptSavePath({ proposed: defaultName })

		// If Ctrl-C or null → abort saving but keep streamed output
		if (chosen === null) {
			process.stderr.write(`${SGR.red}[Save canceled]${SGR.reset}\n`)
			process.stderr.write(`${SGR.magenta}[Context not written: ${SGR.reset}${cfgPath}${SGR.magenta}]${SGR.reset}\n`)
			process.exit(0)
			return
		}

		// Resolve to absolute path from CWD and create parents
		const targetPath = path.resolve(process.cwd(), chosen)
		await ensureParentDir(targetPath)

		// If exists, confirm overwrite
		if (!(await confirmOverwriteIfExists(targetPath))) {
			process.stderr.write(`${SGR.red}[Not saved: file exists]${SGR.reset}\n`)
			process.stderr.write(`${SGR.magenta}[Context not written: ${SGR.reset}${cfgPath}${SGR.magenta}]${SGR.reset}\n`)
			process.exit(0)
			return
		}

		// Write final text with newline
		await fs.writeFile(targetPath, finalText + '\n', 'utf8')
		await writeConfigAtomic(cfgPath, cfg)

		process.stderr.write(`
			${SGR.green}[Saved final output to: ${SGR.reset}${targetPath}${SGR.green}]${SGR.reset}
		`)

		process.stderr.write(
			`${SGR.cyan}[Updated context: ${SGR.reset}${cfgPath}${SGR.cyan}]${SGR.reset}
		`)

		console.log()
		process.exit(0)
	} catch (e) {
		console.error(e)
		process.exit(3)
	}
}

;(async () => {
	try {
		await main()
	} catch (err) {
		console.error(err?.stack || err)
		process.exitCode = 1
	}
})()