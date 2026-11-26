import { useState, useEffect } from "react"
import { Eye, EyeOff, Loader2, ArrowLeft, Mail } from "lucide-react"
import { GabayAPI } from "../../services/gabayApi.js"
import { SystemNotice } from "@/components/system-notice"
import { LoginBackground } from "@/components/login-background"
import LogoSvg from "@/assets/Logo.svg"

export default function LoginPage({ onLoginSuccess, initialError = "" }) {
  const [mode, setMode] = useState("login") // "login" | "forgot"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(initialError)
  const [cooldown, setCooldown] = useState(null)
  const [now, setNow] = useState(Date.now())
  const remaining = cooldown?.email === email.trim().toLowerCase()
    ? Math.max(0, Math.ceil((cooldown.until - now) / 1000)) : 0
  useEffect(() => {
    if (!cooldown) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [cooldown])
  const [systemNotice, setSystemNotice] = useState(() => {
    const message = sessionStorage.getItem('gabay_system_notice') || ''
    return message
  })
  useEffect(() => { sessionStorage.removeItem('gabay_system_notice') }, [])
  useEffect(() => { if (initialError) setError(initialError) }, [initialError])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (loading || remaining > 0) return
    setError("")
    setLoading(true)

    try {
      const data = await GabayAPI.login(email, password)
      localStorage.setItem('gabay_last_activity', String(Date.now()))

      localStorage.setItem("gabay_auth", JSON.stringify({
        user: data.user,
        role: data.account.role,
        facilityId: data.account.facility_id,
        loggedAt: new Date().toISOString()
      }))

      if (onLoginSuccess) {
        onLoginSuccess()
      } else {
        window.history.pushState({}, "", "/")
        window.dispatchEvent(new PopStateEvent("popstate"))
      }
    } catch (err) {
      setPassword('')
      if (err.retryAfter > 0) {
        setNow(Date.now())
        setCooldown({ email: email.trim().toLowerCase(), until: Date.now() + err.retryAfter * 1000 })
      }
      if (err.status === 429) {
        setError(err.message)
      } else if (err.code === 'invalid_credentials') {
        if (err.message && err.message.toLowerCase().includes('remaining')) {
          setError(err.message)
        } else if (typeof err.attemptsRemaining === 'number' && err.attemptsRemaining > 0) {
          setError(`Email or password is incorrect. ${err.attemptsRemaining} ${err.attemptsRemaining === 1 ? 'attempt' : 'attempts'} remaining before your account is locked.`)
        } else {
          setError("Email or password is incorrect.")
        }
      } else {
        setError(err.message || "Unable to sign in. Please try again.")
      }
    } finally {
      setLoading(false)
    }
  }

  const handleForgotSubmit = async (e) => {
    e.preventDefault()
    if (loading) return
    setError("")
    setLoading(true)
    try {
      const result = await GabayAPI.requestPasswordReset(email)
      setSystemNotice(result.message || "If an account is registered with that email, a password reset link has been sent.")
      setMode("login")
    } catch (err) {
      setError(err.message || "Could not send password reset link. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-white overflow-hidden select-none">
      <LoginBackground />

      {/* Main Login Card */}
      <div className="relative z-10 w-full max-w-[420px] mx-4 sm:mx-auto">
        <div className="bg-white rounded-[32px] px-8 py-10 sm:px-10 sm:py-12 shadow-[0_15px_45px_-5px_rgba(56,189,248,0.18),0_10px_25px_-5px_rgba(0,0,0,0.06)] border border-[#E9F4FE] transition-all">

          {/* Logo & Brand Name */}
          <div className="flex items-center justify-center gap-3.5 mb-8">
            <img
              src={LogoSvg}
              alt="GabayMed Logo"
              className="w-11 h-11 object-contain drop-shadow-sm"
            />
            <h1 className="text-3xl font-bold tracking-tight text-[#4C82F7] font-sans">
              GabayMed
            </h1>
          </div>

          <SystemNotice
            message={error ? `${error}${remaining > 0 ? ` Retry in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}.` : ''}` : systemNotice}
            kind={error ? 'error' : 'info'}
            onClose={() => { setError(''); setSystemNotice('') }}
          />

          {mode === "forgot" ? (
            <form onSubmit={handleForgotSubmit} className="space-y-5">
              <div className="text-center space-y-1.5">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-[#3BA5EC]">
                  <Mail className="h-5 w-5" />
                </div>
                <h2 className="text-lg font-semibold text-slate-800">Forgot Password</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Enter your registered email address and we will send you a secure link to reset your password.
                </p>
              </div>

              <div className="space-y-1.5 text-left">
                <label
                  htmlFor="reset-email"
                  className="block text-xs font-medium text-slate-500 tracking-wide"
                >
                  Registered Email
                </label>
                <input
                  id="reset-email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@clinic.ph"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full h-11 px-3.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#4C82F7] focus:ring-2 focus:ring-[#4C82F7]/15 transition-all shadow-sm"
                />
              </div>

              <div className="pt-1 space-y-3">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-11 rounded-full text-white font-medium text-sm sm:text-base bg-gradient-to-b from-[#55C5F8] to-[#3BA5EC] hover:from-[#49bdf5] hover:to-[#329ce4] active:scale-[0.99] transition-all shadow-[0_4px_16px_rgba(59,165,236,0.36)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sending Reset Link...</span>
                    </>
                  ) : (
                    <span>Send Reset Link</span>
                  )}
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => { setError(''); setMode("login") }}
                  className="w-full flex items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 py-1 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back to Log In</span>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Email Field */}
              <div className="space-y-1.5 text-left">
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-slate-500 tracking-wide"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full h-11 px-3.5 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#4C82F7] focus:ring-2 focus:ring-[#4C82F7]/15 transition-all shadow-sm"
                />
              </div>

              {/* Password Field */}
              <div className="space-y-1.5 text-left">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-slate-500 tracking-wide"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full h-11 px-3.5 pr-10 rounded-lg border border-slate-200 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#4C82F7] focus:ring-2 focus:ring-[#4C82F7]/15 transition-all shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={() => { setError(''); setMode("forgot") }}
                    className="text-xs font-medium text-[#3BA5EC] hover:text-[#2189d4] hover:underline cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <div className="pt-1">
                <button
                  type="submit"
                  disabled={loading || remaining > 0}
                  className="w-full h-11 rounded-full text-white font-medium text-sm sm:text-base bg-gradient-to-b from-[#55C5F8] to-[#3BA5EC] hover:from-[#49bdf5] hover:to-[#329ce4] active:scale-[0.99] transition-all shadow-[0_4px_16px_rgba(59,165,236,0.36)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Logging in...</span>
                    </>
                  ) : (
                    <span>{remaining > 0 ? `Retry in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}` : 'Log In'}</span>
                  )}
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </div>
  )
}
