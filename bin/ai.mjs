#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import * as readline from 'node:readline/promises'
import readline_raw from 'node:readline'
import { stdin as rlIn, stderr as rlErr } from 'node:process'
import { MarkdownRenderer } from '../lib/markdown-renderer.mjs'
import { parseOptions } from '../lib/options.mjs'
import { shapeRequestBody } from '../lib/response-shape.mjs'

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
	{ alias: 'flash3', id: 'google/gemini-3-flash-preview', description: 'Gemini 3 Flash (preview)' },
	{ alias: 'pro3', id: 'google/gemini-3-pro-preview', description: 'Gemini 3 Pro (preview)' },
	{ alias: 'gemma', id: 'google/gemma-3-27b-it', description: 'Google Gemma 3 27B' },
	{ alias: 'gemma4b', id: 'google/gemma-3-4b-it', description: 'Google Gemma 3 4B (tiny)' },
	{ alias: 'llama', id: 'meta-llama/llama-3.3-70b-instruct', description: 'Meta Llama 3.3 70B' },
	{ alias: 'llama8b', id: 'meta-llama/llama-3.1-8b-instruct', description: 'Meta Llama 3.1 8B (tiny)' },
	{ alias: 'qwen7b', id: 'qwen/qwen-2.5-7b-instruct', description: 'Qwen 2.5 7B (tiny)' },
	{ alias: 'qwenvl', id: 'qwen/qwen-2.5-vl-7b-instruct', description: 'Qwen 2.5 VL 7B (vision, charts)' },
	{ alias: 'phi', id: 'microsoft/phi-3.5-mini-128k-instruct', description: 'Microsoft Phi 3.5 Mini (tiny)' },
	{ alias: 'mistral', id: 'mistralai/mistral-small-3.2-24b-instruct-2506', description: 'Mistral Small 3.2' },
	{ alias: 'deepseek', id: 'deepseek/deepseek-v3.2-20251201', description: 'DeepSeek V3.2' },
	{ alias: 'kimi', id: 'moonshotai/kimi-k2.5', description: 'Moonshot Kimi K2.5' },
	{ alias: 'grok', id: 'x-ai/grok-4', description: 'xAI Grok 4 (thinking)' },
	{ alias: 'grokcode', id: 'x-ai/grok-code-fast-1', description: 'xAI Grok Code Fast' },
	{ alias: 'haiku', id: 'anthropic/claude-haiku-4.5', description: 'Claude Haiku 4.5 (fast)' },
	{ alias: 'sonnet', id: 'anthropic/claude-sonnet-4.6', description: 'Claude Sonnet 4.6' },
	{ alias: 'opus', id: 'anthropic/claude-opus-4.6', description: 'Claude Opus 4.6' },
	{ alias: 'image', id: 'google/gemini-2.5-flash-image', description: 'Nano Banana — image gen', image: true },
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
		files: [],
		listModels: false,
		continueConv: false,
		codeOnly: false,
		debug: false,
		init: false,
	}

	const args = argv.slice(2)
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i]

		// First non-flag token becomes the prompt; subsequent ones are file candidates
		if (!arg.startsWith('--') && opts.prompt === undefined) {
			opts.prompt = arg
			continue
		}
		if (!arg.startsWith('--') && opts.prompt !== undefined) {
			opts.files.push(arg)
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
		if (arg === '--continue') {
			opts.continueConv = true
			continue
		}
		if (arg === '--code') {
			opts.codeOnly = true
			continue
		}
		if (arg === '--debug') {
			opts.debug = true
			continue
		}
		if (arg === '--init') {
			opts.init = true
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
	const cwd = path.resolve(startDir)
	// Check current directory for .ai/config.json first
	const localCfg = path.join(cwd, '.ai', 'config.json')
	if (await fileExists(localCfg)) {
		return cwd
	}
	// Walk up to nearest package.json
	let dir = cwd
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
	// Fallback: use current working directory
	return cwd
}

const findParentConfig = async (startDir) => {
	let dir = path.resolve(startDir)
	// Skip current directory — we want the parent
	dir = path.dirname(dir)
	while (true) {
		const cfg = path.join(dir, '.ai', 'config.json')
		if (await fileExists(cfg)) {
			return cfg
		}
		const pkg = path.join(dir, 'package.json')
		if (await fileExists(pkg)) {
			const pkgCfg = path.join(dir, '.ai', 'config.json')
			// Found a project root — return its config path (may not exist yet)
			return await fileExists(pkgCfg) ? pkgCfg : null
		}
		const parent = path.dirname(dir)
		if (parent === dir) {
			break
		}
		dir = parent
	}
	return null
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

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'])

const isImageExt = (ext) => IMAGE_EXTS.has(ext.toLowerCase())

const getMimeType = (ext) => {
	const map = {
		'.png': 'image/png',
		'.jpg': 'image/jpeg',
		'.jpeg': 'image/jpeg',
		'.gif': 'image/gif',
		'.webp': 'image/webp',
		'.bmp': 'image/bmp',
		'.svg': 'image/svg+xml',
	}
	return map[ext.toLowerCase()] || 'application/octet-stream'
}

const formatFileSize = (bytes) => {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const resolveAttachments = async (paths) => {
	const results = []
	for (const p of paths) {
		const abs = path.resolve(p)
		try {
			await fs.access(abs)
			const stat = await fs.stat(abs)
			if (!stat.isFile()) {
				process.stderr.write(`${SGR.yellow}[Warning: not a file: ${abs}]${SGR.reset}\n`)
				continue
			}
			const ext = path.extname(abs).toLowerCase()
			results.push({
				path: abs,
				name: path.basename(abs),
				size: stat.size,
				type: isImageExt(ext) ? 'image' : 'text',
			})
		} catch {
			process.stderr.write(`${SGR.yellow}[Warning: file not found: ${p}]${SGR.reset}\n`)
		}
	}
	return results
}

const displayAttachments = (attachments, width) => {
	if (!attachments.length) return
	const parts = attachments.map((a) => {
		const url = `file://${a.path}`
		// OSC8 hyperlink: \x1b]8;;URL\x1b\\label\x1b]8;;\x1b\\
		const link = `\x1b]8;;${url}\x1b\\${SGR.bold}${SGR.cyan}${a.name}${SGR.reset}\x1b]8;;\x1b\\`
		return `${link} ${SGR.dim}(${formatFileSize(a.size)})${SGR.reset}`
	})
	process.stderr.write(`${SGR.dim}Attached:${SGR.reset} ${parts.join(` ${SGR.dim}\u00b7${SGR.reset} `)}\n`)
}

const extractFilePaths = async (input) => {
	// Split respecting quotes and backslash-escaped spaces
	const tokens = []
	let current = ''
	let inSingle = false
	let inDouble = false
	let escaped = false

	for (const ch of input) {
		if (escaped) {
			current += ch
			escaped = false
			continue
		}
		if (ch === '\\') {
			escaped = true
			continue
		}
		if (ch === "'" && !inDouble) {
			inSingle = !inSingle
			continue
		}
		if (ch === '"' && !inSingle) {
			inDouble = !inDouble
			continue
		}
		if ((ch === ' ' || ch === '\t') && !inSingle && !inDouble) {
			if (current.length) {
				tokens.push(current)
				current = ''
			}
			continue
		}
		current += ch
	}
	if (current.length) tokens.push(current)

	const paths = []
	const textParts = []

	for (const token of tokens) {
		const expanded = token.startsWith('~/')
			? path.join(process.env.HOME || '', token.slice(2))
			: token
		if (/^(\/|\.\/|\.\.\/)/.test(expanded) || token.startsWith('~/')) {
			const abs = path.resolve(expanded)
			try {
				await fs.access(abs)
				const stat = await fs.stat(abs)
				if (stat.isFile()) {
					paths.push(abs)
					continue
				}
			} catch {}
		}
		textParts.push(token)
	}

	const text = textParts.join(' ') || (paths.length ? 'Describe the attached files' : '')
	return { text, paths }
}

const buildMultimodalContent = async (text, attachments) => {
	const content = []
	for (const a of attachments) {
		if (a.type === 'image') {
			const data = await fs.readFile(a.path)
			const b64 = data.toString('base64')
			const ext = path.extname(a.path).toLowerCase()
			const mime = getMimeType(ext)
			content.push({
				type: 'image_url',
				image_url: { url: `data:${mime};base64,${b64}` },
			})
		} else {
			try {
				const fileContent = await fs.readFile(a.path, 'utf8')
				content.push({
					type: 'text',
					text: `File: ${a.name}\n\`\`\`\n${fileContent}\n\`\`\``,
				})
			} catch {
				process.stderr.write(`${SGR.yellow}[Warning: could not read ${a.path}]${SGR.reset}\n`)
			}
		}
	}
	content.push({ type: 'text', text })
	return content
}

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

const buildMessages = async ({ system, conversation, prompt, attachments }) => {
	const msgs = []
	if (system) {
		msgs.push({ role: 'system', content: system })
	}
	if (Array.isArray(conversation)) {
		for (const m of conversation) {
			if (!m || typeof m.role !== 'string') continue
			if (m.attachments?.length) {
				// Re-resolve stored attachment paths
				const resolved = await resolveAttachments(m.attachments)
				if (resolved.length) {
					msgs.push({ role: m.role, content: await buildMultimodalContent(m.content, resolved) })
				} else {
					if (typeof m.content === 'string') msgs.push({ role: m.role, content: m.content })
				}
			} else if (typeof m.content === 'string') {
				msgs.push({ role: m.role, content: m.content })
			}
		}
	}
	if (attachments?.length) {
		msgs.push({ role: 'user', content: await buildMultimodalContent(prompt, attachments) })
	} else {
		msgs.push({ role: 'user', content: prompt })
	}
	return msgs
}

const streamCompletion = async ({ apiKey, cfg, opts, prompt, attachments }, effectiveFormat) => {
	const resolvedModel = resolveModel(opts.model) ?? cfg.model
	const modelEntry = MODELS.find((m) => m.id === resolvedModel)
	const isImageModel = Boolean(modelEntry?.image)

	const body = {
		model: resolvedModel,
		stream: isImageModel ? false : (opts.stream ?? cfg.stream_default),
		temperature: cfg.temperature,
		max_tokens: cfg.max_tokens,
		messages: await buildMessages({
			system: opts.system ?? cfg.system,
			conversation: cfg.conversation,
			prompt,
			attachments,
		}),
	}

	if (isImageModel) {
		body.modalities = ['image', 'text']
	}

	const shaped = shapeRequestBody({ format: effectiveFormat, body })
	if (opts.debug) {
		process.stderr.write(`${SGR.dim}[DEBUG request] ${JSON.stringify(shaped, null, 2)}${SGR.reset}\n`)
	}

	const res = await completionFetch({
		apiKey,
		body: shaped,
		baseUrl: cfg.base_url,
	})

	console.log(`\n${SGR.bold}${SGR.cyan}Response:${SGR.reset}\n`)

	let finalText = ''
	let images = []
	if (body.stream) {
		const renderer = new MarkdownRenderer({ tty: process.stdout.isTTY })
		finalText = await streamAndAccumulate(res.body, (piece) => {
			process.stdout.write(renderer.push(piece))
		})

		process.stdout.write(renderer.flush() + '\n\n')
	} else {
		const json = await res.json()
		if (opts.debug) {
			// Truncate base64 data for readability
			const debugJson = JSON.stringify(json, (k, v) => {
				if (typeof v === 'string' && v.startsWith('data:image/')) return v.slice(0, 60) + '...[truncated]'
				return v
			}, 2)
			process.stderr.write(`${SGR.dim}[DEBUG response] ${debugJson}${SGR.reset}\n`)
		}
		const msg = json?.choices?.[0]?.message ?? {}
		const content = msg.content ?? ''

		// Handle multipart content (image models may return array)
		if (Array.isArray(content)) {
			const textParts = []
			for (const part of content) {
				if (part.type === 'text') {
					textParts.push(part.text)
				} else if (part.type === 'image_url') {
					images.push(part.image_url?.url)
				}
			}
			finalText = textParts.join('\n')
		} else {
			finalText = content
		}

		// Images may also arrive in a separate msg.images array
		if (Array.isArray(msg.images)) {
			for (const img of msg.images) {
				if (img.type === 'image_url' && img.image_url?.url) {
					images.push(img.image_url.url)
				}
			}
		}

		if (finalText) {
			process.stdout.write(finalText + '\n')
		}
	}

	// Display any images from the response
	for (const dataUrl of images) {
		if (!dataUrl) continue
		const m = dataUrl.match(/^data:image\/([\w+]+);base64,(.+)$/)
		if (!m) continue
		const ext = m[1] === 'jpeg' ? 'jpg' : m[1]
		const b64 = m[2]
		if (isITerm2()) {
			displayITermImage(b64, `image.${ext}`)
		} else {
			const imgPath = path.resolve(process.cwd(), `image-${Date.now()}.${ext}`)
			await fs.writeFile(imgPath, Buffer.from(b64, 'base64'))
			process.stderr.write(`${SGR.green}[Image saved: ${SGR.reset}${imgPath}${SGR.green}]${SGR.reset}\n`)
		}
	}

	return { finalText, images }
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

const interactivePrompt = () => new Promise((resolve) => {
	process.stderr.write(`\n${SGR.dim}Type to continue${SGR.reset} ${SGR.yellow}|${SGR.reset} ${SGR.dim}Esc: save response${SGR.reset} ${SGR.yellow}|${SGR.reset} ${SGR.dim}Ctrl+S: save transcript${SGR.reset}\n`)
	process.stderr.write(`${SGR.green}> ${SGR.reset}`)

	let buf = ''
	let pasting = false
	readline_raw.emitKeypressEvents(process.stdin)
	const wasRaw = process.stdin.isRaw
	if (process.stdin.isTTY) process.stdin.setRawMode(true)

	// Enable bracketed paste mode so multi-file drag-and-drop works
	process.stderr.write('\x1b[?2004h')

	const cleanup = () => {
		process.stderr.write('\x1b[?2004l')
		process.stdin.removeListener('keypress', onKey)
		process.stdin.removeListener('data', onData)
		if (process.stdin.isTTY) process.stdin.setRawMode(wasRaw)
	}

	// Raw data listener to detect bracketed paste sequences
	const onData = (data) => {
		const s = typeof data === 'string' ? data : data.toString()
		if (s.includes('\x1b[200~')) pasting = true
		if (s.includes('\x1b[201~')) pasting = false
	}

	const onKey = (str, key) => {
		if (!key) return

		// Ctrl+C
		if (key.ctrl && key.name === 'c') {
			cleanup()
			process.stderr.write('\n')
			resolve({ action: 'cancel' })
			return
		}

		// Escape — ignore during paste (terminals may send escape sequences)
		if (key.name === 'escape' && !pasting) {
			cleanup()
			process.stderr.write('\n')
			resolve({ action: 'save_response' })
			return
		}

		// Ctrl+S
		if (key.ctrl && key.name === 's') {
			cleanup()
			process.stderr.write('\n')
			resolve({ action: 'save_transcript' })
			return
		}

		// Enter — during paste, treat as space separator; otherwise submit
		if (key.name === 'return') {
			if (pasting) {
				buf += ' '
				process.stderr.write(' ')
				return
			}
			if (buf.trim().length > 0) {
				cleanup()
				process.stderr.write('\n')
				resolve({ action: 'continue', text: buf.trim() })
			}
			return
		}

		// Backspace
		if (key.name === 'backspace') {
			if (buf.length > 0) {
				buf = buf.slice(0, -1)
				process.stderr.write('\b \b')
			}
			return
		}

		// Printable characters
		if (str && !key.ctrl && !key.meta) {
			buf += str
			process.stderr.write(str)
		}
	}

	process.stdin.on('data', onData)
	process.stdin.on('keypress', onKey)
})

const extractCode = (markdown) => {
	const blocks = []
	const re = /^```(\w+)?\s*\n([\s\S]*?)\n```$/gm
	let match
	while ((match = re.exec(markdown)) !== null) {
		blocks.push({ lang: match[1] || '', code: match[2] })
	}
	return blocks
}

const langToExt = (lang) => {
	const map = {
		js: '.js',
		javascript: '.js',
		mjs: '.mjs',
		ts: '.ts',
		typescript: '.ts',
		python: '.py',
		py: '.py',
		go: '.go',
		rust: '.rs',
		rs: '.rs',
		sh: '.sh',
		bash: '.sh',
		zsh: '.sh',
		ruby: '.rb',
		rb: '.rb',
		java: '.java',
		c: '.c',
		cpp: '.cpp',
		'c++': '.cpp',
		css: '.css',
		html: '.html',
		json: '.json',
		yaml: '.yaml',
		yml: '.yaml',
		toml: '.toml',
		sql: '.sql',
		swift: '.swift',
		kotlin: '.kt',
		kt: '.kt',
		php: '.php',
		lua: '.lua',
		r: '.r',
	}
	return map[lang.toLowerCase()] || '.txt'
}

const formatTranscript = (conversation) => {
	const parts = []
	for (const msg of conversation) {
		const role = msg.role === 'user' ? 'User' : 'Assistant'
		parts.push(`## ${role}\n\n${msg.content}`)
	}
	return parts.join('\n\n')
}

const isITerm2 = () => process.env.TERM_PROGRAM === 'iTerm.app'

const displayITermImage = (base64Data, filename = 'image.png') => {
	const name64 = Buffer.from(filename).toString('base64')
	process.stdout.write(`\x1b]1337;File=name=${name64};inline=1:${base64Data}\x07\n`)
}

const main = async () => {
	// Normalize high-level options (format/model) with our helper
	const __normalized = parseOptions(process.argv, { isTty: process.stdout.isTTY })

	try {
		const opts = parseArgs(process.argv)

		// --init: create a local .ai/config.json inheriting from parent
		if (opts.init) {
			const cwd = path.resolve(process.cwd())
			const localCfgPath = path.join(cwd, '.ai', 'config.json')
			if (await fileExists(localCfgPath)) {
				process.stderr.write(`${SGR.yellow}[Already exists: ${SGR.reset}${localCfgPath}${SGR.yellow}]${SGR.reset}\n`)
				process.exit(0)
				return
			}
			const parentCfgPath = await findParentConfig(cwd)
			let cfg
			if (parentCfgPath) {
				cfg = await readConfig(parentCfgPath)
				cfg.conversation = []
				cfg.meta = { ...cfg.meta, total_turns: 0, last_updated: null }
				process.stderr.write(`${SGR.dim}[Inherited from: ${parentCfgPath}]${SGR.reset}\n`)
			} else {
				cfg = defaultConfig()
			}
			await fs.mkdir(path.join(cwd, '.ai'), { recursive: true })
			await fs.writeFile(localCfgPath, JSON.stringify(cfg, null, 2) + '\n', 'utf8')
			process.stderr.write(`${SGR.green}[Created: ${SGR.reset}${localCfgPath}${SGR.green}]${SGR.reset}\n`)
			process.exit(0)
			return
		}

		const root = await findProjectRoot(process.cwd())
		const cfgPath = await ensureConfig(root)
		let cfg = await readConfig(cfgPath)

		// --models: list available models and exit (no API key needed)
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

		// Respect env key name in config
		const envKeyName = cfg.env_key || 'OPENAI_API_KEY'
		const apiKey = process.env[envKeyName]
		if (!apiKey) {
			console.error(`Missing ${envKeyName} in environment`)
			process.exit(3)
			return
		}

		let prompt = opts.prompt
		if (!prompt) {
			prompt = await readAllStdin()
		}

		// Resolve file attachments from CLI args
		let currentAttachments = opts.files.length ? await resolveAttachments(opts.files) : []

		// If no prompt but files were provided, use a default prompt
		if (!prompt && currentAttachments.length) {
			prompt = 'Describe the attached files'
		}

		if (!prompt) {
			console.error('Usage: ai "<prompt>" [file ...] [--model id] [--system text] [--no-stream] [--models] [--continue] [--code] [--init]')
			process.exit(1)
			return
		}

		if (currentAttachments.length) {
			displayAttachments(currentAttachments, process.stderr.columns || 80)
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

		const effectiveFormat = __normalized.provided.format
			? __normalized.format
			: 'text'

		// Clear conversation unless --continue
		if (!opts.continueConv && !__normalized.continueConv) {
			cfg.conversation = []
		}

		let lastFinalText = ''
		let lastImages = []

		while (true) {
			const { finalText, images } = await streamCompletion({
				apiKey,
				cfg,
				opts,
				prompt,
				attachments: currentAttachments,
			}, effectiveFormat)

			lastFinalText = finalText
			lastImages = images || []

			// Validate JSON in json format
			let validatedText = finalText
			if (effectiveFormat === 'json') {
				try {
					const parsed = JSON.parse(finalText)
					validatedText = JSON.stringify(parsed, null, 2)
				} catch {
					validatedText = null
				}
			}

			// Append to conversation
			cfg.conversation = Array.isArray(cfg.conversation) ? cfg.conversation : []
			const userMsg = { role: 'user', content: prompt, timestamp: isoNow() }
			if (currentAttachments?.length) {
				userMsg.attachments = currentAttachments.map((a) => a.path)
			}
			cfg.conversation.push(userMsg)
			cfg.conversation.push({ role: 'assistant', content: validatedText ?? finalText, timestamp: isoNow() })
			cfg.meta = cfg.meta || {}
			cfg.meta.total_turns = Number(cfg.meta.total_turns || 0) + 1
			cfg.meta.last_updated = isoNow()

			// Non-TTY: auto-save response to default path and exit
			if (!process.stdin.isTTY) {
				const nextTurn = cfg.meta.total_turns
				const defaultName = (effectiveFormat === 'json') ? `conv-${nextTurn}.json` : `conv-${nextTurn}.md`
				const targetPath = path.resolve(process.cwd(), defaultName)
				await ensureParentDir(targetPath)
				await fs.writeFile(targetPath, finalText + '\n', 'utf8')
				await writeConfigAtomic(cfgPath, cfg)
				process.stderr.write(`${SGR.green}[Saved: ${SGR.reset}${targetPath}${SGR.green}]${SGR.reset}\n`)
				break
			}

			const result = await interactivePrompt()

			if (result.action === 'continue') {
				const extracted = await extractFilePaths(result.text)
				if (extracted.paths.length) {
					currentAttachments = await resolveAttachments(extracted.paths)
					if (currentAttachments.length) {
						displayAttachments(currentAttachments, process.stderr.columns || 80)
					}
					prompt = extracted.text
				} else {
					currentAttachments = []
					prompt = result.text
				}
				continue
			}

			if (result.action === 'save_response') {
				// If response has images, save the image(s) instead of text
				if (lastImages.length > 0) {
					const defaultName = lastImages.length === 1 ? 'image.png' : 'image-1.png'
					const chosen = await promptSavePath({ proposed: defaultName })
					if (chosen === null) {
						process.stderr.write(`${SGR.red}[Save canceled]${SGR.reset}\n`)
					} else {
						for (let idx = 0; idx < lastImages.length; idx++) {
							const dataUrl = lastImages[idx]
							const m = dataUrl.match(/^data:image\/([\w+]+);base64,(.+)$/)
							if (!m) continue
							const b64 = m[2]
							let savePath = chosen
							if (lastImages.length > 1) {
								const ext = path.extname(chosen)
								const base = chosen.replace(ext, '')
								savePath = `${base}-${idx + 1}${ext || '.png'}`
							}
							const targetPath = path.resolve(process.cwd(), savePath)
							await ensureParentDir(targetPath)
							if (await confirmOverwriteIfExists(targetPath)) {
								await fs.writeFile(targetPath, Buffer.from(b64, 'base64'))
								process.stderr.write(`${SGR.green}[Saved image: ${SGR.reset}${targetPath}${SGR.green}]${SGR.reset}\n`)
							} else {
								process.stderr.write(`${SGR.red}[Not saved: file exists]${SGR.reset}\n`)
							}
						}
					}
				} else {
					let saveContent = lastFinalText
					let defaultName

					if (opts.codeOnly || __normalized.codeOnly) {
						const blocks = extractCode(lastFinalText)
						if (blocks.length > 0) {
							saveContent = blocks.map((b) => b.code).join('\n\n')
							const ext = langToExt(blocks[0].lang)
							defaultName = `code${ext}`
						} else {
							defaultName = `conv-${cfg.meta.total_turns}.md`
						}
					} else {
						defaultName = (effectiveFormat === 'json') ? `conv-${cfg.meta.total_turns}.json` : `conv-${cfg.meta.total_turns}.md`
					}

					const chosen = await promptSavePath({ proposed: defaultName })
					if (chosen === null) {
						process.stderr.write(`${SGR.red}[Save canceled]${SGR.reset}\n`)
					} else {
						const targetPath = path.resolve(process.cwd(), chosen)
						await ensureParentDir(targetPath)
						if (await confirmOverwriteIfExists(targetPath)) {
							await fs.writeFile(targetPath, saveContent + '\n', 'utf8')
							process.stderr.write(`${SGR.green}[Saved: ${SGR.reset}${targetPath}${SGR.green}]${SGR.reset}\n`)
						} else {
							process.stderr.write(`${SGR.red}[Not saved: file exists]${SGR.reset}\n`)
						}
					}
				}
				break
			}

			if (result.action === 'save_transcript') {
				const transcript = formatTranscript(cfg.conversation)
				const defaultName = `transcript-${cfg.meta.total_turns}.md`
				const chosen = await promptSavePath({ proposed: defaultName })
				if (chosen === null) {
					process.stderr.write(`${SGR.red}[Save canceled]${SGR.reset}\n`)
				} else {
					const targetPath = path.resolve(process.cwd(), chosen)
					await ensureParentDir(targetPath)
					if (await confirmOverwriteIfExists(targetPath)) {
						await fs.writeFile(targetPath, transcript + '\n', 'utf8')
						process.stderr.write(`${SGR.green}[Saved transcript: ${SGR.reset}${targetPath}${SGR.green}]${SGR.reset}\n`)
					} else {
						process.stderr.write(`${SGR.red}[Not saved: file exists]${SGR.reset}\n`)
					}
				}
				break
			}

			if (result.action === 'cancel') {
				break
			}
		}

		// Always persist conversation
		await writeConfigAtomic(cfgPath, cfg)
		process.stderr.write(`${SGR.cyan}[Context saved: ${SGR.reset}${cfgPath}${SGR.cyan}]${SGR.reset}\n`)
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