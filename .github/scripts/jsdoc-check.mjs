/**
 * @fileoverview JSDoc presence and structure checks used by CI scripts.
 *
 * All functions are pure and operate on string inputs so they can be
 * unit-tested without filesystem access.
 */

/**
 * Splits a function parameter list string into individual parameter names.
 *
 * Destructured parameters (`{ a, b }`, `[first]`) are normalised to the
 * placeholder `{destructured}`. Default values and spread operators are
 * stripped. Nested braces/brackets are handled correctly so inner commas
 * do not cause spurious splits.
 *
 * @param {string} paramsStr - The full parameter list including outer parens,
 *   e.g. `'(a, b = 1, { c }, ...rest)'`.
 * @returns {string[]} Array of parameter names (or `'{destructured}'`).
 */
export function parseParamNames(paramsStr) {
  const inner = paramsStr.replace(/^\s*\(|\)\s*$/g, '').trim();
  if (!inner) return [];

  // Split by commas at depth 0, tracking brace/bracket nesting.
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of inner) {
    if (ch === '(' || ch === '{' || ch === '[') depth++;
    else if (ch === ')' || ch === '}' || ch === ']') depth--;
    else if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());

  return parts.map((p) => {
    if (p.startsWith('{') || p.startsWith('[')) return '{destructured}';
    return p
      .replace(/^\.\.\./, '')
      .replace(/\s*=.*$/, '')
      .trim();
  });
}

/**
 * Searches backwards from `lineIndex` in `lines` for a JSDoc block
 * (a slash-star-star ... star-slash block) immediately preceding the line
 * (blank lines are skipped).
 *
 * Returns `null` when no JSDoc is found or when a non-blank, non-JSDoc line
 * appears between the JSDoc and the target line.
 *
 * @param {string[]} lines - Source file split into lines.
 * @param {number} lineIndex - Index of the line that should be preceded by JSDoc.
 * @returns {string | null} The JSDoc block text, or `null`.
 */
export function jsdocBefore(lines, lineIndex) {
  let i = lineIndex - 1;
  while (i >= 0 && lines[i].trim() === '') i--;
  if (i < 0 || !lines[i].trim().endsWith('*/')) return null;
  const end = i;
  while (i >= 0 && !lines[i].trim().startsWith('/**')) i--;
  if (i < 0) return null;
  return lines.slice(i, end + 1).join('\n');
}

/**
 * Returns `true` when `line` declares an arrow function with an expression
 * body (no opening `{` after the `=>`).
 *
 * @param {string} line - A single source line.
 * @returns {boolean}
 */
export function isImplicitArrow(line) {
  if (!line.includes('=>')) return false;
  const afterArrow = line.slice(line.indexOf('=>') + 2).trim();
  return afterArrow.length > 0 && !afterArrow.startsWith('{');
}

/**
 * Returns `true` when the function starting at `lineIndex` has a `return`
 * statement at brace-depth 1 (i.e., directly inside the function body, not
 * inside a nested block).
 *
 * This heuristic is deliberately conservative: returns inside `if {}`,
 * forEach callbacks, etc. are at depth ≥ 2 and are not counted.
 *
 * @param {string[]} lines - Source file split into lines.
 * @param {number} lineIndex - Index of the line where the function declaration
 *   starts.
 * @returns {boolean}
 */
export function bodyHasReturn(lines, lineIndex) {
  let depth = 0;
  let inBody = false;

  for (let i = lineIndex; i < lines.length; i++) {
    const line = lines[i];
    const depthAtLineStart = depth;

    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }

    if (!inBody) {
      if (depth >= 1) inBody = true;
      continue;
    }

    if (depth === 0) return false;

    // Only count `return` at depth 1 (the function's own scope).
    if (depthAtLineStart === 1 && /^\s*return\b/.test(line)) return true;
  }

  return false;
}
