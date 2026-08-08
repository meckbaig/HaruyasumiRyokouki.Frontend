import { readFileSync } from 'node:fs'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backend = env.BACKEND_ORIGIN || 'http://localhost:5101'

  return {
    /*
      The version comes from package.json rather than a variable of its own, so
      `npm version` remains the single act that releases: it bumps the number and
      tags the commit. The build stamp beside it answers the question a version
      alone cannot — whether what is deployed is what was last built.
    */
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __APP_BUILD__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      // Proxy the API so development is not blocked by CORS or Basic-auth preflight.
      proxy: {
        '/v1': {
          target: backend,
          changeOrigin: true,
        },
      },
    },
    build: {
      terserOptions: {
        format: {
          comments: false,
        },
      },
    },
  }
})
