import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const backendDir = path.join(rootDir, 'backend')
const frontendDir = path.join(rootDir, 'frontend')

function loadEnvFile(envPath) {
  // 轻量级 .env 解析：只处理 KEY=VALUE，忽略空行/注释。
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

      // 去掉首尾引号：如 "8058" / '8058'
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }

      if (process.env[key] === undefined) process.env[key] = value
    }
  } catch {
    // ignore: 保持启动尽量可用
  }
}

loadEnvFile(path.join(rootDir, '.env'))

const backendPort = process.env.BACKEND_PORT ?? '8058'

// 嵌入式托管场景下，前端与后端同源访问：API 直接用相对路径 `/api/...`。
// 这样不管你从公网/内网用哪个域名访问，fetch 都会走当前 origin。
const apiBaseUrl = ''

function run(cmd, { cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, {
      cwd,
      env: env ?? process.env,
      stdio: 'inherit',
      shell: true,
    })

    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`Command failed: ${cmd} (exit code: ${code ?? 'unknown'})`))
    })
  })
}

// 顺序：先 build，后并行启动 preview + 后端
await run('npm run build', {
  cwd: frontendDir,
  env: {
    ...process.env,
    VITE_API_BASE_URL: apiBaseUrl,
  },
})

function shutdown(signal) {
  if (backend.exitCode === null) backend.kill(signal)
}

const backend = spawn('uv run app.py', {
  cwd: backendDir,
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    BACKEND_RELOAD: 'false',
  },
})

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

backend.on('exit', (code) => {
  process.exit(code ?? 0)
})

