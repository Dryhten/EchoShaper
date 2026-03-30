import { spawn } from 'node:child_process'
import path from 'node:path'

const rootDir = process.cwd()
const backendDir = path.join(rootDir, 'backend')
const frontendDir = path.join(rootDir, 'frontend')

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

async function main() {
  await run('npm install', { cwd: frontendDir })

  // backend：优先 uv；失败则回退到 pip
  try {
    await run('uv --version', { cwd: backendDir })
    await run('uv pip install -r requirements.txt', { cwd: backendDir })
  } catch {
    await run('pip install -r requirements.txt', { cwd: backendDir })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

