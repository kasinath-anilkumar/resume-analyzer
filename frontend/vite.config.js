import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // VITE_API_URL is baked into the bundle at BUILD time — there is no way to fix
  // it after deploying short of rebuilding. Left unset, services/api.js silently
  // falls back to http://localhost:5000, producing a deployed app that cannot
  // reach its own backend and fails only in the user's browser. Fail the
  // production build instead, where the mistake is cheap to correct.
  if (command === 'build') {
    const env = loadEnv(mode, process.cwd(), '')
    if (!String(env.VITE_API_URL || '').trim()) {
      throw new Error(
        'VITE_API_URL is not set.\n' +
        'The production build needs the public backend origin (e.g. https://your-api.onrender.com).\n' +
        'Set it in the Vercel project environment variables, or in frontend/.env for a local build.'
      )
    }
  }

  return { plugins: [react()] }
})
