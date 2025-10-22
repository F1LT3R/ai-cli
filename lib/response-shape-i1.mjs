// This is iteration 1 of lib/response-shape-i1.mjs
// Maps normalized options to the OpenAI Chat Completions request body.
// Pure function: never mutates the input body.

export const shapeRequestBody = ({ format, body }) => {
	const next = { ...body }
	if (format === 'json') {
		// OpenAI: enforce valid JSON object responses
		next.response_format = { type: 'json_object' }
	}
	return next
}
