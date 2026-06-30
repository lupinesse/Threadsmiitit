import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { validatePrompt } from './netlify/functions/lib/validate-chat-request.mjs';
import { callAnthropic } from './netlify/functions/lib/anthropic-proxy.mjs';

/**
 * Vite server-side middleware that proxies /api/chat to the Anthropic API.
 * The API key is read from the ANTHROPIC_API_KEY environment variable and
 * never exposed to the browser bundle.
 *
 * @returns {import('vite').Plugin}
 */
function chatApiPlugin() {
  return {
    name: 'chat-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api/chat', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end();
          return;
        }

        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json');
          try {
            const parsed = JSON.parse(body);
            const promptResult = validatePrompt(parsed?.prompt);
            if (!promptResult.ok) {
              res.statusCode = promptResult.status;
              res.end(JSON.stringify({ error: promptResult.error }));
              return;
            }
            const { prompt } = parsed;
            const apiKey = process.env.ANTHROPIC_API_KEY;

            if (!apiKey) {
              res.statusCode = 503;
              res.end(
                JSON.stringify({
                  error: 'ANTHROPIC_API_KEY not set — AI assistant unavailable',
                })
              );
              return;
            }

            const result = await callAnthropic(prompt, apiKey);
            if (!result.ok) {
              res.statusCode = result.status;
              res.end(JSON.stringify({ error: result.error }));
              return;
            }

            res.end(JSON.stringify({ text: result.text }));
          } catch (err) {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: '/',
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
  plugins: [react({ jsxRuntime: 'automatic' }), chatApiPlugin()],
});
