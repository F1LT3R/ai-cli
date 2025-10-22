// This is iteration 1 of lib/options-i1.mjs
// Normalizes CLI options for the AI CLI.
// Style: tabs, single quotes, ESM, no unnecessary semicolons, trailing commas.

export const parseOptions = ({ argv, isTty }) => {
	const out = {
		format: 'text',
		autosaveDefaultYes: true,
		contextSaveDefaultYes: true,
	}

	for (const raw of argv) {
		if (!raw.startsWith('--')) continue
		if (raw === '--format' || raw.startsWith('--format=')) {
			const value = raw === '--format' ? null : raw.split('=')[1]
			// If user provided '--format json' as separate arg, we will catch it below
			// by reading next token from argv in bin glue. Here, accept only inline form.
			if (value) {
				out.format = value
			}
			continue
		}
		if (raw === '--json') {
			out.format = 'json'
			continue
		}
	}

	// Normalize and validate
	if (typeof out.format !== 'string') out.format = 'text'
	const f = out.format.toLowerCase()
	if (f !== 'text' && f !== 'json') {
		throw new Error('Invalid --format. Use: text | json')
	}
	out.format = f

	// Respect TTY if needed later; we keep defaults true as requested
	out.isTty = Boolean(isTty)

	return out
}
