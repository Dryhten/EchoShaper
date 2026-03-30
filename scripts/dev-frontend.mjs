import { spawn } from 'node:child_process'
import path from 'node:path'

const rootDir = process.cwd()
const frontendDir = path.join(rootDir, 'frontend')

const child = spawn('npm run dev -- --host 0.0.0.0 --port 5173', {
  cwd: frontendDir,
  stdio: 'inherit',
  shell: true,
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

