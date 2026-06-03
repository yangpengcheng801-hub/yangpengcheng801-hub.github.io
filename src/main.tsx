import { Capacitor } from '@capacitor/core'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { registerServiceWorker } from './pwa'
import { warmUpSpeech } from './speech'

if (Capacitor.isNativePlatform()) {
  document.documentElement.classList.add('native-app')
  void warmUpSpeech()
} else {
  registerServiceWorker()
}

function applyLayoutClasses() {
  const tablet = window.matchMedia('(min-width: 768px)')
  const wide = window.matchMedia('(min-width: 900px)')
  const update = () => {
    document.documentElement.classList.toggle('tablet-app', tablet.matches)
    document.documentElement.classList.toggle('wide-layout', wide.matches)
  }
  update()
  tablet.addEventListener('change', update)
  wide.addEventListener('change', update)
}

applyLayoutClasses()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
