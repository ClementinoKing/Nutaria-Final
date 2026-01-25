import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../context/AuthContext'
import { supabase } from '@/lib/supabaseClient'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { cn } from '@/lib/utils'

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
    <div className="flex min-h-screen bg-background">
      <div className="flex w-full flex-col lg:flex-row">
        <div className="flex w-full items-center justify-center px-6 py-16 lg:w-1/2">
          <Card className="w-full max-w-md rounded-2xl border-0 shadow-[0_32px_64px_-32px_rgba(33,37,41,0.35)] dark:shadow-[0_32px_64px_-32px_rgba(0,0,0,0.5)]">
            <CardHeader className="space-y-6 pb-4 pt-10">
              <span className="h-1 w-12 rounded-md bg-olive-dark dark:bg-olive-light" />
            </CardHeader>
            <CardContent className="pb-10">
              <form onSubmit={handleSubmit} className={cn("flex flex-col gap-6")}>
                <FieldGroup>
                  <div className="flex flex-col gap-1 text-left">
                    <h1 className="text-2xl font-bold text-card-foreground">Login to your account</h1>
                    <p className="text-muted-foreground text-sm">
                      Enter your email below to login to your account
                    </p>
                  </div>
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="info@nutaria.co.za"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-14 rounded-xl border-none bg-muted pl-12 text-base text-card-foreground shadow-inner focus-visible:ring-2 focus-visible:ring-primary dark:bg-muted/50"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </Field>
                  <Field>
                    <div className="flex items-center">
                      <FieldLabel htmlFor="password">Password</FieldLabel>
                      <button
                        type="button"
                        onClick={handlePasswordReset}
                        disabled={resetting}
                        className="ml-auto text-sm text-muted-foreground underline-offset-4 hover:text-card-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
                      >
                        {resetting ? 'Sending reset link…' : 'Forgot your password?'}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-14 rounded-xl border-none bg-muted pl-12 pr-12 text-base text-card-foreground shadow-inner focus-visible:ring-2 focus-visible:ring-primary dark:bg-muted/50"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((prev) => !prev)}
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-card-foreground focus:outline-none transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </Field>
                  <Field>
                    <Button
                      type="submit"
                      className="h-14 w-full rounded-xl bg-olive-dark dark:bg-primary text-base font-semibold tracking-wide hover:bg-olive-dark/90 dark:hover:bg-primary/90 text-white dark:text-primary-foreground"
                      disabled={authenticating}
                    >
                      {authenticating ? 'Signing In…' : 'Login'}
                    </Button>
                  </Field>
                  <Field>
                    <FieldDescription className="text-left">
                      Need help?{' '}
                      <button
                        type="button"
                        onClick={() => (window.location.href = 'mailto:support@nutaria.com')}
                        className="font-semibold text-olive-dark dark:text-primary underline underline-offset-4 hover:text-olive-dark/90 dark:hover:text-primary/90 transition-colors"
                      >
                        Get help signing in
                      </button>
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldDescription className="text-left text-xs">
                      <a href="/terms" className="hover:text-card-foreground transition-colors">
                        Terms of use
                      </a>{' '}
                      ·{' '}
                      <a href="/privacy" className="hover:text-card-foreground transition-colors">
                        Privacy Policy
                      </a>
                    </FieldDescription>
                  </Field>
                </FieldGroup>
              </form>
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

