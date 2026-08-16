import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// app.getVersion() reports Electron's own version in an unpackaged build, so the
// real app version is baked in at build time instead.
const { version } = JSON.parse(readFileSync(resolve('package.json'), 'utf-8'))

export default defineConfig({
  main: {
    define: {
      __APP_VERSION__: JSON.stringify(version)
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
