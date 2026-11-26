import { useState, useEffect, useCallback, useRef } from "react"
import { Bell, Check, X, Clock, UserPlus, Calendar, CreditCard, AlertCircle, ShieldCheck, Loader2, ChevronRight } from "lucide-react"
import { Header } from "@/components/header"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { notificationsAPI, navigateToNotification } from "../../services/notifications"

const TYPE_META = {
  appointment: { icon: Calendar, color: "text-[#0284C7]", bgColor: "bg-[#E0F2FE]" },
  payment: { icon: CreditCard, color: "text-emerald-600", bgColor: "bg-emerald-50" },
  patient: { icon: UserPlus, color: "text-[#4C82F7]", bgColor: "bg-indigo-50" },
  reminder: { icon: Clock, color: "text-amber-600", bgColor: "bg-amber-50" },
  admin: { icon: ShieldCheck, color: "text-[#0284C7]", bgColor: "bg-[#E0F2FE]" },
  alert: { icon: AlertCircle, color: "text-rose-500", bgColor: "bg-rose-50" },
}

export function Notifications() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("all")
  const [highlightedIds, setHighlightedIds] = useState(() => new Set())
  const markedSeenRef = useRef(false)
  const highlightTimerRef = useRef(null)

  const loadNotifications = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const items = await notificationsAPI.getClinicNotifications()
      setNotifications(items)
      // Once the user opens the Notifications page and sees unread notifications,
      // highlight them in blue for 10 seconds before fading out, and mark them read in DB.
      const unseenIds = items.filter(n => !n.read).map(n => n.id)
      if (!markedSeenRef.current && unseenIds.length > 0) {
        markedSeenRef.current = true
        setHighlightedIds(new Set(unseenIds))
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
        highlightTimerRef.current = setTimeout(() => {
          setHighlightedIds(new Set())
        }, 10000)
        notificationsAPI.markAllAsRead(items)
      }
    } catch (err) {
      console.error("Failed to load notifications:", err)
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadNotifications(false)
    const unsubscribe = notificationsAPI.subscribeClinicNotifications(() => {
      loadNotifications(true)
    })
    return () => {
      unsubscribe()
      if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current)
    }
  }, [loadNotifications])

  const unreadCount = notifications.filter(n => !n.read).length

  const markAsRead = async (notification) => {
    setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, read: true } : n))
    await notificationsAPI.markAsRead(notification)
  }

  const markAllAsRead = async () => {
    const snapshot = notifications
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    await notificationsAPI.markAllAsRead(snapshot)
  }

  const deleteNotification = async (e, notification) => {
    e.stopPropagation()
    setNotifications(prev => prev.filter(n => n.id !== notification.id))
    await notificationsAPI.deleteNotification(notification)
  }

  const handleNotificationClick = async (notification) => {
    if (!notification.read) {
      await markAsRead(notification)
    }
    navigateToNotification(notification)
  }

  const filteredNotifications = activeTab === "unread"
    ? notifications.filter(n => !n.read)
    : notifications

  return (
    <div className="min-h-screen bg-[#F8FCFF]">
      <Header />
      <div className="container mx-auto px-6 pb-10">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header Section */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-800">Notifications</h1>
              <p className="text-sm text-slate-500 mt-0.5">Live updates for appointments, patients, staff, and clinic reminders</p>
            </div>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                onClick={markAllAsRead}
                className="gap-2 rounded-full border-[#BAE6FD] text-[#0284C7] hover:bg-[#F0F9FF] hover:text-[#0369A1]"
              >
                <Check className="w-4 h-4" />
                Mark all as read
              </Button>
            )}
          </div>

          {/* Notifications List (Scrollable) */}
          <Card className="rounded-2xl border border-[#E0F2FE] bg-white shadow-[0_10px_30px_-10px_rgba(59,165,236,0.12)] overflow-hidden">
            <CardHeader className="bg-[#FAFEFF] border-b border-[#E0F2FE]/80 pb-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2 rounded-full bg-[#E0F2FE]/60 p-1 h-10">
                  <TabsTrigger
                    value="all"
                    className="rounded-full text-sm font-medium data-[state=active]:bg-gradient-to-b data-[state=active]:from-[#55C5F8] data-[state=active]:to-[#3BA5EC] data-[state=active]:text-white data-[state=active]:shadow-sm"
                  >
                    All ({notifications.length})
                  </TabsTrigger>
                  <TabsTrigger
                    value="unread"
                    className="rounded-full text-sm font-medium data-[state=active]:bg-gradient-to-b data-[state=active]:from-[#55C5F8] data-[state=active]:to-[#3BA5EC] data-[state=active]:text-white data-[state=active]:shadow-sm"
                  >
                    Unread ({unreadCount})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="p-5">
              {loading ? (
                <div className="text-center py-12 flex flex-col items-center gap-3 text-slate-400">
                  <Loader2 className="w-7 h-7 animate-spin text-[#3BA5EC]" />
                  <p className="text-sm">Loading live notifications...</p>
                </div>
              ) : filteredNotifications.length === 0 ? (
                <div className="text-center py-14">
                  <div className="w-14 h-14 rounded-full bg-[#F0F9FF] flex items-center justify-center mx-auto mb-3">
                    <Bell className="w-7 h-7 text-[#55C5F8]" />
                  </div>
                  <p className="text-sm font-medium text-slate-600">No notifications to display</p>
                  <p className="text-xs text-slate-400 mt-1">New updates will appear here automatically.</p>
                </div>
              ) : (
                <div className="max-h-[540px] overflow-y-auto pr-2 space-y-3">
                  {filteredNotifications.map((notification) => {
                    const meta = TYPE_META[notification.type] || TYPE_META.appointment
                    const Icon = meta.icon
                    const isHighlighted = !notification.read || highlightedIds.has(notification.id)
                    return (
                      <div
                        key={notification.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleNotificationClick(notification)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            handleNotificationClick(notification)
                          }
                        }}
                        className={`group p-4 rounded-xl border transition-colors duration-1000 cursor-pointer ${
                          isHighlighted
                            ? "bg-[#E0F2FE]/75 border-[#7DD3FC] hover:border-[#3BA5EC]"
                            : "bg-white border-slate-200/80 hover:border-[#7DD3FC] hover:bg-[#FAFEFF]"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`p-2.5 rounded-xl ${meta.bgColor} shrink-0`}>
                            <Icon className={`w-5 h-5 ${meta.color}`} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="font-semibold text-slate-800 text-sm flex items-center flex-wrap gap-2">
                                <span>{notification.title}</span>
                                {isHighlighted && (
                                  <Badge className="bg-gradient-to-b from-[#55C5F8] to-[#3BA5EC] text-white border-0 text-[10px] rounded-full px-2 py-0">
                                    New
                                  </Badge>
                                )}
                              </h4>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 flex-shrink-0 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full"
                                onClick={(e) => deleteNotification(e, notification)}
                                aria-label="Dismiss notification"
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                            <p className="text-sm text-slate-600 mb-2 leading-relaxed">
                              {notification.message}
                            </p>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-400">
                                {notification.time}
                              </span>
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-[#3BA5EC] opacity-80 group-hover:opacity-100 transition-opacity">
                                View details
                                <ChevronRight className="w-3.5 h-3.5" />
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
