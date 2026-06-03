import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.cet4.words',
  appName: '四级背单词',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    /** 原生端用系统网络栈发请求，绕过 WebView CORS（否则百炼/有道会 Failed to fetch） */
    CapacitorHttp: {
      enabled: true,
    },
  },
}

export default config
