import { spawn } from 'node:child_process'
import path from 'node:path'
import fs from 'node:fs'

const rootDir = process.cwd()
const backendDir = path.join(rootDir, 'backend')

function loadEnvFile(envPath) {
  // 仅为保证 BACKEND_HOST/BACKEND_PORT 等变量可用；后端 Python 也会再次加载 .env。
  try {
    if (!fs.existsSync(envPath)) return
    const raw = fs.readFileSync(envPath, 'utf8')
    const lines = raw.split(/\r?\n/)

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const idx = trimmed.indexOf('=')
      if (idx === -1) continue

      const key = trimmed.slice(0, idx).trim()
      let value = trimmed.slice(idx + 1).trim()

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      if (process.env[key] === undefined) process.env[key] = value
    }
  } catch {
    // ignore
  }
}

loadEnvFile(path.join(rootDir, '.env'))

const backend = spawn('uv run app.py', {
  cwd: backendDir,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    // 明确生产模式：关闭热重载
    BACKEND_RELOAD: 'false',
  },
})

backend.on('exit', (code) => {
  process.exit(code ?? 0)
})

