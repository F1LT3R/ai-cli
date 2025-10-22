// This is iteration 2 of lib/options-i1.mjs
export const parseOptions = (argv, { isTty }) => {
	const out = { format: undefined, model: undefined }
	const args = argv.slice(2)
	for (let i = 0; i < args.length; i += 1) {
		const a = args[i]
		if (a === '--format' && i + 1 < args.length) { out.format = String(args[i + 1]); i += 1; continue }
		if (a.startsWith('--format=')) { out.format = String(a.split('=')[1] || 'text'); continue }
		if (a === '--json') { out.format = 'json'; continue }
		if (a === '--model' && i + 1 < args.length) { out.model = String(args[i + 1]); i += 1; continue }
		if (a.startsWith('--model=')) { out.model = String(a.split('=')[1] || ''); continue }
	}
	out.format = (out.format || 'text').toLowerCase()
	if (!['text', 'json', 'mjs'].includes(out.format)) out.format = 'text'
	out.isTty = Boolean(isTty)
	return out
}