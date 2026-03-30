import { spawn } from 'node:child_process'
import path from 'node:path'

const rootDir = process.cwd()
const backendDir = path.join(rootDir, 'backend')

const child = spawn('uv run app.py', {
  cwd: backendDir,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

