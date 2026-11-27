import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  AlertCircle, CheckCircle2, Download, ExternalLink, FileText, FolderLock, Image as ImageIcon, Loader2,
  Plus, RefreshCw, Search, ShieldCheck, ShieldOff, Smartphone, Trash2, Upload, UserRound,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  healthRecordsAPI,
  RECORD_CATEGORIES,
  formatBytes,
  formatDate,
  validateFile,
} from "../../services/healthRecords"

// Gabay 1.0 Patient Portal: files the patient chose to share from their Gabay app Health Record Vault (US-4.0)
// plus clinic-uploaded records (lab results, imaging, prescriptions, etc.) that providers can share with the patient's mobile app.

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

function stripExtension(name) {
  return String(name || "").replace(/\.[a-z0-9]{1,5}$/i, "").slice(0, 120)
}

function todayIso() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
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
  const [successMsg, setSuccessMsg] = useState("")
  const [updatedAt, setUpdatedAt] = useState(null)
  const [category, setCategory] = useState("all")
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState("") // `${recordId}:${mode}`

  // Add / Upload Health Record Modal state
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [pickedFile, setPickedFile] = useState(null)
  const [uploadTitle, setUploadTitle] = useState("")
  const [uploadCategory, setUploadCategory] = useState("lab_result")
  const [uploadDate, setUploadDate] = useState(() => todayIso())
  const [uploadNotes, setUploadNotes] = useState("")
  const [shareWithPatient, setShareWithPatient] = useState(true)
  const [uploadError, setUploadError] = useState("")
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef(null)

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
      setSelected(current => {
        if (!current) return null
        const fresh = result.records?.find(r => r.id === current.id)
        return fresh || null
      })
    } catch (err) {
      if (id !== requestId.current) return
      setData(null)
      setError(err.message)
    } finally {
      if (id === requestId.current) { setLoading(false); setRefreshing(false) }
    }
  }, [patientId])

  useEffect(() => {
    setData(null); setCategory("all"); setQuery(""); setSelected(null); setNotice(""); setSuccessMsg("")
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

  const records = data?.records || []

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

  const openAddDialog = () => {
    setPickedFile(null)
    setUploadTitle("")
    setUploadCategory("lab_result")
    setUploadDate(todayIso())
    setUploadNotes("")
    setShareWithPatient(true)
    setUploadError("")
    setIsAddOpen(true)
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const problem = validateFile(file)
    if (problem) {
      setUploadError(problem)
      return
    }
    setUploadError("")
    setPickedFile(file)
    if (!uploadTitle.trim()) {
      setUploadTitle(stripExtension(file.name))
    }
  }

  const handleUploadSubmit = async (e) => {
    e?.preventDefault()
    if (!pickedFile) {
      setUploadError("Please select a file (PDF, JPG, PNG, HEIC, or WEBP up to 10 MB).")
      return
    }
    if (!uploadTitle.trim()) {
      setUploadError("Please enter a document title.")
      return
    }
    if (!uploadCategory) {
      setUploadError("Please select a category.")
      return
    }

    setUploadError("")
    setUploading(true)
    try {
      const created = await healthRecordsAPI.uploadClinicRecord(patientId, pickedFile, {
        title: uploadTitle.trim(),
        category: uploadCategory,
        recordDate: uploadDate || null,
        notes: uploadNotes.trim(),
        shareWithPatient,
      })
      setIsAddOpen(false)
      setSuccessMsg(
        shareWithPatient
          ? `"${created.title}" uploaded and shared with ${firstName}'s mobile app.`
          : `"${created.title}" uploaded (visible to clinic staff only).`
      )
      setTimeout(() => setSuccessMsg(""), 5000)
      await load({ silent: true })
    } catch (err) {
      setUploadError(err.message || "Could not upload health record.")
    } finally {
      setUploading(false)
    }
  }

  const handleTogglePatientVisibility = async (record) => {
    if (!record || record.source !== "facility") return
    const nextShare = !record.shareWithProviders
    setBusy(`${record.id}:share`)
    setNotice("")
    try {
      const updated = await healthRecordsAPI.updateClinicRecord(patientId, record.id, {
        shareWithPatient: nextShare,
      })
      setData(prev => prev ? {
        ...prev,
        records: (prev.records || []).map(r => (r.id === updated.id ? updated : r)),
      } : prev)
      setSelected(curr => (curr && curr.id === updated.id ? updated : curr))
      setSuccessMsg(
        nextShare
          ? `"${updated.title}" is now visible on ${firstName}'s mobile app.`
          : `"${updated.title}" is now hidden from ${firstName}'s mobile app.`
      )
      setTimeout(() => setSuccessMsg(""), 4000)
    } catch (err) {
      setNotice(err.message || "Could not update mobile app visibility.")
    } finally {
      setBusy("")
    }
  }

  const handleDeleteClinicRecord = async (record) => {
    if (!record || record.source !== "facility") return
    if (!window.confirm(`Delete "${record.title}"? This will also remove it from the patient's mobile app.`)) {
      return
    }
    setBusy(`${record.id}:delete`)
    setNotice("")
    try {
      await healthRecordsAPI.deleteClinicRecord(patientId, record.id)
      setData(prev => prev ? {
        ...prev,
        records: (prev.records || []).filter(r => r.id !== record.id),
      } : prev)
      if (selected?.id === record.id) setSelected(null)
      setSuccessMsg(`"${record.title}" was deleted.`)
      setTimeout(() => setSuccessMsg(""), 4000)
    } catch (err) {
      setNotice(err.message || "Could not delete this health record.")
    } finally {
      setBusy("")
    }
  }

  const openFile = async (record, mode) => {
    setNotice("")
    setBusy(`${record.id}:${mode}`)
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

  const addRecordButton = (
    <Button size="sm" onClick={openAddDialog} className="bg-[#0284C7] hover:bg-[#0369A1] text-white">
      <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
      Add Health Record
    </Button>
  )

  const renderBody = () => {
    if (loading && !data) {
      return (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground" role="status">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Checking health records and sharing permissions…
        </div>
      )
    }
    if (error) {
      return (
        <StatePanel icon={AlertCircle} tone="red" title="Couldn't load health records" action={refreshButton}>
          {error}
        </StatePanel>
      )
    }
    if (data?.access === "no_account" && !records.length) {
      return (
        <StatePanel
          icon={Smartphone}
          tone="slate"
          title="No health records yet"
          action={addRecordButton}
        >
          {firstName} hasn&apos;t shared any files yet. You can upload lab results, imaging scans, or medical certificates here so they are ready for the patient.
        </StatePanel>
      )
    }
    if (data?.access === "restricted" && !records.length) {
      return (
        <StatePanel
          icon={FolderLock}
          tone="amber"
          title="Patient-uploaded records are private"
          action={addRecordButton}
        >
          {firstName} has restricted sharing for their own uploaded files in the Gabay app. You can still upload clinic-issued lab results or records for {firstName}.
        </StatePanel>
      )
    }
    if (!records.length) {
      return (
        <StatePanel
          icon={FileText}
          tone="blue"
          title="No health records shared or uploaded yet"
          action={addRecordButton}
        >
          When {firstName} turns on <span className="font-medium text-gray-700">“Share with my care providers”</span> in the Gabay app, or when clinic staff upload lab results and documents, they will appear here.
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
              aria-label="Search health records"
            />
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
            {[{ id: "all", label: "All" }, ...(data.categories || RECORD_CATEGORIES).filter(c => categoryCounts[c.id])].map(c => {
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
                <TableHead>Mobile App Visibility</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-sm text-muted-foreground">
                    No health records match your search.
                  </TableCell>
                </TableRow>
              ) : visible.map(record => {
                const isFacility = record.source === "facility"
                const sharedToMobile = isFacility ? !!record.shareWithProviders : true
                return (
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
                    <TableCell className="whitespace-nowrap">
                      <Badge variant="outline" className={isFacility ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"}>
                        {isFacility ? "Clinic / Staff" : "Patient (Mobile)"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      {isFacility ? (
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => handleTogglePatientVisibility(record)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                            sharedToMobile
                              ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                              : "bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200"
                          }`}
                          title="Click to toggle whether the patient can view this record in the mobile app"
                        >
                          {busy === `${record.id}:share` ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : sharedToMobile ? (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          ) : (
                            <ShieldOff className="w-3.5 h-3.5" />
                          )}
                          {sharedToMobile ? "Visible to Patient" : "Clinic Only"}
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                          <ShieldCheck className="w-3.5 h-3.5" /> Shared by Patient
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" onClick={() => openFile(record, "view")} disabled={!!busy} aria-label={`Open ${record.title}`}>
                        {busy === `${record.id}:view` ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                        <span className="ml-1.5 hidden xl:inline">Open</span>
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openFile(record, "download")} disabled={!!busy} aria-label={`Download ${record.title}`}>
                        {busy === `${record.id}:download` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                        <span className="ml-1.5 hidden xl:inline">Download</span>
                      </Button>
                      {isFacility && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteClinicRecord(record)}
                          disabled={!!busy}
                          aria-label={`Delete ${record.title}`}
                        >
                          {busy === `${record.id}:delete` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  const status = data?.access === "granted"
    ? { icon: ShieldCheck, text: "Synced with patient vault", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
    : data?.access === "restricted"
      ? { icon: ShieldOff, text: "Patient uploads restricted", cls: "bg-amber-50 text-amber-700 border-amber-200" }
      : null

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 space-y-0">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle>Health Records</CardTitle>
            {status && (
              <Badge variant="outline" className={`gap-1 ${status.cls}`}>
                <status.icon className="w-3.5 h-3.5" aria-hidden="true" /> {status.text}
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Files {firstName} shared from their mobile Health Record Vault and records uploaded by clinic staff.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {updatedAt && (
            <span className="text-xs text-muted-foreground whitespace-nowrap mr-1">
              Checked {updatedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {refreshButton}
          {addRecordButton}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {successMsg && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{successMsg}</span>
          </div>
        )}
        {notice && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="alert">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}
        {renderBody()}
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground border-t pt-3">
          <UserRound className="w-3.5 h-3.5" aria-hidden="true" />
          Patient-uploaded files appear when shared in the mobile app. Clinic-uploaded records can be shared directly to the patient&apos;s mobile app vault.
        </p>
      </CardContent>

      {/* Add / Upload Health Record Dialog */}
      <Dialog open={isAddOpen} onOpenChange={open => { if (!uploading) setIsAddOpen(open) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Health Record</DialogTitle>
            <DialogDescription>
              Upload lab results, imaging scans, prescriptions, or medical certificates for {patientName || "this patient"}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleUploadSubmit} className="space-y-4 py-1">
            {uploadError && (
              <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="hr-file">File (PDF, JPG, PNG, HEIC, WEBP · Max 10 MB) <span className="text-red-500">*</span></Label>
              <input
                ref={fileInputRef}
                id="hr-file"
                type="file"
                accept=".pdf,image/jpeg,image/png,image/heic,image/heif,image/webp"
                onChange={handleFileChange}
                className="hidden"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-200 hover:border-blue-400 rounded-xl p-4 text-center cursor-pointer transition-colors bg-slate-50/60"
              >
                {pickedFile ? (
                  <div className="flex items-center justify-center gap-3 text-left">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{pickedFile.name}</p>
                      <p className="text-xs text-slate-500">{formatBytes(pickedFile.size)} · Click to change file</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 py-2">
                    <Upload className="w-6 h-6 text-blue-600" />
                    <p className="text-sm font-medium text-slate-700">Click to select a document or image</p>
                    <p className="text-xs text-slate-500">Supports PDF, JPG, PNG, HEIC, WEBP up to 10 MB</p>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hr-title">Document Title <span className="text-red-500">*</span></Label>
              <Input
                id="hr-title"
                value={uploadTitle}
                onChange={e => setUploadTitle(e.target.value)}
                maxLength={120}
                placeholder="e.g. Complete Blood Count (CBC) Result"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="hr-category">Category <span className="text-red-500">*</span></Label>
                <Select value={uploadCategory} onValueChange={setUploadCategory}>
                  <SelectTrigger id="hr-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {RECORD_CATEGORIES.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hr-date">Date on Record</Label>
                <Input
                  id="hr-date"
                  type="date"
                  max={todayIso()}
                  value={uploadDate}
                  onChange={e => setUploadDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hr-notes">Clinical Notes / Remarks (Optional)</Label>
              <Textarea
                id="hr-notes"
                value={uploadNotes}
                onChange={e => setUploadNotes(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Doctor remarks, summary findings, or instructions for the patient..."
              />
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 cursor-pointer">
              <input
                type="checkbox"
                checked={shareWithPatient}
                onChange={e => setShareWithPatient(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="text-sm">
                <p className="font-medium text-slate-900">Allow patient to view in mobile app</p>
                <p className="text-xs text-slate-600 mt-0.5">
                  When enabled, this record immediately appears in {firstName}&apos;s Gabay mobile app Health Record Vault for viewing and download.
                </p>
              </div>
            </label>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} disabled={uploading}>
                Cancel
              </Button>
              <Button type="submit" disabled={uploading} className="bg-[#0284C7] hover:bg-[#0369A1] text-white">
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Record
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record Detail Dialog */}
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
              <dl className="grid grid-cols-[140px_1fr] gap-y-2.5 text-sm">
                <dt className="text-muted-foreground">Category</dt>
                <dd><CategoryBadge record={selected} /></dd>
                <dt className="text-muted-foreground">Date on record</dt>
                <dd>{formatDate(selected.recordDate)}</dd>
                <dt className="text-muted-foreground">Uploaded</dt>
                <dd>{formatDate(selected.uploadedAt)}</dd>
                <dt className="text-muted-foreground">File</dt>
                <dd className="break-all">{selected.fileName} · {formatBytes(selected.sizeBytes)}</dd>
                <dt className="text-muted-foreground">Added by</dt>
                <dd>{selected.source === "facility" ? "Clinic / Staff" : "Patient (Mobile App)"}</dd>
                <dt className="text-muted-foreground">Mobile visibility</dt>
                <dd>
                  {selected.source === "facility" ? (
                    <button
                      type="button"
                      disabled={!!busy}
                      onClick={() => handleTogglePatientVisibility(selected)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        selected.shareWithProviders
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-slate-100 text-slate-600 border-slate-200"
                      }`}
                    >
                      {selected.shareWithProviders ? "Visible to Patient (Click to hide)" : "Clinic Only (Click to share)"}
                    </button>
                  ) : (
                    <span className="text-emerald-700 font-medium">Shared by Patient</span>
                  )}
                </dd>
              </dl>
              {selected.notes && (
                <div className="rounded-md bg-slate-50 p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {selected.source === "facility" ? "Clinical notes" : "Patient's notes"}
                  </p>
                  <p className="text-gray-700 whitespace-pre-wrap">{selected.notes}</p>
                </div>
              )}
              <div className="flex justify-between items-center gap-2 pt-2">
                <div>
                  {selected.source === "facility" && (
                    <Button
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => handleDeleteClinicRecord(selected)}
                      disabled={!!busy}
                    >
                      {busy === `${selected.id}:delete` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                      Delete
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => openFile(selected, "download")} disabled={!!busy}>
                    {busy === `${selected.id}:download` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                    Download
                  </Button>
                  <Button onClick={() => openFile(selected, "view")} disabled={!!busy}>
                    {busy === `${selected.id}:view` ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                    Open file
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  )
}
