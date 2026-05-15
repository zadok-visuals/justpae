import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    historyApiFallback: true,
  },
  // Add this block to bypass bundling the native .node file
  optimizeDeps: {
    exclude: ['fsevents']
  },
  plugins: [
    react(),
    // FIXED: Integrated background web app manifests and tracking worker streams
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'AmazingPay Terminal',
        short_name: 'AmazingPay',
        description: 'Secure Peer-to-Peer Fintech Trading Platform',
        theme_color: '#FF6B35', // Matches your --fintech-orange color token
        background_color: '#1A0B0B',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/lovable-uploads/80df4e70-bf98-4b0e-886b-d1aa2e95b2ac.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/lovable-uploads/d8bf89ab-4a7e-4d3a-b1d3-c492661136b6.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    }),
    mode === 'development' && componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
