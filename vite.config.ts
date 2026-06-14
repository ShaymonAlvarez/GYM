import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-pdf': ['pdfjs-dist'],
          'vendor-xlsx': ['xlsx-populate/browser/xlsx-populate-no-encryption.min.js', 'jszip'],
          'vendor-export': ['jspdf', 'html2canvas'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-dexie': ['dexie'],
        }
      }
    }
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      workbox: {
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/i\.ytimg\.com\/.*$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'youtube-thumbnails',
              cacheableResponse: {
                statuses: [0, 200]
              },
              expiration: {
                maxEntries: 48,
                maxAgeSeconds: 60 * 60 * 24 * 30
              }
            }
          }
        ]
      },
      manifest: {
        name: 'Gym Local',
        short_name: 'Gym Local',
        description: 'Ficha de treino local-first com PIN e backup.',
        theme_color: '#121212',
        background_color: '#f3efe7',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/icon.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'any'
          },
          {
            src: '/icon-maskable.svg',
            sizes: '512x512',
            type: 'image/svg+xml',
            purpose: 'maskable'
          }
        ]
      }
    })
  ]
});