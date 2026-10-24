import { useState, useEffect } from "react"
import { Heart, Bell, Search, User, Settings, ChevronDown, MessageSquare, Calendar, CreditCard, UserPlus, Clock, AlertCircle, Check, LogOut, Building2, MapPin, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { GlobalSearch } from "@/components/global-search"
import { Badge } from "@/components/ui/badge"
import { GabayAPI } from "../../services/gabayApi"
import { profileAPI } from "../../services/profile"
import LogoSvg from "@/assets/Logo.svg"

const notificationsData = [
  {
    id: 1,
    type: "appointment",
    title: "New Appointment Request",
    message: "Red Gabriel Tagura requested appointment",
    time: "5 min ago",
    read: false,
    icon: Calendar,
  },
  {
    id: 2,
    type: "payment",
    title: "Payment Received",
    message: "₱2,500 from Francis Ronan Alfaro",
    time: "15 min ago",
    read: false,
    icon: CreditCard,
  },
  {
    id: 3,
    type: "patient",
    title: "New Patient Registration",
    message: "Tyrone Winter Tolentino registered",
    time: "1 hour ago",
    read: false,
    icon: UserPlus,
  },
  {
    id: 4,
    type: "reminder",
    title: "Appointment Reminder",
    message: "Maria Santos in 30 minutes",
    time: "2 hours ago",
    read: true,
    icon: Clock,
  },
]

export function Header() {
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [notifications, setNotifications] = useState(notificationsData)
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

  const unreadCount = notifications.filter(n => !n.read).length

  const markAsRead = (id) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ))
  }

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })))
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full relative">
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <div className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <div className="flex items-center justify-between px-4 py-3 border-b">
                    <div>
                      <h3 className="font-semibold text-sm">Notifications</h3>
                      <p className="text-xs text-muted-foreground">{unreadCount} unread</p>
                    </div>
                    {unreadCount > 0 && (
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-7 text-xs"
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
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.map((notification) => {
                      const Icon = notification.icon
                      return (
                        <DropdownMenuItem 
                          key={notification.id}
                          className={`p-3 cursor-pointer ${!notification.read ? 'bg-blue-50' : ''}`}
                          onClick={() => markAsRead(notification.id)}
                        >
                          <div className="flex items-start gap-3 w-full">
                            <div className="p-1.5 bg-slate-100 rounded-full flex-shrink-0">
                              <Icon className="w-4 h-4 text-slate-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <p className="font-medium text-xs text-gray-900">
                                  {notification.title}
                                </p>
                                {!notification.read && (
                                  <Badge className="bg-blue-500 hover:bg-blue-600 text-xs h-4 px-1">New</Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {notification.message}
                              </p>
                              <p className="text-xs text-muted-foreground mt-1">
                                {notification.time}
                              </p>
                            </div>
                          </div>
                        </DropdownMenuItem>
                      )
                    })}
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="justify-center text-center">
                    <a href="/notifications" className="text-blue-600 text-sm font-medium w-full">
                      View all notifications
                    </a>
                  </DropdownMenuItem>
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
