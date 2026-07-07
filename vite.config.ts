import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { execSync } from 'node:child_process'

// Stamp replay logs with the build's commit so a fixture that diverges can be traced to the
// code it was recorded against. Falls back to 'unknown' outside a git checkout.
let commit = 'unknown'
try { commit = execSync('git rev-parse --short HEAD').toString().trim() } catch { /* not a git checkout */ }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: { __COMMIT_HASH__: JSON.stringify(commit) },
})
