/**
 * @fileoverview UTF-8-safe base64 decode helper.
 *
 * atob() returns a binary string where each character represents one raw byte.
 * When the source JSON was UTF-8-encoded (e.g. Finnish names with ä/ö),
 * multibyte sequences in that binary string cannot be parsed correctly by
 * JSON.parse. TextDecoder reassembles the UTF-8 byte sequence into the
 * correct Unicode string before parsing.
 */

/**
 * Decodes a base64-encoded UTF-8 JSON payload and parses it.
 *
 * @param {string} encoded - Base64 string whose source bytes are UTF-8-encoded JSON.
 * @returns {*} The parsed JSON value.
 * @throws {SyntaxError} If the decoded bytes are not valid JSON.
 * @throws {DOMException} If the string is not valid base64.
 */
export function base64DecodeJson(encoded) {
  const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}
