import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle, Download, ExternalLink, FileText, FolderLock, Image as ImageIcon, Loader2,
  RefreshCw, Search, ShieldCheck, ShieldOff, Smartphone, UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { healthRecordsAPI, formatBytes, formatDate } from "../../services/healthRecords"

// Gabay 1.0 Patient Portal: files the patient chose to share from their Gabay app Health Record Vault (US-4.0).
// Read-only. The server decides what is visible; this view re-checks on focus and every minute so a patient's
// change in the app shows up here without a page reload.

const REFRESH_MS = 60_000

const CATEGORY_STYLES = {
  lab_result: "bg-rose-50 text-rose-700 border-rose-200",
  prescription: "bg-violet-50 text-violet-700 border-violet-200",
  imaging: "bg-teal-50 text-teal-700 border-teal-200",
  immunization: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medical_certificate: "bg-amber-50 text-amber-700 border-amber-200",
  consultation: "bg-sky-50 text-sky-700 border-sky-200",
  insurance: "bg-indigo-50 text-indigo-700 border-indigo-200",
  other: "bg-slate-50 text-slate-700 border-slate-200",
}

function FileIcon({ kind, className = "w-5 h-5" }) {
  return kind === "image"
    ? <ImageIcon className={`${className} text-teal-600`} aria-hidden="true" />
    : <FileText className={`${className} text-rose-600`} aria-hidden="true" />
}

function CategoryBadge({ record }) {
  return (
    <Badge variant="outline" className={`font-medium whitespace-nowrap ${CATEGORY_STYLES[record.category] || CATEGORY_STYLES.other}`}>
      {record.categoryLabel}
    </Badge>
  )
}

function StatePanel({ icon: Icon, tone = "slate", title, children, action }) {
  const tones = {
    slate: "bg-slate-100 text-slate-500",
    amber: "bg-amber-100 text-amber-600",
    red: "bg-red-100 text-red-600",
    blue: "bg-blue-100 text-blue-600",
  }
  return (
    <div className="flex flex-col items-center text-center py-12 px-6">
      <div className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 ${tones[tone]}`}>
        <Icon className="w-7 h-7" aria-hidden="true" />
      </div>
      <h3 className="font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">{children}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PatientHealthRecords({ patientId, patientName }) {
  const [data, setData] = useState(null) // last successful response
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [updatedAt, setUpdatedAt] = useState(null)
  const [category, setCategory] = useState("all")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState("") // `${recordId}:${mode}`
  const requestId = useRef(0)

  const firstName = (patientName || "This patient").split(" ")[0]

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!patientId) return
    const id = ++requestId.current
    silent ? setRefreshing(true) : setLoading(true)
    try {
      const result = await healthRecordsAPI.listShared(patientId)
      if (id !== requestId.current) return
      setData(result)
      setError("")
      setUpdatedAt(new Date())
      // Close the detail view if the patient stopped sharing that file.
      setSelected(current => current && result.records?.find(r => r.id === current.id) ? current : null)
    } catch (err) {
      if (id !== requestId.current) return
      // A failed check must never keep showing files the server can no longer confirm are shared.
      setData(null)
      setError(err.message)
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false) }
    }
  }, [patientId])

  useEffect(() => {
    setData(null); setCategory("all"); setQuery(""); setSelected(null); setNotice("")
    load()
  }, [load])

  // Keep visibility in step with the patient's settings in the Gabay app.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") load({ silent: true }) }
    const timer = setInterval(refresh, REFRESH_MS)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [load])

  const records = data?.access === "granted" ? data.records || [] : []

  const categoryCounts = useMemo(() => {
    const counts = {}
    records.forEach(r => { counts[r.category] = (counts[r.category] || 0) + 1 })
    return counts
  }, [records])

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return records.filter(r => {
      if (category !== "all" && r.category !== category) return false
      if (!q) return true
      return [r.title, r.fileName, r.notes, r.categoryLabel].some(v => String(v || "").toLowerCase().includes(q))
    })
  }, [records, category, query])

  const openFile = async (record, mode) => {
    setNotice("")
    setBusy(`${record.id}:${mode}`)
    // Open the tab synchronously so the browser does not treat it as a pop-up.
    const tab = mode === "view" ? window.open("", "_blank") : null
    try {
      const url = await healthRecordsAPI.getFileUrl(patientId, record.id, mode)
      if (mode === "view") {
        if (tab) { tab.opener = null; tab.location.href = url } else window.open(url, "_blank", "noopener")
      } else {
        const link = document.createElement("a")
        link.href = url
        link.rel = "noopener"
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
    } catch (err) {
      tab?.close()
      setNotice(err.message)
      if (err.status === 403 || err.status === 404) {
        setSelected(null)
        load({ silent: true })
      }
    } finally {
      setBusy("")
    }
  }

  const refreshButton = (
    <Button variant="outline" size="sm" onClick={() => load({ silent: true })} disabled={loading || refreshing}>
      <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
      Refresh
    </Button>
  )

  const renderBody = () => {
    if (loading && !data) {
      return (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Checking the patient's sharing permissions…
        </div>
      )
    }
    if (error) {
      return (
        <StatePanel icon={AlertCircle} tone="red" title="Couldn't load shared records" action={refreshButton}>
          {error}
        </StatePanel>
      )
    }
    if (data?.access === "no_account") {
      return (
        <StatePanel icon={Smartphone} tone="slate" title="No Gabay app account linked">
          {firstName} isn't linked to a Gabay patient app account, so there is no Health Record Vault to share from.
        </StatePanel>
      )
    }
    if (data?.access === "restricted") {
      return (
        <StatePanel icon={FolderLock} tone="amber" title="Health records are private">
          {firstName} has restricted health data sharing in the Gabay app. Their files stay hidden until they allow
          sharing again, then shared files appear here automatically.
        </StatePanel>
      )
    }
    if (!records.length) {
      return (
        <StatePanel icon={FileText} tone="blue" title="No files shared yet">
          When {firstName} turns on <span className="font-medium text-gray-700">“Share with my care providers”</span> for a
          file in their Gabay app vault, it will appear here.
        </StatePanel>
      )
    }

    return (
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative lg:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, file or notes"
              className="pl-9"
              aria-label="Search shared records"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            {[{ id: "all", label: "All" }, ...(data.categories || []).filter(c => categoryCounts[c.id])].map(c => {
              const active = category === c.id
              const count = c.id === "all" ? records.length : categoryCounts[c.id]
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategory(c.id)}
                  aria-pressed={active}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    active ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {c.label} <span className={active ? "text-blue-100" : "text-muted-foreground"}>{count}</span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50">
              <TableRow>
                <TableHead className="min-w-[240px]">Document</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Date on record</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Added by</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                    No shared records match your search.
                  </TableCell>
                </TableRow>
              ) : visible.map(record => (
                <TableRow key={record.id} className="cursor-pointer" onClick={() => setSelected(record)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${record.kind === "image" ? "bg-teal-50" : "bg-rose-50"}`}>
                        <FileIcon kind={record.kind} />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate max-w-[260px]">{record.title}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[260px]">{record.fileName}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><CategoryBadge record={record} /></TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(record.recordDate)}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatDate(record.uploadedAt)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatBytes(record.sizeBytes)}</TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{record.source === "facility" ? "Clinic" : "Patient"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" onClick={() => openFile(record, "view")} disabled={!!busy} aria-label={`Open ${record.title}`}>
                      {busy === `${record.id}:view` ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                      <span className="ml-1.5 hidden xl:inline">Open</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => openFile(record, "download")} disabled={!!busy} aria-label={`Download ${record.title}`}>
                      {busy === `${record.id}:download` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      <span className="ml-1.5 hidden xl:inline">Download</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  const status = data?.access === "granted"
    ? { icon: ShieldCheck, text: "Sharing allowed by patient", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    : data?.access === "restricted"
      ? { icon: ShieldOff, text: "Restricted by patient", cls: "bg-amber-50 text-amber-700 border-amber-200" }
      : null

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 space-y-0">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle>Shared Health Records</CardTitle>
            {status && (
              <Badge variant="outline" className={`gap-1 ${status.cls}`}>
                <status.icon className="w-3.5 h-3.5" aria-hidden="true" /> {status.text}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Files {firstName} chose to share from their Gabay app Health Record Vault.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {updatedAt && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Checked {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {refreshButton}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {notice && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}
        {renderBody()}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground border-t pt-3">
          <UserRound className="w-3.5 h-3.5" aria-hidden="true" />
          The patient controls what appears here. Files are read-only, links expire after 2 minutes, and every open or download is logged.
        </p>
      </CardContent>

      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 pr-6">
                  <FileIcon kind={selected.kind} />
                  <span className="truncate">{selected.title}</span>
                </DialogTitle>
              </DialogHeader>
              <dl className="grid grid-cols-[130px_1fr] gap-y-2.5 text-sm">
                <dt className="text-muted-foreground">Category</dt>
                <dd><CategoryBadge record={selected} /></dd>
                <dt className="text-muted-foreground">Date on record</dt>
                <dd>{formatDate(selected.recordDate)}</dd>
                <dt className="text-muted-foreground">Uploaded</dt>
                <dd>{formatDate(selected.uploadedAt)}</dd>
                <dt className="text-muted-foreground">File</dt>
                <dd className="break-all">{selected.fileName} · {formatBytes(selected.sizeBytes)}</dd>
                <dt className="text-muted-foreground">Added by</dt>
                <dd>{selected.source === "facility" ? "Clinic" : "Patient"}</dd>
              </dl>
              {selected.notes && (
                <div className="rounded-md bg-slate-50 p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground mb-1">Patient's notes</p>
                  <p className="text-gray-700 whitespace-pre-wrap">{selected.notes}</p>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => openFile(selected, "download")} disabled={!!busy}>
                  {busy === `${selected.id}:download` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                  Download
                </Button>
                <Button onClick={() => openFile(selected, "view")} disabled={!!busy}>
                  {busy === `${selected.id}:view` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                  Open file
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
