import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(() => {
  const rawBase = process.env.VITE_BASE_PATH
  let base = rawBase ?? './'
  if (!base.endsWith('/')) {
    base = `${base}/`
  }

  return {
    base,
    plugins: [react()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  }
})
