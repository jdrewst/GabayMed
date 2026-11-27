import { useState, useEffect, useMemo, useRef } from "react"
import {
  ArrowRightFromLine,
  Calendar,
  Clock,
  Droplets,
  AlertTriangle,
  Stethoscope,
  User,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Shield,
  Camera,
  ImagePlus,
  Pencil,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { AddInsurancePlanDialog } from "@/components/add-insurance-plan-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PatientAvatar, AVATAR_PRESETS, resolveAvatarPreset } from "@/components/patient-avatar"
import { DatePickerField } from "@/components/date-picker-field"
import { profileAPI } from "../../services/profile"
import { appointmentAPI } from "../../services/appointment"
import { PatientLedger } from "../components/patient-ledger"
import { claimsAPI } from "../../services/claims"
import { PatientHealthRecords } from "../components/patient-health-records"

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "Unknown"]
const SUFFIXES = ["Jr.", "Sr.", "II", "III", "IV", "V"]
const GENDERS = ["Male", "Female", "Other", "Prefer not to say"]
const NAME_REGEX = /^\p{L}[\p{L}\p{M} .'-]*$/u
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const normalizeGender = (value) => {
  if (!value) return ""
  const v = String(value).trim()
  if (v === "M" || v.toLowerCase() === "male") return "Male"
  if (v === "F" || v.toLowerCase() === "female") return "Female"
  return v
}

const splitClinicalItems = (val) => {
  if (Array.isArray(val)) return val.map((s) => String(s || "").trim()).filter(Boolean)
  if (typeof val !== "string") return []
  return val
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== "none")
}

const extractMobileLocal = (phone) => {
  const digits = String(phone || "").replace(/\D/g, "")
  if (digits.startsWith("63") && digits.length >= 12) return digits.slice(2, 12)
  if (digits.startsWith("0") && digits.length >= 11) return digits.slice(1, 11)
  return digits.slice(0, 10)
}

const formatDisplayDate = (dateStr) => {
  if (!dateStr) return "None"
  const parsed = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return String(dateStr)
  return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

const formatGroupDate = (dateStr) => {
  if (!dateStr) return "Unscheduled"
  const parsed = new Date(dateStr)
  if (Number.isNaN(parsed.getTime())) return String(dateStr)
  return parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
}

const formatAppointmentTime = (apt) => {
  if (apt.time) {
    const [hh, mm] = String(apt.time).split(":").map(Number)
    if (!Number.isNaN(hh)) {
      const d = new Date()
      d.setHours(hh, mm || 0, 0, 0)
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    }
  }
  if (apt.date) {
    const parsed = new Date(apt.date)
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    }
  }
  return "None"
}

export function PatientProfile({ patient, onPatientUpdated }) {
  const [isAddPlanOpen, setIsAddPlanOpen] = useState(false)
  const [isClaimDialogOpen, setIsClaimDialogOpen] = useState(false)
  const [isAvatarDialogOpen, setIsAvatarDialogOpen] = useState(false)
  const [apptSidebarTab, setApptSidebarTab] = useState("upcoming")
  const fileInputRef = useRef(null)

  // In-place editing states (matching Gabay 2.0 mobile ProfilePage)
  const [editingPersonal, setEditingPersonal] = useState(false)
  const [editingMedical, setEditingMedical] = useState(false)
  const [personalDraft, setPersonalDraft] = useState(null)
  const [medicalDraft, setMedicalDraft] = useState(null)
  const [personalError, setPersonalError] = useState("")
  const [medicalError, setMedicalError] = useState("")
  const [savingPersonal, setSavingPersonal] = useState(false)
  const [savingMedical, setSavingMedical] = useState(false)
  const [savingAvatar, setSavingAvatar] = useState(false)

  // Feedback Banner
  const [statusBanner, setStatusBanner] = useState(null)

  // Data States
  const [insurancePlans, setInsurancePlans] = useState([])
  const [clinicalNotes, setClinicalNotes] = useState([])
  const [upcomingAppointments, setUpcomingAppointments] = useState([])
  const [pastAppointments, setPastAppointments] = useState([])
  const [claimableRecords, setClaimableRecords] = useState([])
  const [selectedClaimId, setSelectedClaimId] = useState(null)
  const [patientClaims, setPatientClaims] = useState([])
  const [updatingClaimId, setUpdatingClaimId] = useState(null)
  const [claimError, setClaimError] = useState("")
  const [claimsRefreshKey, setClaimsRefreshKey] = useState(0)

  // Loading States
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [loadingAppointments, setLoadingAppointments] = useState(true)
  const [loadingClaims, setLoadingClaims] = useState(false)
  const [loadingPatientClaims, setLoadingPatientClaims] = useState(false)

  const [patientData, setPatientData] = useState({
    id: patient?.user_id || patient?.id,
    patientId: patient?.user_id || patient?.id || "None",
    profileId: patient?.profile_id || null,
    name: patient?.full_name || patient?.name || "Unknown Patient",
    first_name: patient?.first_name || "",
    middle_name: patient?.middle_name || "",
    last_name: patient?.last_name || "",
    name_suffix: patient?.name_suffix || "",
    age: patient?.age || "None",
    sex: normalizeGender(patient?.gender || patient?.sex),
    phone: patient?.phone_number || "",
    email: patient?.email || "",
    avatar_url: patient?.avatar_url || "",
    street_address: patient?.street_address || "",
    barangay: patient?.barangay || "",
    city_municipality: patient?.city_municipality || "",
    province: patient?.province || "",
    zip_code: patient?.zip_code || "",
    address: patient?.address || "",
    birthDate: patient?.date_of_birth ? String(patient.date_of_birth).slice(0, 10) : "",
    blood_type: patient?.blood_type || "",
    allergies: patient?.allergies || "",
    allergiesList: splitClinicalItems(patient?.allergies),
    medical_history: patient?.medical_history || "",
    medicalHistoryList: splitClinicalItems(patient?.medical_history),
  })

  const showBanner = (type, message) => {
    setStatusBanner({ type, message })
    window.setTimeout(() => {
      setStatusBanner((prev) => (prev?.message === message ? null : prev))
    }, 5000)
  }

  // 1. Load All Patient Data
  useEffect(() => {
    let active = true
    const loadData = async () => {
      const patientId = patient?.user_id || patient?.id
      if (!patientId) return

      setEditingPersonal(false)
      setEditingMedical(false)
      setPersonalError("")
      setMedicalError("")
      setPatientData((prev) => ({ ...prev, id: patientId, patientId }))

      const profile = await profileAPI.getPatientDetails(patientId)
      if (active && profile) {
        const updatedData = {
          id: patientId,
          patientId,
          profileId: profile.profileId || null,
          name: profile.name || "Unknown Patient",
          first_name: profile.first_name || "",
          middle_name: profile.middle_name || "",
          last_name: profile.last_name || "",
          name_suffix: profile.name_suffix || "",
          age: profile.age ?? "None",
          sex: normalizeGender(profile.sex || profile.gender),
          phone: profile.phone || "",
          email: profile.email || "",
          avatar_url: profile.avatar_url || "",
          street_address: profile.street_address || "",
          barangay: profile.barangay || "",
          city_municipality: profile.city_municipality || "",
          province: profile.province || "",
          zip_code: profile.zip_code || "",
          address: profile.address || "",
          birthDate: profile.birthDate || "",
          blood_type: profile.blood_type || "",
          allergies: profile.allergies || "",
          allergiesList: profile.allergiesList || splitClinicalItems(profile.allergies),
          medical_history: profile.medical_history || "",
          medicalHistoryList: profile.medicalHistoryList || splitClinicalItems(profile.medical_history),
        }
        setPatientData(updatedData)
      }

      setLoadingPlans(true)
      setLoadingNotes(true)
      setLoadingAppointments(true)
      setLoadingPatientClaims(true)

      const [plans, notes, apptsResult, submittedClaims] = await Promise.all([
        profileAPI.getInsurancePlans(patientId),
        profileAPI.getClinicalNotes(patientId),
        appointmentAPI.getPatientAppointments(patientId),
        claimsAPI.getPatientClaims(patientId),
      ])

      if (!active) return
      setInsurancePlans(plans)
      setLoadingPlans(false)
      setClinicalNotes(notes)
      setLoadingNotes(false)
      setUpcomingAppointments(apptsResult?.upcoming || [])
      setPastAppointments(apptsResult?.past || [])
      setLoadingAppointments(false)
      setPatientClaims(submittedClaims)
      setLoadingPatientClaims(false)
    }

    loadData()
    return () => {
      active = false
    }
  }, [patient?.user_id, patient?.id])

  const groupedSidebarAppointments = useMemo(() => {
    const list = apptSidebarTab === "upcoming" ? upcomingAppointments : pastAppointments
    const groups = new Map()
    for (const apt of list) {
      const label = formatGroupDate(apt.date)
      if (!groups.has(label)) groups.set(label, [])
      groups.get(label).push(apt)
    }
    return Array.from(groups.entries())
  }, [apptSidebarTab, upcomingAppointments, pastAppointments])

  // Avatar Editing (Presets & Custom Image Upload)
  const handleSelectAvatar = async (avatarValue) => {
    setSavingAvatar(true)
    const res = await profileAPI.updatePatientAvatar(patientData.id, avatarValue)
    setSavingAvatar(false)

    if (!res.success) {
      showBanner("error", res.error || "Could not update profile icon.")
      return
    }

    setPatientData((prev) => ({ ...prev, avatar_url: res.avatar_url }))
    onPatientUpdated?.({
      user_id: patientData.id,
      avatar_url: res.avatar_url,
    })
    setIsAvatarDialogOpen(false)
    showBanner("success", "Profile icon updated.")
  }

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      showBanner("error", "Please choose a valid image file.")
      return
    }
    if (file.size > 1200000) {
      showBanner("error", "Please choose an image smaller than 1.2 MB.")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === "string") {
        handleSelectAvatar(reader.result)
      }
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  // Start In-Place Edit: Personal & Demographics
  const startEditPersonal = () => {
    setPersonalDraft({
      first_name: patientData.first_name || "",
      middle_name: patientData.middle_name || "",
      last_name: patientData.last_name || "",
      name_suffix: patientData.name_suffix || "",
      birthDate: patientData.birthDate || "",
      sex: normalizeGender(patientData.sex) || "",
      mobileLocal: extractMobileLocal(patientData.phone),
      email: patientData.email || "",
      street_address: patientData.street_address || "",
      barangay: patientData.barangay || "",
      city_municipality: patientData.city_municipality || "",
      province: patientData.province || "",
      zip_code: patientData.zip_code || "",
    })
    setPersonalError("")
    setEditingPersonal(true)
  }

  // Start In-Place Edit: Medical Records
  const startEditMedical = () => {
    setMedicalDraft({
      blood_type: patientData.blood_type || "",
      allergiesList:
        patientData.allergiesList?.length > 0 ? [...patientData.allergiesList] : [""],
      medicalHistory:
        patientData.medicalHistoryList?.length > 0 ? [...patientData.medicalHistoryList] : [""],
    })
    setMedicalError("")
    setEditingMedical(true)
  }

  const setPersonalField = (key, value) => {
    setPersonalDraft((prev) => ({ ...prev, [key]: value }))
    setPersonalError("")
  }

  const updateMedicalList = (key, index, value) => {
    setMedicalDraft((prev) => ({
      ...prev,
      [key]: prev[key].map((item, i) => (i === index ? value : item)),
    }))
  }

  const addMedicalListItem = (key) => {
    setMedicalDraft((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), ""],
    }))
  }

  const removeMedicalListItem = (key, index) => {
    setMedicalDraft((prev) => {
      const filtered = (prev[key] || []).filter((_, i) => i !== index)
      return { ...prev, [key]: filtered.length > 0 ? filtered : [""] }
    })
  }

  // Validate & Save Personal & Demographics (independent of Medical Records)
  const handleSavePersonal = async () => {
    if (!personalDraft) return
    const first = (personalDraft.first_name || "").trim()
    const middle = (personalDraft.middle_name || "").trim()
    const last = (personalDraft.last_name || "").trim()
    const city = (personalDraft.city_municipality || "").trim()
    const province = (personalDraft.province || "").trim()
    const zip = (personalDraft.zip_code || "").trim()
    const email = (personalDraft.email || "").trim().toLowerCase()
    const mobile = (personalDraft.mobileLocal || "").replace(/\D/g, "")

    if (!first || first.length > 50 || !NAME_REGEX.test(first)) {
      setPersonalError("Enter a valid first name.")
      return
    }
    if (middle && (middle.length > 50 || !NAME_REGEX.test(middle))) {
      setPersonalError("Enter a valid middle name.")
      return
    }
    if (!last || last.length > 50 || !NAME_REGEX.test(last)) {
      setPersonalError("Enter a valid last name.")
      return
    }
    if (!personalDraft.birthDate) {
      setPersonalError("Please select a date of birth.")
      return
    }
    if (!personalDraft.sex) {
      setPersonalError("Please select a gender.")
      return
    }
    if (mobile && !/^9\d{9}$/.test(mobile)) {
      setPersonalError("Enter a valid 10-digit Philippine mobile number starting with 9.")
      return
    }
    if (email && (!EMAIL_REGEX.test(email) || email.length > 254)) {
      setPersonalError("Enter a valid email address.")
      return
    }
    if (!city) {
      setPersonalError("City or municipality is required.")
      return
    }
    if (!province) {
      setPersonalError("Province is required.")
      return
    }
    if (zip && !/^\d{4}$/.test(zip)) {
      setPersonalError("Enter a 4-digit ZIP code.")
      return
    }

    setSavingPersonal(true)
    setPersonalError("")

    const updates = {
      first_name: first,
      middle_name: middle,
      last_name: last,
      name_suffix: (personalDraft.name_suffix || "").trim(),
      birthDate: personalDraft.birthDate,
      sex: personalDraft.sex,
      phone: mobile ? `+63${mobile}` : "",
      email,
      street_address: (personalDraft.street_address || "").trim(),
      barangay: (personalDraft.barangay || "").trim(),
      city_municipality: city,
      province,
      zip_code: zip,
    }

    const res = await profileAPI.updatePatient(patientData.id, updates)
    setSavingPersonal(false)

    if (!res.success) {
      setPersonalError(res.error || "Could not save personal details.")
      showBanner("error", res.error || "Synchronization failed. Could not save personal details. The last valid record has been preserved.")
      return
    }

    const fullName = [updates.first_name, updates.middle_name, updates.last_name, updates.name_suffix]
      .filter(Boolean)
      .join(" ")
    const address = [
      updates.street_address,
      updates.barangay,
      updates.city_municipality,
      updates.province,
      updates.zip_code,
    ]
      .filter(Boolean)
      .join(", ")

    setPatientData((prev) => ({
      ...prev,
      ...updates,
      name: fullName,
      address,
      age: res.age,
    }))
    onPatientUpdated?.({
      user_id: patientData.id,
      full_name: fullName,
      first_name: updates.first_name,
      middle_name: updates.middle_name,
      last_name: updates.last_name,
      gender: updates.sex,
      age: res.age,
    })
    setEditingPersonal(false)
    showBanner("success", "Personal & demographic details saved.")
  }

  // Save Medical Records (independent of Personal & Demographics)
  const handleSaveMedical = async () => {
    if (!medicalDraft) return
    setSavingMedical(true)
    setMedicalError("")

    const cleanedAllergies = (medicalDraft.allergiesList || [])
      .map((s) => String(s || "").trim())
      .filter(Boolean)
    const cleanedHistory = (medicalDraft.medicalHistory || [])
      .map((s) => String(s || "").trim())
      .filter(Boolean)

    const res = await profileAPI.updatePatientMedical(patientData.id, {
      blood_type: medicalDraft.blood_type || "",
      allergies: cleanedAllergies.join(", "),
      medical_history: cleanedHistory.join(", "),
    })
    setSavingMedical(false)

    if (!res.success) {
      setMedicalError(res.error || "Could not save medical records.")
      showBanner("error", res.error || "Synchronization failed. Could not save medical records. The last valid record has been preserved.")
      return
    }

    setPatientData((prev) => ({
      ...prev,
      blood_type: res.blood_type,
      allergies: res.allergies,
      allergiesList: splitClinicalItems(res.allergies),
      medical_history: res.medical_history,
      medicalHistoryList: splitClinicalItems(res.medical_history),
    }))
    setEditingMedical(false)
    showBanner("success", "Medical records saved.")
  }

  const refreshInsurance = async () => {
    setLoadingPlans(true)
    const plans = await profileAPI.getInsurancePlans(patientData.id)
    setInsurancePlans(plans)
    setLoadingPlans(false)
  }

  const refreshPatientClaims = async (targetPatientId = patientData.id) => {
    if (!targetPatientId) return
    setLoadingPatientClaims(true)
    const submittedClaims = await claimsAPI.getPatientClaims(targetPatientId)
    setPatientClaims(submittedClaims)
    setLoadingPatientClaims(false)
  }

  const handleUpdateClaimStatus = async (claimId, nextStatus) => {
    if (!claimId || !nextStatus) return
    setUpdatingClaimId(claimId)
    const result = await claimsAPI.updateClaimStatus(claimId, nextStatus)
    setUpdatingClaimId(null)

    if (result.success) {
      await refreshPatientClaims(patientData.id)
      setClaimsRefreshKey((prev) => prev + 1)
    } else {
      showBanner("error", "Failed to update claim status: " + result.error)
    }
  }

  const handleOpenClaimDialog = async () => {
    setClaimError("")
    setSelectedClaimId(null)
    setIsClaimDialogOpen(true)
    setLoadingClaims(true)
    const records = await claimsAPI.getEligibleClaims(patientData.id)
    setClaimableRecords(records)
    setLoadingClaims(false)
  }

  const handleSendClaimSubmit = async () => {
    if (!selectedClaimId) return
    setClaimError("")

    const selectedRecord = claimableRecords.find((r) => r.ledger_id === selectedClaimId)
    if (!selectedRecord) return

    if (selectedRecord.hasActiveClaim) {
      setClaimError("A claim has already been submitted for this charge.")
      return
    }

    const insuranceId = selectedRecord.patients?.insurance_id || null

    const result = await claimsAPI.submitClaim({
      ledger_id: selectedRecord.ledger_id,
      patient_id: patientData.id,
      insurance_id: insuranceId,
    })

    if (result.success) {
      setIsClaimDialogOpen(false)
      setSelectedClaimId(null)
      await refreshPatientClaims(patientData.id)
      setClaimsRefreshKey((prev) => prev + 1)
      showBanner("success", "Insurance claim submitted successfully.")
    } else {
      setClaimError(result.error || "Failed to submit claim.")
    }
  }

  const allergiesList = patientData.allergiesList || []
  const medicalHistoryList = patientData.medicalHistoryList || []
  const activeAvatarPreset = resolveAvatarPreset(patientData.avatar_url, patientData.sex)

  const cellBase =
    "rounded-xl border px-3.5 py-2.5 transition-colors " +
    (editingPersonal
      ? "border-[#38BDF8] bg-[#F0F9FF]/45"
      : "border-slate-200/80 bg-[#F8FAFC]")

  return (
    <div className="space-y-6">
      {/* Status Notification Banner */}
      {statusBanner && (
        <div
          role="status"
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-sm ${
            statusBanner.type === "success"
              ? "border-[#BAE6FD] bg-[#F0F9FF] text-[#0369A1]"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {statusBanner.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-[#0284C7]" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          )}
          <span>{statusBanner.message}</span>
        </div>
      )}

      {/* TOP PROFILE CARD (2-column internal layout: Left Avatar + Edit Profile | Right Personal & Demographics) */}
      <Card className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        <CardContent className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E0F2FE] text-[#0284C7]">
              <User className="w-5 h-5" />
            </div>
            <h2 className="text-base font-bold text-slate-900">
              Personal &amp; Demographics
            </h2>
          </div>

          {editingPersonal && personalError && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700"
            >
              {personalError}
            </div>
          )}

          <div className="flex flex-col md:flex-row gap-6">
            {/* Left Column: Editable Avatar + Name + Edit Profile Button */}
            <div className="flex flex-col items-center justify-start gap-3 md:w-48 shrink-0 pt-1">
              <div className="relative">
                <PatientAvatar
                  avatar={patientData.avatar_url}
                  gender={patientData.sex}
                  size={116}
                  showBlob
                />
                <button
                  type="button"
                  onClick={() => setIsAvatarDialogOpen(true)}
                  title="Change profile photo or character"
                  className="absolute bottom-1 right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#E0F2FE] text-[#0284C7] shadow-md hover:bg-[#BAE6FD] transition-colors"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>

              <div className="text-center">
                <p className="text-sm font-bold text-slate-900 leading-snug">
                  {patientData.name}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {patientData.age !== "None" && patientData.age !== "N/A" && patientData.age !== ""
                    ? `${patientData.age} yrs`
                    : "None"}
                  {patientData.sex ? ` • ${patientData.sex}` : ""}
                </p>
              </div>

              {!editingPersonal ? (
                <Button
                  size="sm"
                  className="bg-gradient-to-b from-[#6CC4F8] to-[#3B9EE8] hover:from-[#5ABAF4] hover:to-[#2D8FD8] text-white font-medium rounded-lg shadow-sm border-0 px-5 h-9 w-full max-w-[152px]"
                  onClick={startEditPersonal}
                >
                  Edit Profile
                </Button>
              ) : (
                <div className="flex flex-col gap-1.5 w-full max-w-[152px]">
                  <Button
                    size="sm"
                    disabled={savingPersonal}
                    className="bg-gradient-to-b from-[#6CC4F8] to-[#3B9EE8] hover:from-[#5ABAF4] hover:to-[#2D8FD8] text-white font-medium rounded-lg shadow-sm border-0 h-8"
                    onClick={handleSavePersonal}
                  >
                    {savingPersonal ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={savingPersonal}
                    className="h-8 rounded-lg"
                    onClick={() => {
                      setEditingPersonal(false)
                      setPersonalError("")
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </div>

            {/* Right Column: Pure Text Bento Cells (matching mobile layout) */}
            <div className="flex-1 md:border-l md:border-slate-200/80 md:pl-6 space-y-2.5 min-w-0">
              {/* Row 1: First Name, Middle Name, Last Name, Suffix */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className={cellBase}>
                  <p className="text-[11px] font-medium text-slate-400">
                    First Name{editingPersonal && <span className="text-rose-500"> *</span>}
                  </p>
                  {editingPersonal ? (
                    <Input
                      className="h-8 mt-1 bg-white text-sm"
                      value={personalDraft?.first_name || ""}
                      onChange={(e) => setPersonalField("first_name", e.target.value)}
                      placeholder="First name"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {patientData.first_name || "None"}
                    </p>
                  )}
                </div>

                <div className={cellBase}>
                  <p className="text-[11px] font-medium text-slate-400">Middle Name</p>
                  {editingPersonal ? (
                    <Input
                      className="h-8 mt-1 bg-white text-sm"
                      value={personalDraft?.middle_name || ""}
                      onChange={(e) => setPersonalField("middle_name", e.target.value)}
                      placeholder="Optional"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {patientData.middle_name || "None"}
                    </p>
                  )}
                </div>

                <div className={cellBase}>
                  <p className="text-[11px] font-medium text-slate-400">
                    Last Name{editingPersonal && <span className="text-rose-500"> *</span>}
                  </p>
                  {editingPersonal ? (
                    <Input
                      className="h-8 mt-1 bg-white text-sm"
                      value={personalDraft?.last_name || ""}
                      onChange={(e) => setPersonalField("last_name", e.target.value)}
                      placeholder="Last name"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {patientData.last_name || "None"}
                    </p>
                  )}
                </div>

                <div className={cellBase}>
                  <p className="text-[11px] font-medium text-slate-400">Suffix / Extension</p>
                  {editingPersonal ? (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {["", ...SUFFIXES].map((sfx) => {
                        const active = (personalDraft?.name_suffix || "") === sfx
                        return (
                          <button
                            key={sfx || "none"}
                            type="button"
                            onClick={() => setPersonalField("name_suffix", sfx)}
                            className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                              active
                                ? "bg-[#0284C7] text-white border-[#0284C7]"
                                : "bg-white text-slate-600 border-slate-200 hover:border-[#38BDF8]"
                            }`}
                          >
                            {sfx || "None"}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {patientData.name_suffix || "None"}
                    </p>
                  )}
                </div>
              </div>

              {/* Row 2: Birthdate & Age | Gender | Mobile Number | Registered Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className={cellBase}>
                  <p className="text-[11px] font-medium text-slate-400">
                    Birthdate &amp; Age{editingPersonal && <span className="text-rose-500"> *</span>}
                  </p>
                  {editingPersonal ? (
                    <DatePickerField
                      className="mt-1"
                      value={personalDraft?.birthDate || ""}
                      onChange={(iso) => setPersonalField("birthDate", iso)}
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {formatDisplayDate(patientData.birthDate)}
                      {patientData.age !== "None" && patientData.age !== "N/A" && patientData.age !== ""
                        ? ` (${patientData.age} yrs)`
                        : ""}
                    </p>
                  )}
                </div>

                <div className={cellBase}>
                  <p className="text-[11px] font-medium text-slate-400">
                    Gender{editingPersonal && <span className="text-rose-500"> *</span>}
                  </p>
                  {editingPersonal ? (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {GENDERS.map((g) => {
                        const active = personalDraft?.sex === g
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setPersonalField("sex", g)}
                            className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                              active
                                ? "bg-[#0284C7] text-white border-[#0284C7]"
                                : "bg-white text-slate-600 border-slate-200 hover:border-[#38BDF8]"
                            }`}
                          >
                            {g}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {patientData.sex || "None"}
                    </p>
                  )}
                </div>

                <div className={cellBase}>
                  <p className="text-[11px] font-medium text-slate-400">
                    Mobile Number{editingPersonal && <span className="text-rose-500"> *</span>}
                  </p>
                  {editingPersonal ? (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs font-bold text-slate-500">+63</span>
                      <Input
                        className="h-8 bg-white text-sm"
                        value={personalDraft?.mobileLocal || ""}
                        onChange={(e) =>
                          setPersonalField(
                            "mobileLocal",
                            e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10)
                          )
                        }
                        placeholder="9XX XXX XXXX"
                      />
                    </div>
                  ) : (
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {patientData.phone || "None"}
                    </p>
                  )}
                </div>

                <div className={cellBase}>
                  <p className="text-[11px] font-medium text-slate-400">Registered Email</p>
                  {editingPersonal ? (
                    <Input
                      type="email"
                      className="h-8 mt-1 bg-white text-sm"
                      value={personalDraft?.email || ""}
                      onChange={(e) => setPersonalField("email", e.target.value)}
                      placeholder="name@example.com"
                    />
                  ) : (
                    <p
                      className="text-sm font-semibold text-slate-900 mt-0.5 truncate"
                      title={patientData.email}
                    >
                      {patientData.email || "None"}
                    </p>
                  )}
                </div>
              </div>

              {/* Row 3: Street Address, Barangay, City / Municipality, Province, ZIP Code */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                <div className={cellBase}>
                  <p className="text-[11px] font-medium text-slate-400">Street Address</p>
                  {editingPersonal ? (
                    <Input
                      className="h-8 mt-1 bg-white text-sm"
                      value={personalDraft?.street_address || ""}
                      onChange={(e) => setPersonalField("street_address", e.target.value)}
                      placeholder="House No., Street"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {patientData.street_address || "None"}
                    </p>
                  )}
                </div>

                <div className={cellBase}>
                  <p className="text-[11px] font-medium text-slate-400">Barangay</p>
                  {editingPersonal ? (
                    <Input
                      className="h-8 mt-1 bg-white text-sm"
                      value={personalDraft?.barangay || ""}
                      onChange={(e) => setPersonalField("barangay", e.target.value)}
                      placeholder="Barangay"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {patientData.barangay || "None"}
                    </p>
                  )}
                </div>

                <div className={cellBase}>
                  <p className="text-[11px] font-medium text-slate-400">
                    City / Municipality{editingPersonal && <span className="text-rose-500"> *</span>}
                  </p>
                  {editingPersonal ? (
                    <Input
                      className="h-8 mt-1 bg-white text-sm"
                      value={personalDraft?.city_municipality || ""}
                      onChange={(e) => setPersonalField("city_municipality", e.target.value)}
                      placeholder="e.g. Quezon City"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {patientData.city_municipality || "None"}
                    </p>
                  )}
                </div>

                <div className={cellBase}>
                  <p className="text-[11px] font-medium text-slate-400">
                    Province{editingPersonal && <span className="text-rose-500"> *</span>}
                  </p>
                  {editingPersonal ? (
                    <Input
                      className="h-8 mt-1 bg-white text-sm"
                      value={personalDraft?.province || ""}
                      onChange={(e) => setPersonalField("province", e.target.value)}
                      placeholder="Province"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {patientData.province || "None"}
                    </p>
                  )}
                </div>

                <div className={cellBase}>
                  <p className="text-[11px] font-medium text-slate-400">ZIP Code</p>
                  {editingPersonal ? (
                    <Input
                      className="h-8 mt-1 bg-white text-sm"
                      maxLength={4}
                      inputMode="numeric"
                      value={personalDraft?.zip_code || ""}
                      onChange={(e) =>
                        setPersonalField("zip_code", e.target.value.replace(/\D/g, "").slice(0, 4))
                      }
                      placeholder="4-digit ZIP"
                    />
                  ) : (
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">
                      {patientData.zip_code || "None"}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FULL-WIDTH MAIN CONTENT TABS */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="w-full justify-start border-b border-slate-200 rounded-none h-auto p-0 bg-transparent space-x-6">
          <TabsTrigger
            value="overview"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#3B9EE8] data-[state=active]:text-[#3B9EE8] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-2.5 text-sm font-medium text-slate-500"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="ledger"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#3B9EE8] data-[state=active]:text-[#3B9EE8] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-2.5 text-sm font-medium text-slate-500"
          >
            Ledger
          </TabsTrigger>
          <TabsTrigger
            value="insurance"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#3B9EE8] data-[state=active]:text-[#3B9EE8] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-2.5 text-sm font-medium text-slate-500"
          >
            Insurance
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#3B9EE8] data-[state=active]:text-[#3B9EE8] data-[state=active]:bg-transparent data-[state=active]:shadow-none px-2 py-2.5 text-sm font-medium text-slate-500"
          >
            Clinical Notes
          </TabsTrigger>
          <TabsTrigger
            value="records"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent px-4 py-3"
          >
            Health Records
          </TabsTrigger>
        </TabsList>

        {/* OVERVIEW TAB: 3 Columns — Medical Records | Appointments | Quick Actions */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Column 1: Medical Records */}
            <Card className="rounded-2xl border-slate-200/80 bg-white shadow-sm">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold tracking-wider uppercase text-[#4C9BD6]">
                    Medical Records
                  </h3>
                  {!editingMedical && (
                    <Button
                      type="button"
                      size="icon"
                      onClick={startEditMedical}
                      title="Edit medical records"
                      aria-label="Edit medical records"
                      className="h-7 w-7 rounded-full bg-gradient-to-b from-[#6CC4F8] to-[#3B9EE8] hover:from-[#5ABAF4] hover:to-[#2D8FD8] text-white border-0 shadow-sm"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>

                {editingMedical && medicalError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700"
                  >
                    {medicalError}
                  </div>
                )}

                {/* Blood Type Field */}
                <div
                  className={`rounded-xl border p-3.5 flex items-start gap-3 transition-colors ${
                    editingMedical
                      ? "border-[#38BDF8] bg-[#F0F9FF]/45"
                      : "border-slate-200/80 bg-[#F8FAFC]"
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FEE2E2] text-[#EF4444] mt-0.5">
                    <Droplets className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-slate-400">Blood Type</p>
                    {editingMedical ? (
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {BLOOD_TYPES.map((bt) => {
                          const active = medicalDraft?.blood_type === bt
                          return (
                            <button
                              key={bt}
                              type="button"
                              onClick={() =>
                                setMedicalDraft((prev) => ({
                                  ...prev,
                                  blood_type: active ? "" : bt,
                                }))
                              }
                              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-colors ${
                                active
                                  ? "bg-[#0284C7] text-white border-[#0284C7]"
                                  : "bg-white text-slate-600 border-slate-200 hover:border-[#38BDF8]"
                              }`}
                            >
                              {bt}
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-slate-900 mt-0.5">
                        {patientData.blood_type || "None"}
                      </p>
                    )}
                  </div>
                </div>

                {/* Known Allergies Sub-Card (Scrollable) */}
                <div
                  className={`rounded-xl border p-3.5 space-y-2.5 transition-colors ${
                    editingMedical
                      ? "border-[#38BDF8] bg-[#F0F9FF]/45"
                      : "border-slate-200/80 bg-[#F8FAFC]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                      <span>Known Allergies</span>
                    </div>
                    {editingMedical && (
                      <button
                        type="button"
                        onClick={() => addMedicalListItem("allergiesList")}
                        className="inline-flex items-center gap-1 rounded-full bg-[#E0F2FE] px-2.5 py-0.5 text-xs font-semibold text-[#0284C7] hover:bg-[#BAE6FD]"
                      >
                        <Plus className="w-3 h-3" />
                        Add Allergy
                      </button>
                    )}
                  </div>

                  {editingMedical ? (
                    <div className="max-h-[140px] overflow-y-auto pr-1 space-y-2">
                      {(medicalDraft?.allergiesList || [""]).map((item, idx) => (
                        <div key={`allergy-${idx}`} className="flex items-center gap-1.5">
                          <Input
                            className="h-8 bg-white text-sm"
                            value={item}
                            onChange={(e) => updateMedicalList("allergiesList", idx, e.target.value)}
                            placeholder={`Allergy #${idx + 1} (e.g. Penicillin, Peanuts)`}
                          />
                          <button
                            type="button"
                            onClick={() => removeMedicalListItem("allergiesList", idx)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"
                            title="Remove allergy"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : allergiesList.length > 0 ? (
                    <div className="max-h-[88px] overflow-y-auto pr-1 flex flex-wrap gap-1.5">
                      {allergiesList.map((item, idx) => (
                        <Badge
                          key={`${item}-${idx}`}
                          variant="outline"
                          className="bg-amber-50 text-amber-800 border-amber-200 text-xs font-medium rounded-lg whitespace-normal break-words text-left leading-snug py-0.5"
                        >
                          {item}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">None</p>
                  )}
                </div>

                {/* Medical History & Conditions Sub-Card (Scrollable) */}
                <div
                  className={`rounded-xl border p-3.5 space-y-2.5 transition-colors ${
                    editingMedical
                      ? "border-[#38BDF8] bg-[#F0F9FF]/45"
                      : "border-slate-200/80 bg-[#F8FAFC]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <Stethoscope className="w-3.5 h-3.5 text-[#0284C7]" />
                      <span>Medical History &amp; Conditions</span>
                    </div>
                    {editingMedical && (
                      <button
                        type="button"
                        onClick={() => addMedicalListItem("medicalHistory")}
                        className="inline-flex items-center gap-1 rounded-full bg-[#E0F2FE] px-2.5 py-0.5 text-xs font-semibold text-[#0284C7] hover:bg-[#BAE6FD]"
                      >
                        <Plus className="w-3 h-3" />
                        Add Condition
                      </button>
                    )}
                  </div>

                  {editingMedical ? (
                    <div className="max-h-[160px] overflow-y-auto pr-1 space-y-2">
                      {(medicalDraft?.medicalHistory || [""]).map((item, idx) => (
                        <div key={`history-${idx}`} className="flex items-center gap-1.5">
                          <Input
                            className="h-8 bg-white text-sm"
                            value={item}
                            onChange={(e) => updateMedicalList("medicalHistory", idx, e.target.value)}
                            placeholder={`Condition #${idx + 1} (e.g. Asthma, Hypertension)`}
                          />
                          <button
                            type="button"
                            onClick={() => removeMedicalListItem("medicalHistory", idx)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50"
                            title="Remove condition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : medicalHistoryList.length > 0 ? (
                    <div className="max-h-[120px] overflow-y-auto pr-1 flex flex-wrap gap-1.5">
                      {medicalHistoryList.map((item, idx) => (
                        <Badge
                          key={`${item}-${idx}`}
                          variant="outline"
                          className="bg-[#F0F9FF] text-[#0369A1] border-[#BAE6FD] text-xs font-medium rounded-lg whitespace-normal break-words text-left leading-snug py-0.5"
                        >
                          {item}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">None</p>
                  )}
                </div>

                {editingMedical && (
                  <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={savingMedical}
                      onClick={() => {
                        setEditingMedical(false)
                        setMedicalError("")
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={savingMedical}
                      className="bg-gradient-to-b from-[#6CC4F8] to-[#3B9EE8] hover:from-[#5ABAF4] hover:to-[#2D8FD8] text-white border-0 px-5"
                      onClick={handleSaveMedical}
                    >
                      {savingMedical ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Column 2: Appointments (Upcoming / Past) */}
            <Card className="rounded-2xl border-slate-200/80 shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold tracking-wider uppercase text-[#4C9BD6]">
                    Appointments
                  </h3>
                  <Button
                    size="icon"
                    className="h-7 w-7 rounded-full bg-gradient-to-b from-[#6CC4F8] to-[#3B9EE8] hover:from-[#5ABAF4] hover:to-[#2D8FD8] text-white border-0 shadow-sm"
                    title="Schedule appointment"
                    asChild
                  >
                    <a
                      href={`/appointments?patientId=${encodeURIComponent(patientData.id || "")}&patientName=${encodeURIComponent(patientData.name || "")}`}
                      aria-label="Schedule appointment for this patient"
                    >
                      <Plus className="w-4 h-4" />
                    </a>
                  </Button>
                </div>

                <div className="flex items-center gap-6 border-b border-slate-200 mb-4">
                  <button
                    type="button"
                    onClick={() => setApptSidebarTab("upcoming")}
                    className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
                      apptSidebarTab === "upcoming"
                        ? "border-[#3B9EE8] text-[#3B9EE8]"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    Upcoming
                  </button>
                  <button
                    type="button"
                    onClick={() => setApptSidebarTab("past")}
                    className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
                      apptSidebarTab === "past"
                        ? "border-[#3B9EE8] text-[#3B9EE8]"
                        : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    Past
                  </button>
                </div>

                {loadingAppointments ? (
                  <div className="text-sm text-muted-foreground py-4">Loading appointments...</div>
                ) : groupedSidebarAppointments.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-6 text-center rounded-xl bg-slate-50/80 border border-dashed border-slate-200">
                    {apptSidebarTab === "upcoming"
                      ? "No upcoming appointments scheduled."
                      : "No past appointments recorded."}
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
                    {groupedSidebarAppointments.map(([dateLabel, items]) => (
                      <div key={dateLabel} className="space-y-2">
                        <p className="text-xs font-semibold text-[#4C9BD6]">{dateLabel}</p>
                        <div className="space-y-2">
                          {items.map((apt) => (
                            <div
                              key={apt.id}
                              className="rounded-xl bg-[#D8EEFE]/85 hover:bg-[#CDE7FD] transition-colors px-4 py-3 space-y-0.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-600">
                                  <Clock className="w-3.5 h-3.5 text-[#3B9EE8]" />
                                  {formatAppointmentTime(apt)}
                                </span>
                                {apptSidebarTab === "past" && apt.status && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                                    {apt.status}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-bold text-slate-900 truncate">
                                {apt.provider}
                              </p>
                              <p className="text-xs text-slate-600 truncate">{apt.procedure}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Column 3: Quick Actions */}
            <Card className="rounded-2xl border-slate-200/80 shadow-sm h-fit">
              <CardHeader>
                <CardTitle className="text-sm font-bold tracking-wider uppercase text-[#4C9BD6]">
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="justify-start bg-transparent"
                  onClick={handleOpenClaimDialog}
                >
                  <ArrowRightFromLine className="w-4 h-4 mr-2" />
                  Send Claim
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* LEDGER TAB */}
        <TabsContent value="ledger">
          <PatientLedger
            patientId={patientData.id}
            refreshTrigger={claimsRefreshKey}
            onPaymentChanged={() => refreshPatientClaims(patientData.id)}
          />
        </TabsContent>

        {/* INSURANCE TAB */}
        <TabsContent value="insurance" className="space-y-6">
          <Card className="rounded-2xl border-slate-200/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-bold tracking-wider uppercase text-[#4C9BD6]">
                Insurance Plans
              </CardTitle>
              <Button
                size="sm"
                className="bg-gradient-to-b from-[#6CC4F8] to-[#3B9EE8] hover:from-[#5ABAF4] hover:to-[#2D8FD8] text-white border-0 rounded-full px-4 h-8 text-xs font-medium shadow-sm"
                onClick={() => setIsAddPlanOpen(true)}
              >
                Add Plan
              </Button>
            </CardHeader>
            <CardContent>
              {loadingPlans ? (
                <div className="text-sm text-muted-foreground">Loading insurance plans...</div>
              ) : insurancePlans.length === 0 ? (
                <div className="text-sm text-muted-foreground">No active insurance plans found.</div>
              ) : (
                <div className="space-y-4">
                  {insurancePlans.map((plan, idx) => (
                    <div
                      key={plan.id || idx}
                      className="border border-slate-200 rounded-xl p-4 bg-white"
                    >
                      <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E0F2FE] text-[#3B9EE8]">
                            <Shield className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-xs text-slate-400">Plan</p>
                            <p className="font-semibold text-sm text-slate-900">{plan.carrier}</p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Status</p>
                          <p className="font-semibold text-sm text-slate-900 capitalize">
                            {plan.status || "Active"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Subscriber ID</p>
                          <p className="font-semibold text-sm text-slate-900">
                            {plan.subscriberId || "None"}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Validity Period</p>
                          <p className="font-semibold text-sm text-slate-900">
                            {plan.coverageStartDate
                              ? new Date(plan.coverageStartDate).toLocaleDateString()
                              : "None"}
                            {plan.coverageEndDate
                              ? ` to ${new Date(plan.coverageEndDate).toLocaleDateString()}`
                              : ""}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-400">Coverage Type</p>
                          <p className="font-semibold text-sm text-slate-900">
                            {plan.coverageType || "Standard"}
                          </p>
                        </div>
                      </div>
                      {plan.notes && (
                        <div className="mt-3 pt-3 border-t border-slate-100">
                          <p className="text-sm text-muted-foreground">{plan.notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-slate-200/80 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold tracking-wider uppercase text-[#4C9BD6]">
                  Submitted Insurance Claims
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Claims submitted by the patient on the mobile app or by clinic staff appear here in real time.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleOpenClaimDialog}>
                <ArrowRightFromLine className="w-4 h-4 mr-2" />
                Send Claim
              </Button>
            </CardHeader>
            <CardContent>
              {loadingPatientClaims ? (
                <div className="text-sm text-muted-foreground">Loading submitted claims...</div>
              ) : patientClaims.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No insurance claims submitted for this patient yet.
                </div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <Table>
                    <TableHeader className="bg-slate-50">
                      <TableRow>
                        <TableHead>Service Date</TableHead>
                        <TableHead>Procedure</TableHead>
                        <TableHead>Provider</TableHead>
                        <TableHead>Carrier / Plan</TableHead>
                        <TableHead>Submitted On</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="w-44">Claim Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {patientClaims.map((claim) => (
                        <TableRow key={claim.id}>
                          <TableCell>
                            {claim.serviceDate
                              ? new Date(claim.serviceDate).toLocaleDateString()
                              : "None"}
                          </TableCell>
                          <TableCell className="font-medium">
                            {claim.procedureCode
                              ? `[${claim.procedureCode}] ${claim.procedure}`
                              : claim.procedure}
                          </TableCell>
                          <TableCell>{claim.provider}</TableCell>
                          <TableCell>
                            <div>{claim.carrierName}</div>
                            {claim.planName && (
                              <div className="text-xs text-muted-foreground">{claim.planName}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {claim.submissionDate
                              ? new Date(claim.submissionDate).toLocaleDateString()
                              : "None"}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            ₱
                            {Number(claim.amount || 0).toLocaleString("en-PH", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                          <TableCell>
                            <Select
                              value={claim.status || "Submitted"}
                              disabled={updatingClaimId === claim.id}
                              onValueChange={(val) => handleUpdateClaimStatus(claim.id, val)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Status" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Submitted">Submitted</SelectItem>
                                <SelectItem value="In Review">In Review</SelectItem>
                                <SelectItem value="Approved">Approved</SelectItem>
                                <SelectItem value="Paid">Paid</SelectItem>
                                <SelectItem value="Denied">Denied</SelectItem>
                              </SelectContent>
                            </Select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CLINICAL NOTES TAB */}
        <TabsContent value="notes">
          <Card className="rounded-2xl border-slate-200/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm font-bold tracking-wider uppercase text-[#4C9BD6]">
                Clinical Notes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingNotes ? (
                <div className="text-sm text-muted-foreground">Loading notes...</div>
              ) : clinicalNotes.length === 0 ? (
                <div className="text-sm text-muted-foreground">No clinical notes found.</div>
              ) : (
                <div className="space-y-6">
                  {clinicalNotes.map((note) => (
                    <div key={note.id} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                        <div className="w-0.5 flex-1 bg-blue-100 my-1" />
                      </div>
                      <div className="flex-1 space-y-2 pb-6">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-muted-foreground" />
                            <span className="font-medium text-sm">
                              {new Date(note.date).toLocaleDateString()}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(note.date).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          <Badge variant="outline">{note.provider}</Badge>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-lg text-sm text-gray-700 whitespace-pre-wrap">
                          {note.note}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        {/* HEALTH RECORDS TAB (US-4.0): files the patient shared from their Gabay app vault */}
        <TabsContent value="records">
          <PatientHealthRecords patientId={patientData.id} patientName={patientData.name} />
        </TabsContent>
      </Tabs>

      {/* Avatar Picker Dialog (Matching Gabay 2.0 Mobile Character Presets & Photo Upload) */}
      <Dialog open={isAvatarDialogOpen} onOpenChange={setIsAvatarDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose Profile Icon</DialogTitle>
            <DialogDescription>
              Pick a Gabay character icon or upload a photo. Changes synchronize with the patient&apos;s Gabay 2.0 profile.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-3">
              {AVATAR_PRESETS.map((preset) => {
                const isSelected =
                  !patientData.avatar_url?.startsWith("http") &&
                  !patientData.avatar_url?.startsWith("data:") &&
                  activeAvatarPreset === preset.id
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={savingAvatar}
                    onClick={() => handleSelectAvatar(preset.id)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 transition-all ${
                      isSelected
                        ? "border-[#0284C7] bg-[#F0F9FF] ring-2 ring-[#38BDF8]/40"
                        : "border-slate-200 hover:border-[#38BDF8] hover:bg-slate-50"
                    }`}
                  >
                    <PatientAvatar avatar={preset.id} size={64} />
                    <span className="text-xs font-medium text-slate-700">{preset.label}</span>
                  </button>
                )
              })}
            </div>

            <div className="pt-2 border-t border-slate-100">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePhotoUpload}
              />
              <Button
                type="button"
                variant="outline"
                disabled={savingAvatar}
                className="w-full border-[#BAE6FD] text-[#0284C7] hover:bg-[#F0F9FF] rounded-xl"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="w-4 h-4 mr-2" />
                {savingAvatar ? "Saving..." : "Upload Custom Photo"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Claim Dialog */}
      <Dialog
        open={isClaimDialogOpen}
        onOpenChange={(open) => {
          setIsClaimDialogOpen(open)
          if (!open) {
            setSelectedClaimId(null)
            setClaimError("")
          }
        }}
      >
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Send Claims</DialogTitle>
          </DialogHeader>

          {claimError && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {claimError}
            </div>
          )}

          <div className="grid gap-4 py-4">
            <div className="border rounded-md">
              <Table>
                <TableHeader className="bg-slate-100">
                  <TableRow>
                    <TableHead className="w-12 text-center">Att.</TableHead>
                    <TableHead>Patient</TableHead>
                    <TableHead>Service Date</TableHead>
                    <TableHead>Created On</TableHead>
                    <TableHead>Procedure</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Carrier</TableHead>
                    <TableHead>Claim Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingClaims ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        Loading eligible claims...
                      </TableCell>
                    </TableRow>
                  ) : claimableRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                        No pending charges available for claims.
                      </TableCell>
                    </TableRow>
                  ) : (
                    claimableRecords.map((record) => {
                      const alreadySent = Boolean(record.hasActiveClaim)
                      return (
                        <TableRow
                          key={record.ledger_id}
                          className={alreadySent ? "bg-slate-50/70 opacity-80" : "cursor-pointer"}
                          onClick={() => {
                            if (!alreadySent) setSelectedClaimId(record.ledger_id)
                          }}
                        >
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                              disabled={alreadySent}
                              checked={selectedClaimId === record.ledger_id}
                              onChange={() => {
                                if (!alreadySent) setSelectedClaimId(record.ledger_id)
                              }}
                            />
                          </TableCell>
                          <TableCell className="font-medium">
                            {record.patients?.full_name || "None"}
                          </TableCell>
                          <TableCell>
                            {record.date ? new Date(record.date).toLocaleDateString() : "None"}
                          </TableCell>
                          <TableCell>
                            {record.created_at
                              ? new Date(record.created_at).toLocaleDateString()
                              : "None"}
                          </TableCell>
                          <TableCell>
                            {record.procedures
                              ? `[${record.procedures.procedure_id}] ${record.procedures.description}`
                              : record.description || "None"}
                          </TableCell>
                          <TableCell>{record.providers?.name || "None"}</TableCell>
                          <TableCell>
                            {record.patients?.insurance_plans?.carrier?.name || "No Carrier"}
                          </TableCell>
                          <TableCell>
                            {record.claimStatus ? (
                              <Badge
                                variant="outline"
                                className={
                                  alreadySent
                                    ? "bg-blue-50 text-blue-700 border-blue-200"
                                    : "bg-red-50 text-red-700 border-red-200"
                                }
                              >
                                {record.claimStatus}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-amber-50 text-amber-700 border-amber-200"
                              >
                                Not Sent
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium text-red-500">
                            ₱
                            {parseFloat(record.total_bill_amount || 0).toLocaleString("en-PH", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 pt-4 border-t">
            <Button variant="outline" onClick={() => setIsClaimDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendClaimSubmit} disabled={!selectedClaimId}>
              Send Claim
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AddInsurancePlanDialog
        open={isAddPlanOpen}
        onOpenChange={setIsAddPlanOpen}
        patientId={patientData.id}
        onPlanAdded={refreshInsurance}
      />
    </div>
  )
}
