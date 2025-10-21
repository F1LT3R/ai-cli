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

// ---------- styling helpers ----------
const SGR = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	italic: '\x1b[3m',
	underline: '\x1b[4m',
	strike: '\x1b[9m',
}

const fg256 = (n) => `\x1b[38;5;${Number(n)}m`
const bg256 = (n) => `\x1b[48;5;${Number(n)}m`

// cyan/azure family for headings
const headingHue = (level) => {
	const palette = [51, 50, 45, 44, 37, 36]
	const idx = Math.min(Math.max(level, 1), 6) - 1
	return fg256(palette[idx])
}

const osc8Link = ({ url, visible }) => {
	const open = `\x1b]8;;${String(url)}\x1b\\`
	const close = `\x1b]8;;\x1b\\`
	return `${open}${visible}${close}`
}

const maskInlineCode = (line) => {
	const map = []
	let masked = ''
	let i = 0
	while (i < line.length) {
		if (line[i] === '`') {
			let j = i + 1
			while (j < line.length && line[j] !== '`') j++
			if (j < line.length && line[j] === '`') {
				const content = line.slice(i, j + 1)
				const token = `\u0000CODE_${map.length}\u0000`
				map.push(content)
				masked += token
				i = j + 1
				continue
			}
		}
		masked += line[i]
		i++
	}
	return { masked, map }
}

const unmaskInlineCodeWithStyle = ({ line, map, tty, noColor }) => {
	if (!map.length) return line
	const bg = bg256(236)
	const fg = fg256(252)
	return line.replace(/\u0000CODE_(\d+)\u0000/g, (_, idx) => {
		const raw = map[Number(idx)] ?? ''
		if (!tty || noColor) return raw
		return `${bg}${fg}${raw}${SGR.reset}`
	})
}
const styleInline = ({ text, tty, noColor }) => {
	if (!tty || noColor) return text
	const { masked, map } = maskInlineCode(text)
	let out = masked
	// emphasis
	out = out.replace(/\*\*([^\*]+?)\*\*/gu, (_m, inner) => `${SGR.bold}${inner}${SGR.reset}`)
	out = out.replace(/(?:^|[^\\])\*([^\*]+?)\*/gu, (m, inner) => {
		const lead = m.startsWith('*') ? '' : m[0]
		return `${lead}${SGR.italic}${inner}${SGR.reset}`
	})
	out = out.replace(/~~([^~]+?)~~/gu, (_m, inner) => `${SGR.strike}${inner}${SGR.reset}`)
	// links
	out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/gu, (_m, label, url) => {
		const blue = fg256(33)
		const visible = `${SGR.underline}${blue}${url}${SGR.reset}`
		const clickable = osc8Link({ url, visible })
		return `[${label}](${clickable})`
	})
	out = out.replace(/<([a-zA-Z][a-zA-Z0-9+.-]*):\/\/[^>]+>/gu, (m) => {
		const url = m.slice(1, -1)
		const blue = fg256(33)
		const visible = `${SGR.underline}${blue}${url}${SGR.reset}`
		return `<${osc8Link({ url, visible })}>`
	})
	out = unmaskInlineCodeWithStyle({ line: out, map, tty, noColor })
	return out
}


const styleLineNormal = ({ line, tty, noColor, width }) => {
	if (!tty || noColor) return line

	// hr fill
	const hrMatch = line.trim().match(/^(?:-{3,}|\*{3,}|_{3,})$/)
	if (hrMatch) {
		const visible = line.replace(/\s+$/u, '')
		const len = stripAnsi(visible).length
		const pad = Math.max(0, (Number(width) || 80) - len)
		const fill = pad > 0 ? bg256(236) + ' '.repeat(pad) + SGR.reset : ''
		return visible + fill
	}

	const { masked, map } = maskInlineCode(line)
	let out = masked

	// headings
	out = out.replace(/^(#{1,6})\s+(.*)$/u, (_m, hashes, text) => {
		const level = hashes.length
		const color = headingHue(level)
		const deco = level === 1 ? SGR.bold + SGR.underline : level === 2 ? SGR.bold : ''
		const tone = level >= 4 ? fg256(244) : ''
		return `${color}${deco}${tone}${hashes} ${text}${SGR.reset}`
	})

	// blockquotes
	out = out.replace(/^>\s+(.*)$/u, (_m, text) => `>${SGR.italic}${fg256(244)} ${text}${SGR.reset}`)

	// emphasis
	out = out.replace(/\*\*([^\*]+?)\*\*/gu, (_m, inner) => `${SGR.bold}${inner}${SGR.reset}`)
	out = out.replace(/(?:^|[^\\])\*([^\*]+?)\*/gu, (m, inner) => {
		const lead = m.startsWith('*') ? '' : m[0]
		return `${lead}${SGR.italic}${inner}${SGR.reset}`
	})
	out = out.replace(/~~([^~]+?)~~/gu, (_m, inner) => `${SGR.strike}${inner}${SGR.reset}`)

	// links
	out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/gu, (_m, label, url) => {
		const blue = fg256(33)
		const visible = `${SGR.underline}${blue}${url}${SGR.reset}`
		const clickable = osc8Link({ url, visible })
		return `[${label}](${clickable})`
	})
	out = out.replace(/<([a-zA-Z][a-zA-Z0-9+.-]*):\/\/[^>]+>/gu, (m) => {
		const url = m.slice(1, -1)
		const blue = fg256(33)
		const visible = `${SGR.underline}${blue}${url}${SGR.reset}`
		return `<${osc8Link({ url, visible })}>`
	})

	out = unmaskInlineCodeWithStyle({ line: out, map, tty, noColor })

	return out
}

// ---------- table helpers (truncated alignment) ----------
const parseTableRow = (line) => {
	if (!/\|/.test(line)) return null
	const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
	const cells = inner.split('|').map((s) => s.trim())
	return cells
}

const parseAlignRow = (line) => {
	if (!/\|/.test(line)) return null
	const inner = line.trim().replace(/^\|/, '').replace(/\|$/, '')
	const parts = inner.split('|').map((s) => s.trim())
	if (!parts.every((p) => /^:?-{3,}:?$/.test(p))) return null
	return parts.map((p) => p.startsWith(':') && p.endsWith(':') ? 'center' : p.endsWith(':') ? 'right' : 'left')
}

const displayWidth = (s) => stripAnsi(String(s)).length

const sliceDisplay = (s, max) => {
	const clean = String(s)
	const plain = stripAnsi(clean)
	if (plain.length <= max) return clean
	const keep = Math.max(0, max - 1)
	return plain.slice(0, keep) + '…'
}

const formatCell = ({ text, width, align }) => {
	const w = displayWidth(text)
	if (w > width) {
		const clipped = sliceDisplay(text, width)
		return clipped
	}
	const gap = width - w
	if (align === 'right') return ' '.repeat(gap) + text
	if (align === 'center') return ' '.repeat(Math.floor(gap / 2)) + text + ' '.repeat(Math.ceil(gap / 2))
	return text + ' '.repeat(gap)
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
		this.table = null // { startRow, lines: [] }
		this.rowsPrinted = 0
		this._prevLine = null
		this._prevLineRows = 0
	}

	push(piece) {
		if (this.raw || !this.tty || this.noColor) {
			this.buffer += String(piece)
			let out = ''
			let idx
			while ((idx = this.buffer.indexOf('\n')) !== -1) {
				const line = this.buffer.slice(0, idx)
				this.buffer = this.buffer.slice(idx + 1)
				this.rowsPrinted += countRows(line, this.width)
				out += line + '\n'
			}
			return out
		}

		this.buffer += String(piece)
		let out = ''
		let idx
		while ((idx = this.buffer.indexOf('\n')) !== -1) {
			const line = this.buffer.slice(0, idx)
			this.buffer = this.buffer.slice(idx + 1)
			out += this.#processLine(line) + '\n'
		}
		return out
	}

	flush() {
		const line = this.buffer
		this.buffer = ''
		if (!line) return ''
		if (this.raw || !this.tty || this.noColor) {
			this.rowsPrinted += countRows(line, this.width)
			return line
		}
		return this.#processLine(line)
	}

	#processLine = (line) => {
		const fenceOpen = line.match(/^```(\w+)?\s*$/)
		const fenceClose = line.match(/^```\s*$/)

		if (this.mode === 'normal') {
			// Table start detection: align row following a header row
			if (this.tty && !this.noColor) {
				const align = parseAlignRow(line)
				if (align && this._prevLine && parseTableRow(this._prevLine)) {
					this.mode = 'table'
					this.table = { startRow: this.rowsPrinted - this._prevLineRows, lines: [this._prevLine, line] }
					this.rowsPrinted += countRows(line, this.width)
					return line
				}
			}

			if (fenceOpen) {
				this.mode = 'fence'
				this.fence = {
					lang: fenceOpen[1] || '',
					startRow: this.rowsPrinted,
					lines: ['```' + (fenceOpen[1] || '')],
				}
				this.rowsPrinted += countRows(line, this.width)
				this._prevLine = line
				this._prevLineRows = countRows(line, this.width)
				return line
			}

			// normal styled line
			const styled = styleLineNormal({ line, tty: this.tty && !this.noColor, noColor: this.noColor, width: this.width })
			this.rowsPrinted += countRows(styled, this.width)
			this._prevLine = line
			this._prevLineRows = countRows(line, this.width)
			return styled
		}

		if (this.mode === 'table') {
			// Keep collecting pipe rows, else finalize
			if (/^\s*\|.*\|\s*$/.test(line)) {
				this.table.lines.push(line)
				this.rowsPrinted += countRows(line, this.width)
				return line
			}
			const repaint = this.#repaintTable()
			this.mode = 'normal'
			this.table = null
			// Now process current line in normal mode
			const styled = styleLineNormal({ line, tty: this.tty && !this.noColor, noColor: this.noColor, width: this.width })
			const rows = countRows(styled, this.width)
			this.rowsPrinted += rows
			this._prevLine = line
			this._prevLineRows = rows
			return repaint + styled
		}

		// fence mode
		if (this.mode === 'fence') {
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

		// fallback
		this.rowsPrinted += countRows(line, this.width)
		return line
	}

	#repaintFence = () => {
		if (!this.fence) return ''
		const { lang, startRow, lines } = this.fence

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

	#repaintTable = () => {
		if (!this.table) return ''
		const { startRow, lines } = this.table
		if (lines.length < 2) return ''

		const header = lines[0]
		const alignLine = lines[1]
		const headerCells = parseTableRow(header) || []
		const aligns = parseAlignRow(alignLine) || headerCells.map(() => 'left')
		const rows = lines.slice(2).map((ln) => parseTableRow(ln) || [])

		const pad = 1
		const minCol = 6
		let colWidths = headerCells.map((c) => Math.max(minCol, displayWidth(c)))

		for (const r of rows) {
			for (let i = 0; i < headerCells.length; i++) {
				const cell = r[i] ?? ''
				colWidths[i] = Math.max(colWidths[i], Math.min(80, displayWidth(cell)))
			}
		}

		const borders = headerCells.length + 1
		const totalContent = colWidths.reduce((a, w) => a + w + pad * 2, 0)
		let total = totalContent + borders
		const maxWidth = this.width

		if (total > maxWidth) {
			let over = total - maxWidth
			while (over > 0) {
				let idx = -1
				let best = -1
				for (let i = 0; i < colWidths.length; i++) {
					if (colWidths[i] > minCol && colWidths[i] > best) {
						best = colWidths[i]
						idx = i
					}
				}
				if (idx === -1) break
				colWidths[idx] -= 1
				over -= 1
			}
		}

		const wantStyle = this.tty && !this.noColor
const drawRow = (cells) => {
			const parts = []
			for (let i = 0; i < headerCells.length; i++) {
				const raw = String(cells[i] ?? '')
				const innerWidth = colWidths[i]
				const align = aligns[i] || 'left'
				const styled = wantStyle ? styleInline({ text: raw, tty: wantStyle, noColor: false }) : raw
				let plain = stripAnsi(styled)
				if (plain.length > innerWidth) {
					if (align === 'right') {
						plain = '…' + plain.slice(-(innerWidth - 1))
					} else {
						plain = plain.slice(0, innerWidth - 1) + '…'
					}
					// drop styling if truncated to keep widths stable
					const padded = align === 'right'
						? ' '.repeat(0) + plain.padStart(innerWidth)
						: align === 'center'
						? (() => { const left = Math.floor((innerWidth - plain.length) / 2); const right = innerWidth - plain.length - left; return ' '.repeat(left) + plain + ' '.repeat(right) })()
						: plain.padEnd(innerWidth)
					parts.push(' ' + padded + ' ')
					continue
				}
				// no truncation: keep styling
				const gap = innerWidth - plain.length
				const paddedStyled = align === 'right'
					? ' '.repeat(gap) + styled
					: align === 'center'
					? (() => { const left = Math.floor(gap / 2); const right = gap - left; return ' '.repeat(left) + styled + ' '.repeat(right) })()
					: styled + ' '.repeat(gap)
				parts.push(' ' + paddedStyled + ' ')
			}
			return '|' + parts.join('|') + '|'
		}

		const headerStyle = headingHue(2) + SGR.bold
		const faint = fg256(244)

		const alignedHeader = headerStyle + drawRow(headerCells) + SGR.reset
		const rule = '|' + colWidths.map((w) => faint + ' ' + '-'.repeat(w) + ' ' + SGR.reset).join('|') + '|'

		const body = rows.map((r) => drawRow(r)).join('\n')

		const rebuilt = [alignedHeader, rule, body].join('\n') + '\n'
		const newRows = countRows(rebuilt, this.width)

		const toMoveUp = this.rowsPrinted - startRow
		const moveUp = toMoveUp > 0 ? `${ESC}${toMoveUp}A` : ''
		const clearDown = `${ESC}J`
		const repaint = moveUp + clearDown + rebuilt

		this.rowsPrinted = startRow + newRows
		return repaint
	}
}
