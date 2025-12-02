import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [resetting, setResetting] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { login, user, authenticating } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (user) {
      navigate('/dashboard')
    }
  }, [user, navigate])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    if (!email || !password) {
      toast.error('Please enter both email and password')
      return
    }

    const { error: signInError } = await login(email, password)
    if (signInError) {
      toast.error(signInError.message ?? 'Unable to sign in. Please try again.')
      return
    }

    navigate('/dashboard')
  }

  const handlePasswordReset = async () => {
    if (!email) {
      toast.error('Enter the email you use for your account first.')
      return
    }

    setResetting(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    })
    setResetting(false)

    if (error) {
      toast.error(error.message ?? 'Could not send reset instructions.')
      return
    }

    toast.success('Password reset link sent. Check your inbox.')
  }

  return (
    <div className="flex min-h-screen bg-[#f7f1e7]">
      <div className="flex w-full flex-col lg:flex-row">
        <div className="flex w-full items-center justify-center px-6 py-16 lg:w-1/2">
          <Card className="w-full max-w-md rounded-2xl border-0 shadow-[0_32px_64px_-32px_rgba(33,37,41,0.35)]">
            <CardHeader className="space-y-6 pb-4 pt-10">
              <span className="h-1 w-12 rounded-md bg-olive-dark" />
              <div className="space-y-2">
                <CardTitle className="text-3xl font-semibold text-text-dark">Login</CardTitle>
                <CardDescription className="text-base text-text-dark/70">
                  Access your Nutaria account
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-8 pb-10">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-text-dark">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-dark/40" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="info@nutaria.co.za"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="h-14 rounded-xl border-none bg-[#f1e8dd] pl-12 text-base text-text-dark shadow-inner focus-visible:ring-2 focus-visible:ring-olive-dark"
                      autoComplete="email"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label htmlFor="password" className="text-sm font-medium text-text-dark">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-text-dark/40" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-14 rounded-xl border-none bg-[#f1e8dd] pl-12 text-base text-text-dark shadow-inner focus-visible:ring-2 focus-visible:ring-olive-dark"
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-text-dark/50 hover:text-text-dark focus:outline-none"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>
                <Button
                  type="submit"
                  className="h-14 w-full rounded-xl bg-olive-dark text-base font-semibold tracking-wide hover:bg-olive-dark/90"
                  disabled={authenticating}
                >
                  {authenticating ? 'Signing In…' : 'LOGIN'}
                </Button>
              </form>
              <div className="space-y-2 text-center text-sm">
                <button
                  type="button"
                  onClick={handlePasswordReset}
                  disabled={resetting}
                  className="block text-text-dark/70 transition hover:text-text-dark disabled:cursor-not-allowed disabled:text-text-dark/40"
                >
                  {resetting ? 'Sending reset link…' : 'Forgot your password?'}
                </button>
                <button
                  type="button"
                  onClick={() => (window.location.href = 'mailto:support@nutaria.com')}
                  className="block font-semibold text-olive-dark transition hover:text-olive-dark/90"
                >
                  Get help signing in
                </button>
              </div>
              <div className="text-center text-xs text-text-dark/50">
                <a href="/terms" className="hover:text-text-dark">
                  Terms of use
                </a>{' '}
                ·{' '}
                <a href="/privacy" className="hover:text-text-dark">
                  Privacy Policy
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="hidden w-full overflow-hidden lg:block lg:w-1/2">
          <img
            src="/img/nutaria/Login_art.png"
            alt="Nutaria agricultural operations"
            className="h-full w-full object-cover"
          />
        </div>
      </div>
    </div>
  )
}

export default Login

