import React from 'react'
import ReactDOM from 'react-dom/client'
import { ParticlesProvider } from '@tsparticles/react'
import { loadSlim } from '@tsparticles/slim'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ParticlesProvider init={loadSlim}><App /></ParticlesProvider>
  </React.StrictMode>,
)
