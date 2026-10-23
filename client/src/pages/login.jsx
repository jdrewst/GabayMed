import { useState } from "react"
import { Eye, EyeOff, Loader2, AlertCircle } from "lucide-react"
import { GabayAPI } from "../../services/gabayApi.js"
import LogoSvg from "@/assets/Logo.svg"

export default function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    try {
      // 1. Attempt login with GabayAPI / Supabase Auth
      const data = await GabayAPI.login(email, password)
      
      // Store session info
      if (data?.session) {
        localStorage.setItem("gabay_auth", JSON.stringify({
          user: data.user,
          accessToken: data.session.access_token,
          loggedAt: new Date().toISOString()
        }))
      } else {
        localStorage.setItem("gabay_auth", JSON.stringify({
          email,
          loggedAt: new Date().toISOString()
        }))
      }

      if (onLoginSuccess) {
        onLoginSuccess()
      } else {
        window.history.pushState({}, "", "/")
        window.dispatchEvent(new PopStateEvent("popstate"))
      }
    } catch (err) {
      console.warn("Supabase login returned an error:", err)
      
      // If development/demo test credentials, allow smooth transition with demo feedback
      if (email && password) {
        // Check if error is invalid credentials or connection issue
        setError(err.message || "Invalid login credentials. Please try again.")
      } else {
        setError("Please enter both email and password.")
      }
    } finally {
      setLoading(false)
    }
  }

  // Quick bypass / demo login for immediate UI review
  const handleDemoLogin = () => {
    localStorage.setItem("gabay_auth", JSON.stringify({
      email: "doctor@gabaymed.ph",
      role: "admin",
      isDemo: true,
      loggedAt: new Date().toISOString()
    }))

    if (onLoginSuccess) {
      onLoginSuccess()
    } else {
      window.history.pushState({}, "", "/")
      window.dispatchEvent(new PopStateEvent("popstate"))
    }
  }

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-white overflow-hidden select-none">
      {/* Top Wave Graphic Header */}
      <div className="absolute top-0 left-0 right-0 w-full overflow-hidden leading-none pointer-events-none z-0">
        <svg
          viewBox="0 0 1440 380"
          className="w-full h-[260px] sm:h-[320px] md:h-[380px] object-cover"
          preserveAspectRatio="none"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="waveGradient" x1="0%" y1="0%" x2="100%" y2="80%">
              <stop offset="0%" stopColor="#55C9FD" />
              <stop offset="50%" stopColor="#6FD2FD" />
              <stop offset="100%" stopColor="#8BE0FE" />
            </linearGradient>
            <filter id="softGlow" x="-5%" y="-5%" width="110%" height="115%">
              <feDropShadow dx="0" dy="8" stdDeviation="14" floodColor="#38bdf8" floodOpacity="0.22" />
            </filter>
          </defs>
          
          {/* Main Soft Top Wave */}
          <path
            d="M0 0H1440V180C1320 250 1180 270 1020 220C860 170 700 160 520 220C360 275 180 265 0 180V0Z"
            fill="url(#waveGradient)"
            filter="url(#softGlow)"
          />
          {/* Ambient curve matching provided mockup */}
          <path
            d="M0 0H1440V160C1290 230 1140 255 980 200C820 145 660 155 490 215C320 275 160 255 0 165V0Z"
            fill="url(#waveGradient)"
            opacity="0.9"
          />
        </svg>
      </div>

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

          {/* Error Message if any */}
          {error && (
            <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200/80 text-red-600 text-xs flex items-start gap-2 animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{error}</p>
              </div>
            </div>
          )}

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
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-full text-white font-medium text-sm sm:text-base bg-gradient-to-b from-[#55C5F8] to-[#3BA5EC] hover:from-[#49bdf5] hover:to-[#329ce4] active:scale-[0.99] transition-all shadow-[0_4px_16px_rgba(59,165,236,0.36)] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Logging in...</span>
                  </>
                ) : (
                  <span>Log In</span>
                )}
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  )
}
