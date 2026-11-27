import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import net from 'net'
import { spawn } from 'child_process'

// Automatically starts ../server/backend.js on port 3000 during `vite` dev if not already running
function autoStartBackendPlugin() {
  let backendProc = null
  return {
    name: 'auto-start-gabay-backend',
    configureServer() {
      const socket = new net.Socket()
      socket.setTimeout(600)
      socket.once('connect', () => {
        socket.destroy()
      })
      socket.once('error', () => {
        socket.destroy()
        const serverDir = path.resolve(__dirname, '../server')
        backendProc = spawn(process.execPath, ['backend.js'], {
          cwd: serverDir,
          stdio: 'inherit',
          env: { ...process.env, PORT: '3000' }
        })
        backendProc.on('error', () => {})
      })
      socket.connect(3000, '127.0.0.1')

      process.once('exit', () => {
        if (backendProc && !backendProc.killed) backendProc.kill()
      })
    }
  }
}

export default defineConfig({
  plugins: [react(), autoStartBackendPlugin()],
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
