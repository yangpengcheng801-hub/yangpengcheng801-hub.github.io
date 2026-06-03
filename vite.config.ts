import { defineConfig, loadEnv, type UserConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { openaiProxyPlugin, dictProxyPlugin } from './scripts/openai-proxy-plugin'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  loadEnv(mode, process.cwd(), '')

  const config: UserConfig = {
    plugins: [react(), openaiProxyPlugin(), dictProxyPlugin()],
    base: process.env.BASE_PATH || '/',
  }

  return config
})
