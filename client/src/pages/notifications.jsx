import { useState } from "react"
import { Bell, Check, X, Calendar, CreditCard, FileText, Receipt } from "lucide-react"
import { Header } from "@/components/header"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { appointmentNotificationHref, formatNotificationTime, useClinicNotifications } from "@/lib/clinic-notifications"

const categoryStyles = {
  appointment: { icon: Calendar, color: "text-blue-600", background: "bg-blue-100" },
  billing: { icon: CreditCard, color: "text-green-600", background: "bg-green-100" },
  claim: { icon: FileText, color: "text-violet-600", background: "bg-violet-100" },
  fees: { icon: Receipt, color: "text-amber-700", background: "bg-amber-100" },
}

export function Notifications() {
  const [activeTab, setActiveTab] = useState("all")
  const { notifications, unreadCount, branchName, loading, error, actionError, markAsRead, dismiss, refresh } =
    useClinicNotifications({ unreadOnly: activeTab === "unread" })

  return (
    <div className="flex h-[calc(100dvh+3rem)] min-h-[32rem] flex-col">
      <div className="shrink-0">
        <Header />
      </div>
      <main className="flex min-h-0 flex-1 flex-col bg-slate-50 p-6">
        <div className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col gap-6">
          {/* Header Section */}
          <div className="flex shrink-0 items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
              <p className="text-muted-foreground">{branchName}</p>
            </div>
            {unreadCount > 0 && (
              <Button 
                variant="outline" 
                onClick={() => markAsRead()}
                className="gap-2"
              >
                <Check className="w-4 h-4" />
                Mark all as read
              </Button>
            )}
          </div>

          {/* Stats Card */}
          <Card className="shrink-0 bg-gradient-to-br from-blue-50 to-white border-blue-100">
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

          {actionError && <p role="alert" className="text-sm text-red-700">Unable to update the notification. Try again.</p>}

          {/* Notifications List */}
          <Card className="flex min-h-0 flex-col">
            <CardHeader className="shrink-0">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="all">
                    All
                  </TabsTrigger>
                  <TabsTrigger value="unread">
                    Unread ({unreadCount})
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="min-h-0 overflow-y-auto" role="region" aria-label="Notifications list" tabIndex={0}>
              {loading ? (
                <p className="py-12 text-center text-muted-foreground">Loading notifications...</p>
              ) : error ? (
                <div role="alert" className="py-12 text-center">
                  <p className="mb-2 text-sm text-muted-foreground">Unable to load notifications.</p>
                  <Button variant="outline" onClick={refresh}>Try again</Button>
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
                  <p className="text-muted-foreground">{activeTab === "unread" ? "No unread notifications." : "No notifications for this branch yet."}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notification) => {
                    const { icon: Icon, color, background } = categoryStyles[notification.category]
                    const href = appointmentNotificationHref(notification)
                    return (
                      <div
                        key={notification.id}
                        className={`relative p-4 rounded-lg border transition-colors ${
                          notification.is_read
                            ? "bg-white border-slate-200" 
                            : "bg-blue-50 border-blue-200"
                        }`}
                      >
                        {href && <a
                          href={href}
                          aria-label={`Open appointment calendar for ${notification.appointment_date}`}
                          className="absolute inset-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"
                          onClick={() => !notification.is_read && markAsRead(notification.id)}
                        />}
                        <div className="flex items-start gap-4">
                          <div className={`p-2 rounded-full ${background}`}>
                            <Icon className={`w-5 h-5 ${color}`} />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="font-semibold text-gray-900 text-sm">
                                {notification.title}
                                {!notification.is_read && (
                                  <Badge className="ml-2 bg-blue-500 hover:bg-blue-600">New</Badge>
                                )}
                              </h4>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="relative h-6 w-6 flex-shrink-0"
                                aria-label="Dismiss notification"
                                onClick={() => dismiss(notification.id)}
                              >
                                <X className="w-4 h-4" />
                              </Button>
                            </div>
                            <p className="mb-2 whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">
                              {notification.message}
                            </p>
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">
                                {formatNotificationTime(notification.created_at)}
                              </span>
                              {!notification.is_read && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="relative h-7 text-xs"
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
      </main>
    </div>
  )
}
