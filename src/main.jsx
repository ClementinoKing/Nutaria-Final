import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { DailyChecksProvider } from './context/DailyChecksContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'

createRoot(document.getElementById('root')).render(
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
    <Toaster position="top-right" richColors closeButton duration={5000} />
  </StrictMode>
)
