import { Suspense, lazy, Fragment } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { DailyChecksProvider } from './context/DailyChecksContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { toast } from 'sonner'
import { getFriendlyToastErrorMessage } from './lib/errorMessages'

const originalToastError = toast.error.bind(toast)
toast.error = ((message, options) =>
  originalToastError(getFriendlyToastErrorMessage(message), options)
) as typeof toast.error

const Toaster = lazy(() => import('sonner').then((module) => ({ default: module.Toaster })))

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Root element not found')
}

const RootWrapper = import.meta.env.DEV ? Fragment : Fragment

createRoot(rootElement).render(
  <RootWrapper>
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
  </RootWrapper>
)
