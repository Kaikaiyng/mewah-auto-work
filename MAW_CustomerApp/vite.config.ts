import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const devApiPath = process.env.MAW_DEV_API_PATH || '/api/api.php'

function figmaAssetResolver() {
  return {
    name: 'figma-asset-resolver',
    resolveId(id) {
      if (id.startsWith('figma:asset/')) {
        const filename = id.replace('figma:asset/', '')
        return path.resolve(__dirname, 'src/assets', filename)
      }
    },
  }
}

export default defineConfig(({ mode }) => ({
  // Absolute asset bases are required for BrowserRouter deep-link refreshes.
  // Relative "./assets" URLs resolve under /repair-progress/:id and leave the
  // app blank because the JavaScript bundle cannot be found.
  base: mode === 'staging' ? '/staging/' : '/',
  plugins: [
    figmaAssetResolver(),
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      // Both local apps use the same staging API/database. Customer submissions
      // and Admin records therefore share one backend during development.
      '/api': {
        target: process.env.MAW_DEV_API_TARGET || 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: true,
        headers: { 'X-MAW-Portal': 'customer' },
        rewrite: (requestPath) => requestPath.replace(/^\/api(\/api\.php)?/, devApiPath),
      },
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
}))
