/**
 * @fileoverview Helpers for determining whether a source line references a
 * given module, used by CI impact-analysis scripts.
 */

/**
 * Returns `true` when `line` contains an import or `require()` of a module
 * whose basename exactly matches `moduleName` (with or without a `.js` / `.mjs`
 * / `.cjs` extension).
 *
 * Partial-name matches are rejected: `referencesModule(line, 'fns')` will not
 * match a path ending in `/pure-fns.js`.
 *
 * @param {string} line - A single source line.
 * @param {string} moduleName - The bare module basename to look for, e.g.
 *   `'pure-fns'` or `'04-render'`.
 * @returns {boolean}
 */
export function referencesModule(line, moduleName) {
  // Escape regex special chars in the module name (hyphens, dots, etc.).
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match the basename as a complete path segment: must be preceded by /
  // and followed by optional extension then a closing quote.
  // eslint-disable-next-line security/detect-non-literal-regexp -- moduleName is caller-controlled CI input, escaped above
  const re = new RegExp(`/${escaped}(?:\\.(?:js|mjs|cjs))?['"]`);
  return re.test(line);
}
