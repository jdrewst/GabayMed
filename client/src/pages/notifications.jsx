import { useState } from "react"
import { Bell, Check, X, Clock, UserPlus, Calendar, CreditCard, AlertCircle } from "lucide-react"
import { Header } from "@/components/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const notificationsData = [
  {
    id: 1,
    type: "appointment",
    title: "New Appointment Request",
    message: "Red Gabriel Tagura has requested an appointment for tomorrow at 10:00 AM",
    time: "5 minutes ago",
    read: false,
    icon: Calendar,
    color: "text-blue-500",
    bgColor: "bg-blue-50",
  },
  {
    id: 2,
    type: "payment",
    title: "Payment Received",
    message: "Payment of ₱2,500 received from Francis Ronan Alfaro",
    time: "15 minutes ago",
    read: false,
    icon: CreditCard,
    color: "text-green-500",
    bgColor: "bg-green-50",
  },
  {
    id: 3,
    type: "patient",
    title: "New Patient Registration",
    message: "Tyrone Winter Tolentino has completed registration",
    time: "1 hour ago",
    read: false,
    icon: UserPlus,
    color: "text-purple-500",
    bgColor: "bg-purple-50",
  },
  {
    id: 4,
    type: "reminder",
    title: "Appointment Reminder",
    message: "Maria Santos has an appointment in 30 minutes",
    time: "2 hours ago",
    read: true,
    icon: Clock,
    color: "text-orange-500",
    bgColor: "bg-orange-50",
  },
  {
    id: 5,
    type: "alert",
    title: "Insurance Verification Required",
    message: "Philhealth coverage for John Dela Cruz needs verification",
    time: "3 hours ago",
    read: true,
    icon: AlertCircle,
    color: "text-red-500",
    bgColor: "bg-red-50",
  },
  {
    id: 6,
    type: "appointment",
    title: "Appointment Confirmed",
    message: "Anna Reyes confirmed her appointment for December 1, 2025",
    time: "5 hours ago",
    read: true,
    icon: Calendar,
    color: "text-blue-500",
    bgColor: "bg-blue-50",
  },
]

export function Notifications() {
  const [notifications, setNotifications] = useState(notificationsData)
  const [activeTab, setActiveTab] = useState("all")

  const unreadCount = notifications.filter(n => !n.read).length

  const markAsRead = (id) => {
    setNotifications(notifications.map(n => 
      n.id === id ? { ...n, read: true } : n
    ))
  }

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })))
  }

  const deleteNotification = (id) => {
    setNotifications(notifications.filter(n => n.id !== id))
  }

  const filteredNotifications = activeTab === "unread" 
    ? notifications.filter(n => !n.read)
    : notifications

  return (
    <>
      <Header />
      <div className="p-6 bg-slate-50 min-h-screen">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header Section */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
              <p className="text-muted-foreground">Stay updated with your clinic activities</p>
            </div>
            {unreadCount > 0 && (
              <Button 
                variant="outline" 
                onClick={markAllAsRead}
                className="gap-2"
              >
                <Check className="w-4 h-4" />
                Mark all as read
              </Button>
            )}
          </div>

          {/* Stats Card */}
          <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-full">
                  <Bell className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Unread Notifications</p>
                  <h3 className="text-3xl font-bold text-gray-900">{unreadCount}</h3>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Notifications List */}
          <Card>
            <CardHeader>
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="all">
                    All ({notifications.length})
                  </TabsTrigger>
                  <TabsTrigger value="unread">
                    Unread ({unreadCount})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
              {filteredNotifications.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">No notifications to display</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredNotifications.map((notification) => {
                    const Icon = notification.icon
                    return (
                      <div
                        key={notification.id}
                        className={`p-4 rounded-lg border transition-colors ${
                          notification.read 
                            ? "bg-white border-slate-200" 
                            : "bg-blue-50 border-blue-200"
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`p-2 rounded-full ${notification.bgColor}`}>
                            <Icon className={`w-5 h-5 ${notification.color}`} />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="font-semibold text-gray-900 text-sm">
                                {notification.title}
                                {!notification.read && (
                                  <Badge className="ml-2 bg-blue-500 hover:bg-blue-600">New</Badge>
                                )}
                              </h4>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 flex-shrink-0"
                                onClick={() => deleteNotification(notification.id)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                            <p className="text-sm text-muted-foreground mb-2">
                              {notification.message}
                            </p>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {notification.time}
                              </span>
                              {!notification.read && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => markAsRead(notification.id)}
                                >
                                  <Check className="w-3 h-3 mr-1" />
                                  Mark as read
                                </Button>
                              )}
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
    </>
  )
}
