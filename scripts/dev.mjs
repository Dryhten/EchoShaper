import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const rootDir = process.cwd()

function loadDotEnv(dotEnvPath) {
  try {
    const content = fs.readFileSync(dotEnvPath, 'utf8')
    for (const rawLine of content.split(/\r?\n/g)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const idx = line.indexOf('=')
      if (idx <= 0) continue

      const key = line.slice(0, idx).trim()
      let value = line.slice(idx + 1).trim()

      // Strip surrounding quotes (e.g. "5177" / '5177')
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      if (!(key in process.env)) process.env[key] = value
    }
  } catch {
    // ignore: .env not found or unreadable
  }
}

loadDotEnv(path.join(rootDir, '.env'))

const backendDir = path.join(rootDir, 'backend')
const frontendDir = path.join(rootDir, 'frontend')

const frontendPort = process.env.FRONTEND_PORT ?? '5173'

const backend = spawn('uv run app.py', {
  cwd: backendDir,
  stdio: 'inherit',
  shell: true,
})

const frontend = spawn(`npm run dev -- --host 127.0.0.1 --port ${frontendPort}`, {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: true,
})

function shutdown(signal) {
  if (backend.exitCode === null) backend.kill(signal)
  if (frontend.exitCode === null) frontend.kill(signal)
}

process.on('SIGINT', () => {
  shutdown('SIGINT')
})

process.on('SIGTERM', () => {
  shutdown('SIGTERM')
})

backend.on('exit', (code) => {
  frontend.kill('SIGINT')
  process.exit(code ?? 0)
})

frontend.on('exit', (code) => {
  backend.kill('SIGINT')
  process.exit(code ?? 0)
})

