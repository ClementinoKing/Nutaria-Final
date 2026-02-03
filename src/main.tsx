import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { DailyChecksProvider } from './context/DailyChecksContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'

const Toaster = lazy(() => import('sonner').then((module) => ({ default: module.Toaster })))

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <DailyChecksProvider>
            <App />
          </DailyChecksProvider>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
    <Suspense fallback={null}>
      <Toaster position="top-right" richColors closeButton duration={5000} />
    </Suspense>
  </StrictMode>
)
