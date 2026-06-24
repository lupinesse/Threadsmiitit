import { defineConfig } from 'vite';
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { compile } from 'sass';

const JS_SRC = 'src/js';
const JS_OUT = 'script.js';
const CSS_SRC = 'src/css/styles.scss';
const CSS_OUT = 'styles.css';

function buildJS() {
  const files = readdirSync(JS_SRC)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.example.js'))
    .sort();
  const parts = files.map((f) => {
    const content = readFileSync(join(JS_SRC, f), 'utf8').replace(/\s+$/, '');
    return `// ── ${f} ──\n${content}`;
  });
  const output = parts.join('\n\n') + '\n';
  writeFileSync(JS_OUT, output);
  return files.length;
}

function buildCSS() {
  const result = compile(CSS_SRC, { style: 'expanded' });
  writeFileSync(CSS_OUT, result.css);
}

function assetBuildPlugin() {
  return {
    name: 'asset-build',
    configureServer(_server) {
      const jsCount = buildJS();
      buildCSS();
      console.log(`✓ Built ${JS_OUT} from ${jsCount} JS files and ${CSS_OUT} from SCSS`);
    },
    handleHotUpdate({ file, server }) {
      const norm = file.replace(/\\/g, '/');
      const name = norm.split('/').pop();

      if (
        norm.includes('/' + JS_SRC + '/') &&
        file.endsWith('.js') &&
        !file.endsWith('.example.js')
      ) {
        const count = buildJS();
        console.log(`[vite] rebuilt ${JS_OUT} (${count} files) — ${name} changed`);
        server.ws.send({ type: 'full-reload' });
        return [];
      }

      if (norm.includes('/src/css/') && file.endsWith('.scss')) {
        try {
          buildCSS();
          console.log(`[vite] rebuilt ${CSS_OUT} — ${name} changed`);
          server.ws.send({ type: 'full-reload' });
        } catch (err) {
          console.error(`[vite] SCSS error in ${name}:`, err.message);
        }
        return [];
      }
    },
    buildStart() {
      buildJS();
      buildCSS();
    },
  };
}

export default defineConfig({
  root: '.',
  server: {
    port: 8001,
    open: '/index.html',
    strictPort: true,
  },
  preview: {
    port: 8091,
    open: '/index.html',
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: 'index.html',
    },
  },
  plugins: [assetBuildPlugin()],
});
