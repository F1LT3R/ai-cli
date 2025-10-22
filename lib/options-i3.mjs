// This is iteration 3 of lib/options-i3.mjs
// Purpose: parse CLI flags without defaulting format/model unless explicitly provided.
// - Returns `provided.format` / `provided.model` booleans so the caller can decide whether to persist.
// - Never writes defaults here; leaves persistence to the main program.
// Codestyle: tabs, single quotes, no semicolons, trailing commas, ESM.

export const parseOptions = (argv, { isTty } = {}) => {
	const out = {
		format: undefined,
		model: undefined,
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
