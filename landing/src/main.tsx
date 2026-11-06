import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@/styles/index.css'
import App from '@/App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// The free server sleeps when nobody has used it for a while and takes up to a minute to wake. Visitors reach this page first,
// so wake it now: by the time they press "Open the app" it is ready. Nothing is read from the answer.
try {
  const app = ((import.meta.env.VITE_APP_URL as string | undefined) || 'https://crp-mentor-copilot.vercel.app').replace(/\/$/, '')
  fetch(`${app}/api/health`, { mode: 'no-cors', cache: 'no-store' }).catch(() => {})
} catch { /* not important */ }
