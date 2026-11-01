import { useState, useEffect } from "react"
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react"
import { GabayAPI } from "../../services/gabayApi.js"
import { SystemNotice } from "@/components/system-notice"
import { LoginBackground } from "@/components/login-background"
import LogoSvg from "@/assets/Logo.svg"

export default function LoginPage({ onLoginSuccess, initialError = "" }) {
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
      // 1. Attempt login with GabayAPI / Supabase Auth
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
      setError(err.status === 429
        ? err.message
        : err.code === 'invalid_credentials'
          ? "Email or password is incorrect."
          : err.message || "Unable to sign in. Please try again.")
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

          <SystemNotice message={error ? `${error}${remaining > 0 ? ` Retry in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}.` : ''}` : systemNotice} kind={error ? 'error' : 'info'} onClose={() => { setError(''); setSystemNotice('') }} />

          {/* Form */}
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

              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
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

        </div>
      </div>
    </div>
  )
}
