export const shapeRequestBody = ({ format, body }) => {
	const next = { ...body }
	if (format === 'json' || format === 'mjs') {
		next.response_format = { type: 'json_object' }
	}
	return next
}