// Mirror of the renderer half of electron.vite.config.ts.
// Lets tooling (shadcn CLI) detect this as a standard Vite + React project.
import { resolve } from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src')
    }
  }
})
