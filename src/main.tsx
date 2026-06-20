import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { Toaster } from 'sonner'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element #root not found')
}

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
      <Toaster position="top-center" richColors closeButton />
    </ErrorBoundary>
  </StrictMode>,
)
