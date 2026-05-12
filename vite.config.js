import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { resolve } from 'path'

function copySqlWasm() {
  return {
    name: 'copy-sql-wasm',
    buildStart() {
      const src = resolve('node_modules/sql.js/dist/sql-wasm.wasm')
      const dest = resolve('public/sql-wasm.wasm')
      if (!existsSync('public')) mkdirSync('public', { recursive: true })
      if (existsSync(src)) copyFileSync(src, dest)
    },
  }
}

export default defineConfig({
  plugins: [react(), copySqlWasm()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
})
