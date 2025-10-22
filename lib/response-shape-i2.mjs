// This is iteration 2 of lib/response-shape-i1.mjs
export const shapeRequestBody = ({ format, body }) => {
	const next = { ...body }
	if (format === 'json' || format === 'mjs') {
		next.response_format = { type: 'json_object' }
	}
	return next
}