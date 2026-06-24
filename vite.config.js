import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
            const { prompt } = JSON.parse(body);
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

            const upstream = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
              },
              body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 1024,
                messages: [{ role: 'user', content: prompt }],
              }),
            });

            const data = await upstream.json();
            const text = data.content?.[0]?.text ?? '';
            res.end(JSON.stringify({ text }));
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
