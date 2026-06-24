/**
 * build.js — concatenate src/js/*.js → script.js and compile src/css/styles.scss → styles.css.
 *
 * Run via `npm run build` (executed before vite build) or standalone with `node build.js`.
 */

import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { compile } from 'sass';

const JS_SRC = 'src/js';
const JS_OUT = 'script.js';
const CSS_SRC = 'src/css/styles.scss';
const CSS_OUT = 'styles.css';

/**
 * Concatenate all .js files in src/js/ into script.js.
 * @returns {number} Number of source files concatenated.
 */
function buildJS() {
  const files = readdirSync(JS_SRC)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.example.js'))
    .sort();

  const parts = files.map((f) => {
    const content = readFileSync(join(JS_SRC, f), 'utf8').replace(/\s+$/, '');
    return `// ── ${f} ──\n${content}`;
  });

  writeFileSync(JS_OUT, parts.join('\n\n') + '\n');
  return files.length;
}

/**
 * Compile src/css/styles.scss → styles.css.
 */
function buildCSS() {
  const result = compile(CSS_SRC, { style: 'expanded' });
  writeFileSync(CSS_OUT, result.css);
}

const jsCount = buildJS();
buildCSS();
console.log(`✓ Built ${JS_OUT} from ${jsCount} JS files and ${CSS_OUT} from SCSS`);
