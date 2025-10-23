// This is iteration 1 of lib/shape/validators-i1.mjs
// Purpose: minimal, pure, hand-rolled validators for structured output by format.
// Style: tabs for indentation, single quotes, no unnecessary semicolons, trailing commas, arrow parens always.

/**
 * Format-aware assertion. Returns the input on success, throws TypeError on failure.
 * @param {unknown} data
 * @param {string} format - e.g. 'mjs' | 'json' | 'markdown' | 'plain' | 'text'
 * @returns {any}
 */
export const assertShape = (data, format) => {
	const fmt = String(format || '').toLowerCase()

	if (fmt === 'mjs') {
		return assertMjsShape(data)
	}

	if (fmt === 'json') {
		if (typeof data !== 'object' || data === null) {
			throw new TypeError('JSON response must be a non-null object')
		}
		return data
	}

	// text-like formats are not schema-enforced
	return data
}

/**
 * Ensure the response is an object with a string field 'code'.
 * This enforces the contract for structured MJS output.
 * @param {unknown} data
 * @returns {{ code: string }}
 */
export const assertMjsShape = (data) => {
	if (typeof data !== 'object' || data === null) {
		throw new TypeError('MJS response must be an object')
	}
	// Using optional chaining to read without throwing
	const code = /** @type {any} */ (data)?.code
	if (typeof code !== 'string') {
		throw new TypeError('MJS response must contain a string field "code"')
	}
	return /** @type {{ code: string }} */ (data)
}
