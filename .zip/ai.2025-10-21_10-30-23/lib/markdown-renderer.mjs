import process from 'node:process'
import { highlight } from 'cli-highlight'

const ESC = '\x1b['

const stripAnsi = (s) => s.replace(/\x1B\[[0-?]*[ -\/]*[@-~]/g, '')

const countRows = (text, width) => {
	const lines = String(text).split('\n')
	let rows = 0
	for (const line of lines) {
		const clean = stripAnsi(line)
		const len = clean.length === 0 ? 1 : clean.length
		rows += Math.max(1, Math.ceil(len / Math.max(1, width)))
	}
	return rows
}

export class MarkdownRenderer {
	constructor({ tty, raw, noColor, width }) {
		this.tty = Boolean(tty)
		this.raw = Boolean(raw)
		this.noColor = Boolean(noColor)
		this.width = Number(width || process.stdout?.columns || 80)
		this.buffer = ''
		this.mode = 'normal'
		this.fence = null // { lang, startRow, lines: [] }
		this.rowsPrinted = 0
	}

	reset = () => {
		this.buffer = ''
		this.mode = 'normal'
		this.fence = null
		this.rowsPrinted = 0
	}

	push = (chunk) => {
		const text = String(chunk)
		if (!this.tty || this.raw || this.noColor) {
			this.rowsPrinted += countRows(text, this.width)
			return text
		}
		this.buffer += text
		let out = ''
		let idx
		while ((idx = this.buffer.indexOf('\n')) !== -1) {
			const line = this.buffer.slice(0, idx)
			this.buffer = this.buffer.slice(idx + 1)
			out += this.#processLine(line) + '\n'
		}
		return out
	}

	flush = () => {
		let out = ''
		if (this.buffer.length > 0) {
			out += this.#processLine(this.buffer)
			this.buffer = ''
		}
		return out
	}

	#processLine = (line) => {
		const fenceOpen = line.match(/^```(\w+)?\s*$/)
		const fenceClose = line.match(/^```\s*$/)

		if (this.mode === 'normal') {
			if (fenceOpen) {
				this.mode = 'fence'
				this.fence = {
					lang: fenceOpen[1] || '',
					startRow: this.rowsPrinted,
					lines: ['```' + (fenceOpen[1] || '')],
				}
				this.rowsPrinted += countRows(line, this.width)
				return line
			}
			this.rowsPrinted += countRows(line, this.width)
			return line
		}

		if (fenceClose) {
			this.fence.lines.push('```')
			let out = '```'
			this.rowsPrinted += countRows(line, this.width)
			const repaintSeq = this.#repaintFence()
			this.mode = 'normal'
			this.fence = null
			return out + '\n' + repaintSeq
		}

		this.fence.lines.push(line)
		this.rowsPrinted += countRows(line, this.width)
		return line
	}

	#repaintFence = () => {
		if (!this.fence) return ''
		const { lang, startRow, lines } = this.fence
		const prevRows = countRows(lines.join('\n') + '\n', this.width)

		const bodyLines = lines.slice(1, -1)
		const body = bodyLines.join('\n')

		let highlighted = body
		if (lang) {
			try {
				highlighted = highlight(body, { language: lang, ignoreIllegals: true })
			} catch {
				highlighted = body
			}
		}

		const rebuilt = ['```' + (lang || ''), highlighted, '```'].join('\n') + '\n'
		const newRows = countRows(rebuilt, this.width)

		const toMoveUp = this.rowsPrinted - startRow
		const moveUp = toMoveUp > 0 ? `${ESC}${toMoveUp}A` : ''
		const clearDown = `${ESC}J`
		const repaint = moveUp + clearDown + rebuilt

		this.rowsPrinted = startRow + newRows
		return repaint
	}
}
