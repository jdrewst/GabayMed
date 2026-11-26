import { useState, useEffect, useCallback, useRef } from "react"
import { Heart, Bell, Search, User, Settings, ChevronDown, MessageSquare, Calendar, CreditCard, UserPlus, Clock, AlertCircle, Check, LogOut, Building2, MapPin, Mail, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { GlobalSearch } from "@/components/global-search"
import { Badge } from "@/components/ui/badge"
import { GabayAPI } from "../../services/gabayApi"
import { profileAPI } from "../../services/profile"
import { notificationsAPI, navigateToNotification } from "../../services/notifications"
import LogoSvg from "@/assets/Logo.svg"

const HEADER_NOTIF_ICONS = {
  appointment: Calendar,
  payment: CreditCard,
  patient: UserPlus,
  reminder: Clock,
  admin: ShieldCheck,
  alert: AlertCircle,
}

export function Header() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [notifications, setNotifications] = useState([])
  const [highlightedIds, setHighlightedIds] = useState(() => new Set())
  const highlightTimerRef = useRef(null)
  const [facility, setFacility] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('gabay_facility_data')
        if (cached) return JSON.parse(cached)
      } catch (e) {}
    }
    return null
  })

  useEffect(() => {
    const fetchFacilityDetails = async () => {
      try {
        const data = await profileAPI.getFacilityProfile()
        if (data) {
          setFacility(data)
        }
      } catch (error) {
        console.error("Failed to fetch facility details for header:", error)
      }
    }

    fetchFacilityDetails()

    const handleFacilityUpdated = (e) => {
      if (e.detail) {
        setFacility(prev => ({ ...prev, ...e.detail }))
      } else {
        fetchFacilityDetails()
      }
    }

    window.addEventListener('facilityUpdated', handleFacilityUpdated)
    return () => {
      window.removeEventListener('facilityUpdated', handleFacilityUpdated)
    }
  }, [])

  const loadNotifications = useCallback(async () => {
    try {
      const items = await notificationsAPI.getClinicNotifications()
      setNotifications(items)
    } catch {}
  }, [])

  useEffect(() => {
    loadNotifications()
    const unsubscribe = notificationsAPI.subscribeClinicNotifications(() => {
      loadNotifications()
    })
    return () => {
      unsubscribe()
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    }
  }, [loadNotifications])

  const unreadCount = notifications.filter(n => !n.read).length

  const triggerHighlightFade = (ids) => {
    if (!ids || ids.length === 0) return
    setHighlightedIds(new Set(ids))
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    highlightTimerRef.current = setTimeout(() => {
      setHighlightedIds(new Set())
    }, 10000)
  }

  const markAsRead = async (notification) => {
    setNotifications(prev => prev.map(n =>
      n.id === notification.id ? { ...n, read: true } : n
    ))
    await notificationsAPI.markAsRead(notification)
  }

  const markAllAsRead = async () => {
    const snapshot = notifications
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    await notificationsAPI.markAllAsRead(snapshot)
  }

  useEffect(() => {
    // Get current page from URL
    const path = window.location.pathname
    if (path === '/patients') setCurrentPage('patients')
    else if (path === '/appointments') setCurrentPage('appointments')
    else if (path === '/carriers') setCurrentPage('carriers')
    else if (path === '/settings') setCurrentPage('settings')
    else setCurrentPage('dashboard')

    // Listen for navigation changes
    const handleLocationChange = () => {
      const path = window.location.pathname
      if (path === '/patients') setCurrentPage('patients')
      else if (path === '/appointments') setCurrentPage('appointments')
      else if (path === '/carriers') setCurrentPage('carriers')
      else if (path === '/settings') setCurrentPage('settings')
      else setCurrentPage('dashboard')
    }

    window.addEventListener('popstate', handleLocationChange)
    
    // Also listen for custom event from App.jsx navigation
    const observer = new MutationObserver(handleLocationChange)
    observer.observe(document, { subtree: true, childList: true })

    return () => {
      window.removeEventListener('popstate', handleLocationChange)
      observer.disconnect()
    }
  }, [])

  const isHomeActive = currentPage === 'dashboard' || currentPage === 'carriers'
  const isPatientsActive = currentPage === 'patients'
  const isAppointmentsActive = currentPage === 'appointments'

  return (
    <header className="py-6">
      <div className="container mx-auto px-6">
        <div className="bg-[#FAFEFF] rounded-full shadow-sm border px-6 py-3">
          <div className="flex items-center justify-between">
            <a href="/" className="flex items-center">
              <img src={LogoSvg} alt="GabayMed" className="w-10 h-10" />
            </a>

            <div className="flex items-center gap-2">
              <nav className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button 
                      variant="ghost" 
                      style={isHomeActive ? { background: 'linear-gradient(180deg, #A8D5FF 0%, #7AB8E8 100%)' } : {background: '#F4F4F4'}}
                      className={`rounded-full px-6 ${isHomeActive ? "text-white hover:opacity-90" : ""}`}
                    >
                      Home
                      <ChevronDown className="w-4 h-4 ml-1" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem asChild>
                      <a href="/">Overview</a>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a href="/carriers">Carrier</a>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button 
                  variant="ghost" 
                  asChild
                  style={isPatientsActive ? { background: 'linear-gradient(180deg, #A8D5FF 0%, #7AB8E8 100%)' } : {background: '#F4F4F4'}}
                  className={`rounded-full px-6 ${isPatientsActive ? "text-white hover:opacity-90" : ""}`}
                >
                  <a href="/patients">Patient</a>
                </Button>

                <Button 
                  variant="ghost" 
                  asChild
                  style={isAppointmentsActive ? { background: 'linear-gradient(180deg, #A8D5FF 0%, #7AB8E8 100%)' } : {background: '#F4F4F4'}}
                  className={`rounded-full px-6 ${isAppointmentsActive ? "text-white hover:opacity-90" : ""}`}
                >
                  <a href="/appointments">Appointments</a>
                </Button>
              </nav>

              <GlobalSearch />
            </div>

            <div className="flex items-center gap-3">
              <a href="/messages">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <MessageSquare className="w-5 h-5" />
                </Button>
              </a>

              <DropdownMenu
                onOpenChange={(open) => {
                  if (open && unreadCount > 0) {
                    const unseenIds = notifications.filter(n => !n.read).map(n => n.id)
                    triggerHighlightFade(unseenIds)
                    markAllAsRead()
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full relative hover:bg-sky-50">
                    <Bell className="w-5 h-5 text-slate-700" />
                    {unreadCount > 0 && (
                      <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 ring-2 ring-white" />
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-80 sm:w-96 p-0 overflow-hidden rounded-2xl border border-[#BAE6FD]/80 bg-white shadow-[0_18px_45px_-10px_rgba(59,165,236,0.22)]"
                >
                  <div className="flex items-center justify-between px-4 py-3.5 bg-gradient-to-r from-[#F0F9FF] to-[#E0F2FE]/60 border-b border-[#E0F2FE]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-b from-[#55C5F8] to-[#3BA5EC] flex items-center justify-center shadow-sm">
                        <Bell className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm text-slate-800">Notifications</h3>
                        <p className="text-[11px] text-slate-500">
                          {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
                        </p>
                      </div>
                    </div>
                    {unreadCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-[#0284C7] hover:text-[#0369A1] hover:bg-sky-100/70 rounded-full px-2.5"
                        onClick={(e) => {
                          e.stopPropagation()
                          markAllAsRead()
                        }}
                      >
                        <Check className="w-3 h-3 mr-1" />
                        Mark all read
                      </Button>
                    )}
                  </div>
                  <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-400">
                        No notifications yet
                      </div>
                    ) : notifications.map((notification) => {
                      const Icon = HEADER_NOTIF_ICONS[notification.type] || Calendar
                      const isHighlighted = !notification.read || highlightedIds.has(notification.id)
                      return (
                        <DropdownMenuItem
                          key={notification.id}
                          className={`p-3.5 cursor-pointer rounded-none focus:bg-[#E0F2FE]/60 transition-colors duration-1000 ${isHighlighted ? 'bg-[#E0F2FE]/75' : 'bg-white'}`}
                          onClick={() => {
                            markAsRead(notification)
                            navigateToNotification(notification)
                          }}
                        >
                          <div className="flex items-start gap-3 w-full">
                            <div className="p-2 bg-[#E0F2FE] rounded-full flex-shrink-0">
                              <Icon className="w-4 h-4 text-[#0284C7]" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-semibold text-xs text-slate-800 leading-snug">
                                  {notification.title}
                                </p>
                                {isHighlighted && (
                                  <Badge className="bg-gradient-to-b from-[#55C5F8] to-[#3BA5EC] text-white border-0 text-[10px] h-4 px-1.5 rounded-full">New</Badge>
                                )}
                              </div>
                              <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                                {notification.message}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-1">
                                {notification.time}
                              </p>
                            </div>
                          </div>
                        </DropdownMenuItem>
                      )
                    })}
                  </div>
                  <div className="border-t border-[#E0F2FE] bg-[#FAFEFF] p-2">
                    <DropdownMenuItem asChild className="justify-center text-center rounded-full focus:bg-sky-50">
                      <a href="/notifications" className="text-[#3BA5EC] hover:text-[#0284C7] text-xs font-semibold w-full py-1">
                        View all notifications
                      </a>
                    </DropdownMenuItem>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full p-0">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src="/caring-doctor.png" alt="User" />
                      <AvatarFallback>{facility?.abbreviation || 'DR'}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {/* Facility Details Header */}
                  <div className="px-3 py-2.5 bg-slate-50/80 border-b border-slate-100 rounded-t-md -mt-1 -mx-1 mb-1">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                        {facility?.abbreviation || <Building2 className="w-4 h-4 text-blue-600" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {facility?.clinicName || facility?.name || 'Medical Center'}
                        </p>
                        {facility?.address && (
                          <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 shrink-0 text-slate-400" />
                            <span className="truncate">{facility.address}</span>
                          </p>
                        )}
                        {facility?.email && (
                          <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3 shrink-0 text-slate-400" />
                            <span className="truncate">{facility.email}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <DropdownMenuItem asChild>
                    <a href="/profile" className="flex items-center gap-2 cursor-pointer">
                      <User className="w-4 h-4 text-slate-500" />
                      <span className="truncate font-medium">{facility?.clinicName || facility?.name || 'Facility Profile'}</span>
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <a href="/settings" className="flex items-center gap-2 cursor-pointer">
                      <Settings className="w-4 h-4 text-slate-500" />
                      Settings
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={async () => {
                      await GabayAPI.logout()
                      localStorage.removeItem('gabay_auth')
                      localStorage.removeItem('gabay_facility_data')
                      window.history.pushState({}, '', '/login')
                      window.dispatchEvent(new PopStateEvent('popstate'))
                    }}
                    className="flex items-center gap-2 text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    Log Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
