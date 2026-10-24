import { useState, useEffect } from 'react'
import { GabayAPI } from '../services/gabayApi'
import LoginPage from './pages/login'
import DashboardPage from './pages/dashboard'
import PatientsPage from './pages/patients'
import AppointmentsPage from './pages/appointments'
import CarriersPage from './pages/carriers'
import SettingsPage from './pages/settings'
import ProfilePage from './pages/profile'
import { Messages } from './pages/messages'
import { Notifications } from './pages/notifications'

function App() {
  const [currentPage, setCurrentPage] = useState(() => {
    const path = typeof window !== 'undefined' ? window.location.pathname : '/'
    const hasAuth = typeof window !== 'undefined' ? !!localStorage.getItem('gabay_auth') : false
    
    if (path === '/login') return 'login'
    if (path === '/patients') return 'patients'
    if (path === '/appointments') return 'appointments'
    if (path === '/carriers') return 'carriers'
    if (path === '/settings') return 'settings'
    if (path === '/profile') return 'profile'
    if (path === '/messages') return 'messages'
    if (path === '/notifications') return 'notifications'
    
    // If not authenticated and visiting root, show login first
    if (!hasAuth && path === '/') return 'login'
    return 'dashboard'
  })

  const [access, setAccess] = useState({ loading: true, account: null, error: '' })
  useEffect(() => {
    if (currentPage === 'login') return
    let active = true
    setAccess({ loading: true, account: null, error: '' })
    GabayAPI.getClinicAccount().then(account => {
      if (active) setAccess({ loading: false, account, error: '' })
    }).catch(error => {
      if (active) setAccess({ loading: false, account: null, error: error.message })
    })
    return () => { active = false }
  }, [currentPage])

  // Simple client-side routing
  useEffect(() => {
    const resolvePage = () => {
      const path = window.location.pathname
      const hasAuth = !!localStorage.getItem('gabay_auth')

      if (path === '/login') setCurrentPage('login')
      else if (path === '/patients') setCurrentPage('patients')
      else if (path === '/appointments') setCurrentPage('appointments')
      else if (path === '/carriers') setCurrentPage('carriers')
      else if (path === '/settings') setCurrentPage('settings')
      else if (path === '/profile') setCurrentPage('profile')
      else if (path === '/messages') setCurrentPage('messages')
      else if (path === '/notifications') setCurrentPage('notifications')
      else {
        if (!hasAuth && path === '/') {
          setCurrentPage('login')
        } else {
          setCurrentPage('dashboard')
        }
      }
    }

    resolvePage()
  }, [])

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname
      const hasAuth = !!localStorage.getItem('gabay_auth')

      if (path === '/login') setCurrentPage('login')
      else if (path === '/patients') setCurrentPage('patients')
      else if (path === '/appointments') setCurrentPage('appointments')
      else if (path === '/carriers') setCurrentPage('carriers')
      else if (path === '/settings') setCurrentPage('settings')
      else if (path === '/profile') setCurrentPage('profile')
      else if (path === '/messages') setCurrentPage('messages')
      else if (path === '/notifications') setCurrentPage('notifications')
      else {
        if (!hasAuth && path === '/') {
          setCurrentPage('login')
        } else {
          setCurrentPage('dashboard')
        }
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Handle client-side anchor clicks
  useEffect(() => {
    const handleClick = (e) => {
      const anchor = e.target.closest('a')
      if (anchor && anchor.href && anchor.href.startsWith(window.location.origin)) {
        e.preventDefault()
        const path = new URL(anchor.href).pathname
        window.history.pushState({}, '', path)
        
        if (path === '/login') setCurrentPage('login')
        else if (path === '/patients') setCurrentPage('patients')
        else if (path === '/appointments') setCurrentPage('appointments')
        else if (path === '/carriers') setCurrentPage('carriers')
        else if (path === '/settings') setCurrentPage('settings')
        else if (path === '/profile') setCurrentPage('profile')
        else if (path === '/messages') setCurrentPage('messages')
        else if (path === '/notifications') setCurrentPage('notifications')
        else setCurrentPage('dashboard')
      }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const handleLoginSuccess = () => {
    window.history.pushState({}, '', '/')
    window.location.assign('/')
  }

  if (currentPage !== 'login') {
    if (access.loading) return <div className="p-8 text-center">Checking your account...</div>
    if (!access.account) return <LoginPage onLoginSuccess={handleLoginSuccess} initialError={access.error} />
  }

  return (
    <div className="min-h-screen bg-background">
      {currentPage === 'login' && <LoginPage onLoginSuccess={handleLoginSuccess} />}
      {currentPage === 'dashboard' && <DashboardPage />}
      {currentPage === 'patients' && <PatientsPage />}
      {currentPage === 'appointments' && <AppointmentsPage />}
      {currentPage === 'carriers' && <CarriersPage />}
      {currentPage === 'settings' && <SettingsPage />}
      {currentPage === 'profile' && <ProfilePage />}
      {currentPage === 'messages' && <Messages />}
      {currentPage === 'notifications' && <Notifications />}
    </div>
  )
}

export default App

