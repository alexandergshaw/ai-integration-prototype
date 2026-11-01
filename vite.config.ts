import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

const serverEnvironment = ['GEMINI_API_KEY', 'GEMINI_MODEL', 'DEMO_ACCESS_CODE', 'SESSION_SECRET'] as const

function localApi(): Plugin {
  return {
    name: 'inquiry-local-api',
    apply: 'serve' as const,
    config(_config, { mode }) {
      const env = loadEnv(mode, process.cwd(), '')
      for (const name of serverEnvironment) {
        if (process.env[name] === undefined && env[name] !== undefined) process.env[name] = env[name]
      }
    },
    async configureServer(server) {
      const [{ default: session }, { default: coach }] = await Promise.all([
        server.ssrLoadModule('/api/session.ts'),
        server.ssrLoadModule('/api/coach.ts'),
      ])
      server.middlewares.use((req, res, next) => {
        const path = new URL(req.url ?? '/', 'http://localhost').pathname
        const handler = path === '/api/session' ? session : path === '/api/coach' ? coach : undefined
        if (!handler) return next()
        void handler(req, res).catch(next)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), localApi()],
})
