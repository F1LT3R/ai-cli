// CLI flag parser — returns parsed options without defaulting format/model.
// Codestyle: tabs, single quotes, no semicolons, trailing commas, ESM.

export const parseOptions = (argv, { isTty } = {}) => {
	const out = {
		format: undefined,
		model: undefined,
		size: undefined,
		ratio: undefined,
		out: undefined,
		prefix: undefined,
		noInline: false,
		listModels: false,
		continueConv: false,
		codeOnly: false,
		isTty: Boolean(isTty),
		provided: {
			format: false,
			model: false,
		},
		args: [],
	}

	const raw = Array.isArray(argv) ? argv.slice(2) : []

	for (let i = 0; i < raw.length; i += 1) {
		const token = String(raw[i] ?? '')

		// --models: list available models
		if (token === '--models') {
			out.listModels = true
			continue
		}

		// --continue: resume prior conversation
		if (token === '--continue') {
			out.continueConv = true
			continue
		}

		// --code: extract code blocks only
		if (token === '--code') {
			out.codeOnly = true
			continue
		}

		// --json shorthand → --format=json
		if (token === '--json') {
			out.format = 'json'
			out.provided.format = true
			continue
		}

		// --format <val> OR --format=<val>
		if (token === '--format' && i + 1 < raw.length) {
			const val = String(raw[i + 1] ?? '').toLowerCase()
			i += 1
			const normalized = normalizeFormat(val)
			out.format = normalized
			out.provided.format = true
			continue
		}
		if (token.startsWith('--format=')) {
			const val = token.split('=')[1] ?? ''
			const normalized = normalizeFormat(String(val).toLowerCase())
			out.format = normalized
			out.provided.format = true
			continue
		}

		// --model <id> OR --model=<id>
		if (token === '--model' && i + 1 < raw.length) {
			const id = String(raw[i + 1] ?? '').trim()
			i += 1
			if (id.length > 0) {
				out.model = id
				out.provided.model = true
			}
			continue
		}
		if (token.startsWith('--model=')) {
			const id = String(token.split('=')[1] ?? '').trim()
			if (id.length > 0) {
				out.model = id
				out.provided.model = true
			}
			continue
		}

		// --size <tier> OR --size=<tier>
		if (token === '--size' && i + 1 < raw.length) {
			out.size = String(raw[i + 1] ?? '').trim().toUpperCase()
			i += 1
			continue
		}
		if (token.startsWith('--size=')) {
			out.size = String(token.split('=')[1] ?? '').trim().toUpperCase()
			continue
		}

		// --ratio <W:H> OR --ratio=<W:H>
		if (token === '--ratio' && i + 1 < raw.length) {
			out.ratio = String(raw[i + 1] ?? '').trim()
			i += 1
			continue
		}
		if (token.startsWith('--ratio=')) {
			out.ratio = String(token.split('=')[1] ?? '').trim()
			continue
		}

		// --no-inline: save images to disk instead of displaying inline
		if (token === '--no-inline') {
			out.noInline = true
			continue
		}

		// --out [path]
		if (token === '--out') {
			const next = raw[i + 1] ?? ''
			if (next && !String(next).startsWith('--')) {
				out.out = String(next).trim()
				i += 1
			} else {
				out.out = true
			}
			continue
		}

		// --prefix <str> OR --prefix=<str>
		if (token === '--prefix' && i + 1 < raw.length) {
			out.prefix = String(raw[i + 1] ?? '').trim()
			i += 1
			continue
		}
		if (token.startsWith('--prefix=')) {
			out.prefix = String(token.split('=')[1] ?? '').trim()
			continue
		}

		// Positional: collect for caller
		out.args.push(token)
	}

	return out
}


const normalizeFormat = (val) => {
	// Accepted: text | json | mjs
	// Aliases: js → mjs
	if (val === 'js') return 'mjs'
	if (val === 'text' || val === 'json' || val === 'mjs') return val
	// If user provided an unknown value, return undefined but mark as provided upstream
	return undefined
}
