import { useState, useMemo } from 'react'
import { Check, Circle, X, Eye, EyeOff } from 'lucide-react'
import { GabayAPI } from '../../services/gabayApi'
import { SystemNotice } from '@/components/system-notice'
import { LoginBackground } from '@/components/login-background'
import LogoSvg from '@/assets/Logo.svg'

export default function ResetPasswordPage() {
  const { tokenHash, email } = useMemo(() => {
    const params = new URLSearchParams(window.location.search)
    return {
      tokenHash: params.get('token_hash') || params.get('token') || '',
      email: params.get('email') || ''
    }
  }, [])

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const requirements = [
    { label: '12-128 characters', met: password.length >= 12 && password.length <= 128 },
    { label: 'One uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter', met: /[a-z]/.test(password) },
    { label: 'One number', met: /[0-9]/.test(password) },
    { label: 'One symbol', met: /[^A-Za-z0-9]/.test(password) }
  ]
  const matches = confirm.length > 0 && password === confirm
  const valid = !!tokenHash && requirements.every(item => item.met) && matches

  const submit = async event => {
    event.preventDefault()
    if (!valid || busy) return
    setBusy(true)
    setError('')
    try {
      await GabayAPI.confirmPasswordReset(tokenHash, password, email)
      sessionStorage.setItem('gabay_system_notice', 'Password reset successful. Sign in with your new password.')
      window.location.replace('/login')
    } catch (err) {
      setError(err.message || 'Could not reset password. Please request a new reset link.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen w-full relative flex items-center justify-center bg-white overflow-hidden px-4 py-12">
      <LoginBackground />
      <div className="relative z-10 w-full max-w-[420px] rounded-[32px] border border-[#E9F4FE] bg-white px-8 py-10 shadow-xl shadow-sky-100">
        <div className="mb-8 flex items-center justify-center gap-3">
          <img src={LogoSvg} alt="" className="h-11 w-11" />
          <span className="text-3xl font-bold text-[#4C82F7]">GabayMed</span>
        </div>

        <h1 className="text-xl font-semibold text-slate-800">Reset your password</h1>

        {!tokenHash ? (
          <div className="mt-5 space-y-5">
            <p className="text-sm text-slate-600 leading-relaxed">
              This password reset link is invalid or incomplete. Please request a new reset link from the login page.
            </p>
            <button
              type="button"
              onClick={() => window.location.replace('/login')}
              className="h-11 w-full rounded-full bg-gradient-to-b from-[#55C5F8] to-[#3BA5EC] font-medium text-white cursor-pointer"
            >
              Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-5">
            <div>
              <label htmlFor="reset-new-password" className="text-sm text-slate-600">New password</label>
              <div className="relative mt-2">
                <input
                  id="reset-new-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  aria-describedby="reset-password-requirements"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="h-11 w-full rounded-lg border border-slate-200 px-3 pr-10 focus:outline-sky-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <ul id="reset-password-requirements" className="mt-3 space-y-1.5 text-xs">
                {requirements.map(item => {
                  const Icon = item.met ? Check : Circle
                  return (
                    <li key={item.label} className={`flex items-center gap-2 ${item.met ? 'text-emerald-600' : 'text-slate-500'}`}>
                      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span className="sr-only">{item.met ? 'Met: ' : 'Required: '}</span>{item.label}
                    </li>
                  )
                })}
              </ul>
            </div>

            <div>
              <label htmlFor="reset-confirm-password" className="text-sm text-slate-600">Confirm password</label>
              <input
                id="reset-confirm-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                required
                maxLength={128}
                aria-describedby="reset-password-match"
                aria-invalid={confirm.length > 0 && !matches}
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                className="mt-2 h-11 w-full rounded-lg border border-slate-200 px-3 focus:outline-sky-400"
              />
              <div id="reset-password-match" aria-live="polite" className="mt-2 text-xs">
                {confirm.length > 0 && (
                  <p className={`flex items-center gap-2 ${matches ? 'text-emerald-600' : 'text-red-500'}`}>
                    {matches ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <X className="h-3.5 w-3.5" aria-hidden="true" />}
                    {matches ? 'Passwords match' : 'Passwords do not match'}
                  </p>
                )}
              </div>
            </div>

            <button
              disabled={!valid || busy}
              className="h-11 w-full rounded-full bg-gradient-to-b from-[#55C5F8] to-[#3BA5EC] font-medium text-white disabled:opacity-50 cursor-pointer"
            >
              {busy ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => window.location.replace('/login')}
          className="mt-5 w-full text-sm text-slate-500 hover:text-slate-700 cursor-pointer"
        >
          Back to login
        </button>
      </div>

      <SystemNotice message={error} kind="error" onClose={() => setError('')} />
    </div>
  )
}
