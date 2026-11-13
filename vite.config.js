/* global process */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { isSafeSyncToken } from './backend/syncToken.js';
import { requestBoundary } from './backend/requestBoundary.js';

export default defineConfig(() => {
  const localPort = Number(process.env.SSB_DEV_PORT || 5173);
  const trustedDevProxy = process.env.SSB_TRUSTED_DEV_PROXY === 'true';
  const syncToken = String(process.env.SSB_SYNC_TOKEN || '').trim();

  if (trustedDevProxy && !isSafeSyncToken(syncToken)) {
    throw new Error('Trusted development proxy requires a safe SSB_SYNC_TOKEN.');
  }

  return {
    plugins: [
      react(),
      ...(trustedDevProxy
        ? [
            {
              name: 'trusted-local-api-boundary',
              configureServer(server) {
                const guard = requestBoundary({
                  allowedHosts: [`127.0.0.1:${localPort}`, `localhost:${localPort}`],
                  allowedOrigins: [
                    `http://127.0.0.1:${localPort}`,
                    `http://localhost:${localPort}`,
                  ],
                  trustedProxy: true,
                });
                // Vite Connect responses do not implement Express status/json helpers.
                server.middlewares.use((req, res, next) => {
                  if (!req.url?.startsWith('/api')) return next();
                  const response = {
                    status(code) {
                      res.statusCode = code;
                      return this;
                    },
                    json(body) {
                      res.setHeader('Content-Type', 'application/json');
                      res.end(JSON.stringify(body));
                    },
                    setHeader: (...args) => res.setHeader(...args),
                  };
                  return guard(req, response, next);
                });
              },
            },
          ]
        : []),
    ],
    server: {
      proxy: {
        '/api': {
          target: process.env.SSB_API_TARGET || 'http://127.0.0.1:3177',
          changeOrigin: true,
          ...(trustedDevProxy ? { headers: { Authorization: `Bearer ${syncToken}` } } : {}),
        },
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('react-router-dom')) return 'router-vendor';
            if (id.includes('react-dom') || id.includes('/react/')) return 'react-vendor';
            if (id.includes('lucide-react')) return 'icon-vendor';
            if (id.includes('chart.js') || id.includes('react-chartjs-2')) return 'chart-vendor';
            // rolldown >=1.2.16 merges this shared dependency into the entry chunk
            // (+~23 kB); keep it separate so the entry stays under the bundle budget.
            if (id.includes('papaparse')) return 'csv-vendor';
          },
        },
      },
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.js',
    },
  };
});
