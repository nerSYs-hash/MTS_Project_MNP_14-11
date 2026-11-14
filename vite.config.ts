import fs from 'fs';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

export default defineConfig(({ command }) => {
  return {
    base: command === 'build' ? './' : '/',
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'serve-mtsupdate-packages',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            const rawUrl = req.url || '';
            const cleanUrl = rawUrl.split('?')[0];
            if (cleanUrl.endsWith('.mtsupdate') || cleanUrl.endsWith('.asar')) {
              const fileName = path.basename(cleanUrl);
              const lookupName = fileName === 'update.asar' ? 'app.asar' : fileName;
              const rootDir = import.meta.dirname || process.cwd();
              const possiblePaths = [
                path.resolve(rootDir, 'public', fileName),
                path.resolve(rootDir, fileName),
                path.resolve(rootDir, 'public', lookupName),
                path.resolve(rootDir, lookupName),
              ];
              for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                  const stat = fs.statSync(p);
                  res.setHeader('Content-Type', 'application/octet-stream');
                  res.setHeader('Content-Length', String(stat.size));
                  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
                  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
                  const stream = fs.createReadStream(p);
                  stream.pipe(res);
                  return;
                }
              }
            }
            next();
          });
        },
      },
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['icon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'fonts/*.woff2'],
        manifest: {
          id: '/',
          name: 'МТС Сохранение | MNP Рабочее место',
          short_name: 'МТС MNP',
          description: 'Автоматизированное рабочее место оператора группы сохранения клиентов МТС: таймеры перезвона, синхронизация с часами ПК, часовые пояса РФ и расчет конверсии смены.',
          theme_color: '#E30613',
          background_color: '#F4F5F7',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/icon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
          navigateFallbackDenylist: [/\.(asar|mtsupdate|zip)$/i],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
