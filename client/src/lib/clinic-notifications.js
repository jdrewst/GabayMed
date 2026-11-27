import { useCallback, useEffect, useRef, useState } from "react"
import { supabase } from "../../services/gabayApi"
import { Session } from "../../services/session"
import { useBranch } from "./branch-context"

const changedEvent = "clinicNotificationsChanged"
const emptyInbox = { notifications: [], unreadCount: 0, loading: true, error: false }
let subscriptionId = 0

function inboxQuery(facilityId, branchKey, query) {
  return query.eq("facility_id", facilityId).eq("branch_key", branchKey).eq("is_dismissed", false)
}

export function useClinicNotifications({ limit = 100, unreadOnly = false } = {}) {
  const { selectedBranchId, selectedBranch, loading } = useBranch()
  const branchKey = selectedBranchId === "all" ? "main" : selectedBranch?.branch_id
  const branchName = selectedBranch?.name || "Main"
  const scope = loading ? null : branchKey
  const request = useRef(0)
  const [result, setResult] = useState(null)
  const [actionError, setActionError] = useState(null)

  const refresh = useCallback(async () => {
    if (!scope) return
    const token = ++request.current
    try {
      const facilityId = Session.getFacilityId()
      const applyScope = query => inboxQuery(facilityId, scope, query)
      let list = applyScope(supabase.from("clinic_notifications")
        .select("id, category, title, message, created_at, is_read, branch_key, appointment_date, procedure_code"))
      if (unreadOnly) list = list.eq("is_read", false)
      const [rows, unread] = await Promise.all([
        list.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit),
        applyScope(supabase.from("clinic_notifications").select("id", { count: "exact", head: true })).eq("is_read", false),
      ])
      if (rows.error || unread.error) throw rows.error || unread.error
      if (request.current === token) {
        setResult({ scope, unreadOnly, notifications: rows.data, unreadCount: unread.count ?? 0, loading: false, error: false })
      }
    } catch {
      if (request.current === token) setResult({ ...emptyInbox, scope, unreadOnly, loading: false, error: true })
    }
  }, [scope, limit, unreadOnly])

  useEffect(() => {
    if (!scope) return
    let active = true
    const reload = () => { if (active) refresh() }
    reload()
    const channel = supabase.channel(`clinic-notifications:${++subscriptionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "clinic_notifications", filter: `branch_key=eq.${scope}` }, reload)
      .subscribe(status => { if (status === "SUBSCRIBED") reload() })
    const timer = window.setInterval(reload, 15000)
    window.addEventListener(changedEvent, reload)
    return () => {
      active = false
      request.current++
      window.clearInterval(timer)
      window.removeEventListener(changedEvent, reload)
      void supabase.removeChannel(channel)
    }
  }, [scope, refresh])

  async function update(values, id) {
    if (!scope) return
    setActionError(null)
    try {
      let query = inboxQuery(Session.getFacilityId(), scope, supabase.from("clinic_notifications").update(values))
      query = id ? query.eq("id", id) : query.eq("is_read", false)
      const { error } = await query
      if (error) throw error
      window.dispatchEvent(new Event(changedEvent))
    } catch {
      setActionError(scope)
    }
  }

  const inbox = result?.scope === scope && result?.unreadOnly === unreadOnly ? result : emptyInbox
  return {
    ...inbox,
    branchName,
    loading: loading || (Boolean(scope) && inbox.loading),
    actionError: actionError === scope && scope !== null,
    markAsRead: id => update({ is_read: true }, id),
    dismiss: id => update({ is_read: true, is_dismissed: true }, id),
    refresh,
  }
}

export function formatNotificationTime(timestamp) {
  return new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila",
  }).format(new Date(timestamp))
}

export function appointmentNotificationHref(notification) {
  if (notification.category !== "appointment" || !notification.appointment_date) return null
  const query = new URLSearchParams({ date: notification.appointment_date })
  query.set("branch", notification.branch_key === "main" ? "all" : notification.branch_key)
  return `/appointments?${query}`
}

export function notificationPreview(notification) {
  if (notification.category !== "appointment") return notification.message
  const [summary, ...details] = notification.message.split("\n")
  const separator = summary.indexOf(" | ")
  const patient = separator === -1 ? "" : summary.slice(separator + 3)
  const code = notification.procedure_code ? `Procedure ${notification.procedure_code}` : ""
  const heading = [code, patient].filter(Boolean).join(" | ")
  return [heading, ...details].filter(Boolean).join("\n")
}
