import { useState, useEffect, useRef, useCallback, useContext, useMemo, createContext } from "react"
import { Building2, Plus, X, Pencil, Trash2, Eye, Check, Copy, TriangleAlert, Info } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ROOM_STATUSES, newBranchForm, newRoomForm, validateLogo } from "../lib/settings-locations"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { buildFeeForm, feeFormPayload, feeScheduleStatus } from "../lib/fee-schedules"
import { validateSettingsForm, settingsChanges } from "../lib/settings-forms"
import { settingsAPI } from "../../services/settings" // Import API

export function SettingsTabs() {
  return <SettingsNotificationProvider><SettingsContent /></SettingsNotificationProvider>
}

function SettingsContent() {
  const toast = useSettingsToast()
  const settingsRoot = useRef(null)
  useEffect(() => {
    const root = settingsRoot.current
    const closeOthers = target => {
      root?.querySelectorAll('details[open]').forEach(dropdown => {
        if (!target || !dropdown.contains(target)) dropdown.open = false
      })
    }
    const onPointerDown = event => closeOthers(event.target)
    const onKeyDown = event => { if (event.key === 'Escape') closeOthers(null) }
    const onToggle = event => {
      if (event.target.tagName === 'DETAILS' && event.target.open) closeOthers(event.target)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    root?.addEventListener('toggle', onToggle, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      root?.removeEventListener('toggle', onToggle, true)
    }
  }, [])
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [account, setAccount] = useState(null)
  const [, setAccessError] = useSettingsFeedback()
  const [creatingProvider, setCreatingProvider] = useState(false)
  const [, setProviderError] = useSettingsFeedback()
  const [createdCredentials, setCreatedCredentials] = useState(null)
  const canAddProvider = account?.role === 'IT Admin'

  useEffect(() => {
    let active = true
    settingsAPI.getAccessContext().then(data => { if (active) setAccount(data) })
      .catch(error => { if (active) setAccessError(error.message) })
    return () => { active = false }
  }, [])
  const [procedures, setProcedures] = useState([])
  const [procedureLoadError, setProcedureLoadError] = useSettingsFeedback()
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingProcedures, setLoadingProcedures] = useState(true)
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false)
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState(null)
  
  // Schedule State Management
  const [scheduleData, setScheduleData] = useState({
    mon: { active: false, start: '09:00', end: '17:00' },
    tue: { active: false, start: '09:00', end: '17:00' },
    wed: { active: false, start: '09:00', end: '17:00' },
    thu: { active: false, start: '09:00', end: '17:00' },
    fri: { active: false, start: '09:00', end: '17:00' },
    sat: { active: false, start: '09:00', end: '12:00' },
    sun: { active: false, start: '09:00', end: '12:00' }
  })

  const daysOfWeek = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const scheduleDayLabels = {
    mon: 'Monday',
    tue: 'Tuesday',
    wed: 'Wednesday',
    thu: 'Thursday',
    fri: 'Friday',
    sat: 'Saturday',
    sun: 'Sunday'
  };

  // Updated to match Provider Schema
  const [userFormData, setUserFormData] = useState({
    name: '',
    email: '',
    role: '',
    licenseNo: '',
    specialization: ''
  })

  const [branches, setBranches] = useState([])
  const [branchesLoading, setBranchesLoading] = useState(true)
  const [branchesError, setBranchesError] = useSettingsFeedback()
  const loadBranches = async () => {
    if (!account?.facility_id) return
    setBranchesLoading(true)
    setBranchesError('')
    try { setBranches(await settingsAPI.getBranches(account.facility_id)) }
    catch (error) { setBranchesError(error.message) }
    finally { setBranchesLoading(false) }
  }
  useEffect(() => { if (account?.facility_id) loadBranches() }, [account?.facility_id])
  // Check URL for tab parameter
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const tabParam = urlParams.get('tab')
    if (tabParam) {
      setActiveTab(tabParam)
    }
  }, [])

  // Fetch users (providers) from database
  useEffect(() => {
    const fetchUsers = async () => {
      setLoadingUsers(true);
      try {
        const data = await settingsAPI.getProviders();
        setUsers(data);
      } catch (error) {
        setAccessError(error.message);
      } finally {
        setLoadingUsers(false);
      }
    }
    fetchUsers()
  }, [])

  // Fetch procedure codes from database
  useEffect(() => {
    const fetchProcedures = async () => {
      setLoadingProcedures(true);
      try {
      const data = await settingsAPI.getProcedures();
      setProcedures(data);
      
      } catch (error) {
        setProcedureLoadError(error.message);
      } finally {
        setLoadingProcedures(false);
      }
    }
    fetchProcedures()
  }, [])

  // Helper function to get initials from name
  const getInitials = (name) => {
    if (!name) return 'U'
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  // Helper to parse schedule JSON to state
  const parseScheduleToState = (scheduleJson) => {
    const defaultState = {
      mon: { active: false, start: '09:00', end: '17:00' },
      tue: { active: false, start: '09:00', end: '17:00' },
      wed: { active: false, start: '09:00', end: '17:00' },
      thu: { active: false, start: '09:00', end: '17:00' },
      fri: { active: false, start: '09:00', end: '17:00' },
      sat: { active: false, start: '09:00', end: '12:00' },
      sun: { active: false, start: '09:00', end: '12:00' }
    }

    if (!scheduleJson || typeof scheduleJson !== 'object') return defaultState

    const newState = { ...defaultState }
    Object.keys(scheduleJson).forEach(day => {
      if (newState[day] && scheduleJson[day]) {
        const [start, end] = scheduleJson[day].split('-')
        newState[day] = { active: true, start: start || '09:00', end: end || '17:00' }
      }
    })
    return newState
  }

  // Helper to format state to JSON for API
  const formatScheduleForAPI = () => {
    const scheduleJson = {}
    daysOfWeek.forEach(day => {
      if (scheduleData[day].active) {
        scheduleJson[day] = `${scheduleData[day].start}-${scheduleData[day].end}`
      }
    })
    return scheduleJson
  }

  const formatRoleDisplay = (role) => {
    if (!role) return 'N/A';

    return role
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleScheduleChange = (day, field, value) => {
    setScheduleData(prev => ({
      ...prev,
      [day]: { ...prev[day], [field]: value }
    }))
  }

  const providerDraft = useSettingsDraft('provider', { ...userFormData, schedule: formatScheduleForAPI() })
  const [updatingProvider, setUpdatingProvider] = useState(false)

  // Handle user form input changes
  const handleUserInputChange = (field, value) => {
    setUserFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Validate user form
  const isUserFormValid = () => {
    return providerDraft.canSave
  }

  // Handle save new user (Provider)
  const handleSaveUser = async () => {
    if (creatingProvider) return
    if (!canAddProvider) {
      setProviderError('Only IT Admin accounts can add providers.')
      return
    }
    if (!isUserFormValid()) {
      toast.error('Please fill in all required fields.')
      return
    }

    const schedule = formatScheduleForAPI();
    const workingHrs = Object.values(scheduleData).reduce(
      (total, day) => {
        if (!day.active) return total;

        const [startHour, startMinute] = day.start.split(':').map(Number);
        const [endHour, endMinute] = day.end.split(':').map(Number);

        const startMinutes = startHour * 60 + startMinute;
        const endMinutes = endHour * 60 + endMinute;

        if (endMinutes <= startMinutes) {
          return total;
        }

        return total + (endMinutes - startMinutes) / 60;
      },
      0
    );

    if (workingHrs <= 0) {
      toast.error('Please select at least one valid working day and schedule.');
      return;
    }

    const payload = {
      ...userFormData,
      schedule,
      working_hrs: Math.round(workingHrs)
    };

    setCreatingProvider(true)
    setProviderError('')
    const result = await settingsAPI.createProvider(payload);
    setCreatingProvider(false)

    if (result.success) {
      // Add new user to the list
      setUsers(prev => [...prev, result.provider])
      
      // Reset form and close dialog
      setUserFormData({
        name: '',
        email: '',
        role: '',
        licenseNo: '',
        specialization: ''
      })
      setScheduleData(parseScheduleToState({})) // Reset schedule
      setIsUserDialogOpen(false)
      setCreatedCredentials(result.credentials)
    } else {
      setProviderError(result.error)
    }
  }

  // Handle edit user
  const handleEditUser = (user) => {
    setEditingUserId(user.id)
    const next = {
      name: user.name || '',
      email: user.email || '',
      role: (user.type || user.role || '').toUpperCase(),
      licenseNo: user.licenseNo || '',
      specialization: user.specialization || '',
    }
    setUserFormData(next)
    providerDraft.start({ ...next, schedule: user.schedule || {} })
    setScheduleData(parseScheduleToState(user.schedule))
    setIsEditUserDialogOpen(true)
  }

  // Handle update user (Provider)
  const handleUpdateUser = async () => {
    if (updatingProvider || !providerDraft.canSave) {
      toast.error('Please fill in all required fields.')
      return
    }

    const payload = {
      ...userFormData,
      schedule: formatScheduleForAPI()
    }

    setUpdatingProvider(true)
    const result = await settingsAPI.updateProvider(editingUserId, payload);
    setUpdatingProvider(false)

    if (result.success) {
      // Update user in the list
      setUsers(prev => prev.map(u => 
        u.id === editingUserId ? result.provider : u
      ))
      
      // Reset form and close dialog
      setUserFormData({
        name: '',
        email: '',
        role: '',
        licenseNo: '',
        specialization: ''
      })
      setEditingUserId(null)
      setIsEditUserDialogOpen(false)
      toast.edited('Provider updated.', providerDraft.changes, result.provider.name)
    } else {
      if (result.error) toast.error(result.error)
    }
  }

  return (
    <div ref={settingsRoot} className="space-y-6 -mt-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-muted-foreground">Manage your clinic configuration and preferences</p>
      </div>

      <Dialog open={createdCredentials !== null} onOpenChange={value => { if (!value) setCreatedCredentials(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Provider Account Created</DialogTitle>
            <DialogDescription>Share these login details with the provider. The password is displayed only here and is cleared when you close this dialog.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="created-email">Email</Label><Input id="created-email" readOnly value={createdCredentials?.email || ''} /></div>
            <div className="space-y-2"><Label htmlFor="generated-password">Generated Password</Label><Input id="generated-password" autoComplete="off" readOnly value={createdCredentials?.password || ''} /></div>
            <p className="text-sm">Account role: Hospital Staff</p>
            <Button variant="outline" onClick={async () => {
              try {
                await navigator.clipboard.writeText(`Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}`)
                toast.success('Login details copied.')
              } catch { toast.error('Copy was unavailable. Select and copy the login details manually.') }
            }}>Copy Login Details</Button>
            <div className="flex justify-end"><Button onClick={() => setCreatedCredentials(null)}>Done</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 lg:w-[820px] h-auto gap-1">
          <TabsTrigger value="users">Providers</TabsTrigger>
          <TabsTrigger value="location">Locations</TabsTrigger>
          <TabsTrigger value="rooms">Operating Rooms</TabsTrigger>
          <TabsTrigger value="procedures">Procedures</TabsTrigger>
          <TabsTrigger value="fees">Fees</TabsTrigger>
        </TabsList>

        {/* User Accounts Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Providers & Staff</CardTitle>
                <CardDescription>Manage staff access and provider schedules</CardDescription>
              </div>
              {canAddProvider && <Dialog open={isUserDialogOpen} onOpenChange={value => {
                if (creatingProvider) return
                if (value) {
                  setUserFormData({ name: '', email: '', role: '', licenseNo: '', specialization: '' })
                  setScheduleData(parseScheduleToState({}))
                  setEditingUserId(null)
                  providerDraft.start(null)
                }
                setProviderError('')
                setIsUserDialogOpen(value)
              }}>
                <DialogTrigger asChild>
                  <Button className="bg-blue-500">Add New Provider</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Add New Provider</DialogTitle>
                    <DialogDescription>
                      Create a new account for staff or provider. Fields marked with * are required.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4" onBlurCapture={event => providerDraft.touch(event.target.id?.replace(/^edit-/, '') || 'schedule')}>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name <span className="text-red-500">*</span></Label>
                        <Input
                          id="name"
                          placeholder="Dr. Juan Dela Cruz"
                          value={userFormData.name}
                          onChange={(e) => handleUserInputChange('name', e.target.value)}
                          aria-invalid={providerDraft.touched.name && !!providerDraft.errors.name}
                        />
                        <SettingsFieldError draft={providerDraft} field="name" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address <span className="text-red-500">*</span></Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="juan.delacruz@clinic.ph"
                          value={userFormData.email}
                          onChange={(e) => handleUserInputChange('email', e.target.value)}
                          aria-invalid={providerDraft.touched.email && !!providerDraft.errors.email}
                        />
                        <SettingsFieldError draft={providerDraft} field="email" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="role">Provider Type <span className="text-red-500">*</span></Label>
                        <Select
                          value={userFormData.role}
                          onValueChange={(value) => handleUserInputChange('role', value)}
                        >
                          <SelectTrigger id="role">
                            <SelectValue placeholder="Select provider type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DOCTOR">Doctor</SelectItem>
                            <SelectItem value="DENTIST">Dentist</SelectItem>
                            <SelectItem value="NURSE">Nurse</SelectItem>
                            <SelectItem value="RECEPTIONIST">Receptionist</SelectItem>
                            <SelectItem value="ADMINISTRATOR">Administrator</SelectItem>
                            <SelectItem value="MEDICAL ASSISTANT">Medical Assistant</SelectItem>
                          </SelectContent>
                        </Select>
                        <SettingsFieldError draft={providerDraft} field="role" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="licenseNo">License Number</Label>
                        <Input
                          id="licenseNo"
                          placeholder="PRC-123456"
                          value={userFormData.licenseNo}
                          onChange={(e) => handleUserInputChange('licenseNo', e.target.value)}
                          aria-invalid={providerDraft.touched.licenseNo && !!providerDraft.errors.licenseNo}
                        />
                        <SettingsFieldError draft={providerDraft} field="licenseNo" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="specialization">Specialization</Label>
                        <Input
                          id="specialization"
                          placeholder="e.g. Cardiology, General Dentistry"
                          value={userFormData.specialization}
                          onChange={(e) => handleUserInputChange('specialization', e.target.value)}
                          aria-invalid={providerDraft.touched.specialization && !!providerDraft.errors.specialization}
                        />
                        <SettingsFieldError draft={providerDraft} field="specialization" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="schedule">Schedule Details</Label>
                      <SettingsFieldError draft={providerDraft} field="schedule" />
                      <div className="border rounded-md p-4 max-h-48 overflow-y-auto bg-slate-50">
                        {daysOfWeek.map(day => (
                          <div key={day} className="flex items-center gap-4 mb-2 last:mb-0">
                            <div className="flex items-center gap-2 w-24">
                              <input 
                                type="checkbox" 
                                checked={scheduleData[day].active}
                                onChange={(e) => handleScheduleChange(day, 'active', e.target.checked)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="text-sm font-medium uppercase text-gray-700">{day}</span>
                            </div>
                            {scheduleData[day].active && (
                              <div className="flex items-center gap-2">
                                <Input 
                                  type="time" 
                                  value={scheduleData[day].start}
                                  onChange={(e) => handleScheduleChange(day, 'start', e.target.value)}
                                  className="h-8 w-28 bg-white"
                                />
                                <span className="text-xs text-muted-foreground">to</span>
                                <Input 
                                  type="time" 
                                  value={scheduleData[day].end}
                                  onChange={(e) => handleScheduleChange(day, 'end', e.target.value)}
                                  className="h-8 w-28 bg-white"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="outline" disabled={creatingProvider} onClick={() => setIsUserDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      className="bg-blue-500 hover:bg-blue-600"
                      onClick={handleSaveUser}
                      disabled={!isUserFormValid() || creatingProvider}
                    >
                      {creatingProvider ? 'Creating Account...' : 'Create Provider'}
                    </Button>
                  </div>
                  {!isUserFormValid() && (
                    <p className="text-xs text-muted-foreground text-center">
                      Please fill in all required fields (Name, Email, Provider Type)
                    </p>
                  )}
                </DialogContent>
              </Dialog>}

              {/* Edit User Dialog */}
              <Dialog open={isEditUserDialogOpen} onOpenChange={setIsEditUserDialogOpen}>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Edit Provider</DialogTitle>
                    <DialogDescription>
                      Update provider account information.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4" onBlurCapture={event => providerDraft.touch(event.target.id?.replace(/^edit-/, '') || 'schedule')}>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-name">Full Name <span className="text-red-500">*</span></Label>
                        <Input
                          id="edit-name"
                          placeholder="Dr. Juan Dela Cruz"
                          value={userFormData.name}
                          onChange={(e) => handleUserInputChange('name', e.target.value)}
                          aria-invalid={providerDraft.touched.name && !!providerDraft.errors.name}
                        />
                        <SettingsFieldError draft={providerDraft} field="name" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-email">Email Address <span className="text-red-500">*</span></Label>
                        <Input
                          id="edit-email"
                          type="email"
                          placeholder="juan.delacruz@clinic.ph"
                          value={userFormData.email}
                          onChange={(e) => handleUserInputChange('email', e.target.value)}
                          aria-invalid={providerDraft.touched.email && !!providerDraft.errors.email}
                        />
                        <SettingsFieldError draft={providerDraft} field="email" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-role">Role <span className="text-red-500">*</span></Label>
                        <Select
                          value={userFormData.role}
                          onValueChange={(value) => handleUserInputChange('role', value)}
                        >
                          <SelectTrigger id="edit-role">
                            <SelectValue placeholder="Select provider type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="DOCTOR">Doctor</SelectItem>
                            <SelectItem value="DENTIST">Dentist</SelectItem>
                            <SelectItem value="NURSE">Nurse</SelectItem>
                            <SelectItem value="RECEPTIONIST">Receptionist</SelectItem>
                            <SelectItem value="ADMINISTRATOR">Administrator</SelectItem>
                            <SelectItem value="MEDICAL_ASSISTANT">Medical Assistant</SelectItem>
                          </SelectContent>
                        </Select>
                        <SettingsFieldError draft={providerDraft} field="role" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-licenseNo">License Number</Label>
                        <Input
                          id="edit-licenseNo"
                          placeholder="PRC-123456"
                          value={userFormData.licenseNo}
                          onChange={(e) => handleUserInputChange('licenseNo', e.target.value)}
                          aria-invalid={providerDraft.touched.licenseNo && !!providerDraft.errors.licenseNo}
                        />
                        <SettingsFieldError draft={providerDraft} field="licenseNo" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-specialization">Specialization</Label>
                        <Input
                          id="edit-specialization"
                          placeholder="e.g. Cardiology"
                          value={userFormData.specialization}
                          onChange={(e) => handleUserInputChange('specialization', e.target.value)}
                          aria-invalid={providerDraft.touched.specialization && !!providerDraft.errors.specialization}
                        />
                        <SettingsFieldError draft={providerDraft} field="specialization" />
                      </div>
                      <div className="space-y-2">
                        <SettingsFieldError draft={providerDraft} field="schedule" />
                      <Label htmlFor="edit-schedule">Schedule</Label>
                        <div className="border rounded-md p-4 max-h-48 overflow-y-auto bg-slate-50">
                          {daysOfWeek.map(day => (
                            <div key={day} className="flex items-center gap-4 mb-2 last:mb-0">
                              <div className="flex items-center gap-2 w-24">
                                <input 
                                  type="checkbox" 
                                  checked={scheduleData[day].active}
                                  onChange={(e) => handleScheduleChange(day, 'active', e.target.checked)}
                                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm font-medium uppercase text-gray-700">{day}</span>
                              </div>
                              {scheduleData[day].active && (
                                <div className="flex items-center gap-2">
                                  <Input 
                                    type="time" 
                                    value={scheduleData[day].start}
                                    onChange={(e) => handleScheduleChange(day, 'start', e.target.value)}
                                    className="h-8 w-28 bg-white"
                                  />
                                  <span className="text-xs text-muted-foreground">to</span>
                                  <Input 
                                    type="time" 
                                    value={scheduleData[day].end}
                                    onChange={(e) => handleScheduleChange(day, 'end', e.target.value)}
                                    className="h-8 w-28 bg-white"
                                  />
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="outline" onClick={() => setIsEditUserDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      className="bg-blue-500 hover:bg-blue-600"
                      onClick={handleUpdateUser}
                      disabled={updatingProvider || !providerDraft.canSave}
                    >
                      Update Provider
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>License No.</TableHead>
                    <TableHead>Specialization</TableHead>
                    <TableHead>Schedule</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingUsers ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Loading providers...
                      </TableCell>
                    </TableRow>
                  ) : users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        {canAddProvider ? 'No providers found. Click Add New Provider to get started.' : 'No providers found.'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src="/placeholder-user.jpg" />
                            <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                          </Avatar>
                          <div className="font-medium">{user.name}</div>
                        </TableCell>
                        <TableCell>{formatRoleDisplay(user.type || user.role)}</TableCell>
                        <TableCell>{user.licenseNo || 'N/A'}</TableCell>
                        <TableCell>{user.specialization || 'N/A'}</TableCell>
                        <TableCell className="min-w-[190px] align-top">
                          {user.schedule && Object.keys(user.schedule).length > 0 ? (
                            <details className="group relative">
                              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-slate-50">
                                <span className="text-sm font-medium text-gray-700">
                                  {Object.keys(user.schedule).length} days scheduled
                                </span>

                                <svg
                                  className="h-4 w-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="m6 9 6 6 6-6"
                                  />
                                </svg>
                              </summary>

                              <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border bg-white p-3 shadow-lg">
                                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                                  Weekly Schedule
                                </p>

                                <div className="space-y-3">
                                  {daysOfWeek.map((day) => {
                                    const hours = user.schedule?.[day];

                                    return (
                                      <div
                                        key={day}
                                        className="flex items-center justify-between gap-3 text-sm"
                                      >
                                        <span className="text-gray-600">
                                          {scheduleDayLabels[day]}
                                        </span>

                                        {hours ? (
                                          <span className="whitespace-nowrap font-medium text-gray-800">
                                            {hours.replace('-', ' – ')}
                                          </span>
                                        ) : (
                                          <span className="text-gray-400">Closed</span>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </details>
                          ) : (
                            <span className="text-sm text-gray-400">Not set</span>
                          )}
                        </TableCell>

                        <TableCell className="text-right">
                          <SettingsActionButton action="edit" label={`Edit ${user.name}`} onClick={() => handleEditUser(user)} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="location">
          <SettingsBranchesTab account={account} branches={branches} setBranches={setBranches}
            loading={branchesLoading} loadError={branchesError} reload={loadBranches} />
        </TabsContent>
        <TabsContent value="rooms">
          <SettingsRoomsTab account={account} branches={branches} branchesLoading={branchesLoading}
            branchesError={branchesError} reloadBranches={loadBranches} />
        </TabsContent>

        <TabsContent value="procedures">
          <ProceduresTab procedures={procedures} setProcedures={setProcedures}
            loading={loadingProcedures} loadError={procedureLoadError} />
        </TabsContent>

        <TabsContent value="fees">
          <FeeSchedulesTab procedures={procedures} loadingProcedures={loadingProcedures}
            procedureLoadError={procedureLoadError} />
        </TabsContent>
      </Tabs>
    </div>
  )
}


const emptyForm = { description: '', category: '', price: '', officeFee: '', phCaseRate: '', duration: '30' }
const fields = [
  ['description', 'Description', 'text'], ['category', 'Category', 'text'],
  ['price', 'Base Price', 'number'], ['officeFee', 'Office Fee', 'number'],
  ['phCaseRate', 'PhilHealth Case Rate', 'number'], ['duration', 'Duration (minutes)', 'number']
]
const currency = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)

function ProceduresTab({ procedures, setProcedures, loading, loadError }) {
  const toast = useSettingsToast()
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const draft = useSettingsDraft('procedure', form)
  const [, setError] = useSettingsFeedback()
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [, setDeleteError] = useSettingsFeedback()

  const openForm = procedure => {
    setEditingId(procedure?.id ?? null)
    const next = procedure ? { ...procedure } : { ...emptyForm }
    setForm(next)
    draft.start(procedure ? next : null)
    setError('')
    setOpen(true)
  }

  const save = async event => {
    event.preventDefault()
    if (busy || !draft.canSave) return
    setBusy(true)
    setError('')
    try {
      const result = editingId !== null
        ? await settingsAPI.updateProcedure(editingId, form)
        : await settingsAPI.createProcedure(form)
      if (!result.success) throw new Error(result.error)
      setProcedures(previous => (editingId !== null
        ? previous.map(p => p.id === editingId ? result.procedure : p)
        : [...previous, result.procedure]).sort((a, b) => a.id - b.id))
      setOpen(false)
      if (editingId !== null) toast.edited('Procedure updated.', draft.changes, result.procedure.description)
      else toast.success('Procedure added.', result.procedure.description)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (busy) return
    setBusy(true)
    setDeleteError('')
    try {
      const result = await settingsAPI.deleteProcedure(deleting.id)
      if (!result.success) throw new Error(result.error)
      setProcedures(previous => previous.filter(p => p.id !== result.id))
      setDeleting(null)
      toast.success('Procedure deleted.', deleting.description)
    } catch (err) {
      setDeleteError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle>Procedure Codes</CardTitle>
          <CardDescription>Manage procedures, prices, case rates, and duration</CardDescription>
        </div>
        <Button className="bg-blue-500" onClick={() => openForm(null)}>
          <Plus className="w-4 h-4 mr-2" />Add Procedure
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            {['Procedure Code', 'Description', 'Category', 'Base Price', 'Office Fee', 'PhilHealth Case Rate', 'Duration (minutes)', 'Actions'].map(label => (
              <TableHead key={label} className="whitespace-nowrap">{label}</TableHead>
            ))}
          </TableRow></TableHeader>
          <TableBody>
            {loading || procedures.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">
                {loading ? 'Loading procedures...' : loadError ? 'Procedures unavailable.' : 'No procedures found. Click "Add Procedure" to get started.'}
              </TableCell></TableRow>
            ) : procedures.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-mono">{p.id}</TableCell>
                <TableCell>{p.description}</TableCell><TableCell>{p.category}</TableCell>
                <TableCell className="whitespace-nowrap">{currency(p.price)}</TableCell>
                <TableCell className="whitespace-nowrap">{currency(p.officeFee)}</TableCell>
                <TableCell className="whitespace-nowrap">{currency(p.phCaseRate)}</TableCell>
                <TableCell>{p.duration}</TableCell>
                <TableCell><div className="flex gap-2">
                  <SettingsActionButton action="edit" label={`Edit ${p.description}`} onClick={() => openForm(p)} />
                  <SettingsActionButton action="delete" label={`Delete ${p.description}`} onClick={() => { setDeleting(p); setDeleteError('') }} />
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value) }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId !== null ? 'Edit Procedure' : 'Add Procedure'}</DialogTitle>
            <DialogDescription>Enter the procedure details and save your changes.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-6" onBlurCapture={event => draft.touch(event.target.id?.replace(/^procedure-/, ''))}>
            <div className="grid gap-4 md:grid-cols-2">
              {fields.map(([key, label, type]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`procedure-${key}`}>{label} <span className="text-red-500">*</span></Label>
                  <Input id={`procedure-${key}`} type={type} required disabled={busy}
                    min={type === 'number' ? key === 'duration' ? 1 : 0 : undefined}
                    step={type === 'number' ? key === 'duration' ? 1 : '0.01' : undefined}
                    value={form[key]} aria-invalid={draft.touched[key] && !!draft.errors[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} />
                  <SettingsFieldError draft={draft} field={key} />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-blue-500" disabled={busy || !draft.canSave}>{busy ? 'Saving...' : 'Save Procedure'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={deleting !== null} onOpenChange={value => { if (!value && !busy) setDeleting(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Procedure</DialogTitle>
            <DialogDescription>Delete {deleting?.description}? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button>
            <Button className="bg-red-600 hover:bg-red-700" disabled={busy} onClick={remove}>{busy ? 'Deleting...' : 'Delete Procedure'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}


const money = value => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value)

function FeeSchedulesTab({ procedures, loadingProcedures, procedureLoadError }) {
  const toast = useSettingsToast()
  const [schedules, setSchedules] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useSettingsFeedback()
  const [form, setForm] = useState(null)
  const draft = useSettingsDraft('fee', form)
  const [, setError] = useSettingsFeedback()
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const load = async () => {
    setLoading(true)
    setLoadError('')
    try {
      const [rows, options] = await Promise.all([settingsAPI.getFeeSchedules(), settingsAPI.getFeeSchedulePlans()])
      setSchedules(rows)
      setPlans(options)
    } catch (err) {
      setLoadError(err.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const openForm = schedule => {
    setError('')
    const next = buildFeeForm(procedures, schedules, schedule)
    setForm(next)
    draft.start(schedule ? next : null)
  }
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const changeItem = (code, patch) => setForm(previous => ({ ...previous,
    procedureFees: previous.procedureFees.map(item => item.code === code ? { ...item, ...patch } : item)
  }))

  const planLabel = id => id === 'Not set' ? 'Standard Rates' : plans.find(plan => String(plan.insurance_id) === id)?.plan_name || id
  const save = async event => {
    event.preventDefault()
    if (busy || !draft.canSave) return
    setError('')
    try {
      const payload = feeFormPayload(form)
      setBusy(true)
      await settingsAPI.saveFeeSchedule(form.id, payload)
      setForm(null)
      if (form.id != null) toast.edited('Fee schedule updated.', draft.changes.map(change => change.field === 'Insurance Plan' ? { ...change, before: planLabel(change.before), after: planLabel(change.after) } : change), form.scheduleName)
      else toast.success('Fee schedule saved.', form.scheduleName)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }
  const remove = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await settingsAPI.deleteFeeSchedule(deleting.id)
      setDeleting(null)
      toast.success('Fee schedule deleted.', deleting.scheduleName)
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const unavailable = loading || loadingProcedures || !!loadError || !!procedureLoadError
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div><CardTitle>Fee Schedules</CardTitle>
          <CardDescription>Manage Standard and HMO prices for your clinic. All rates include the office fee.</CardDescription>
        </div>
        <Button className="bg-blue-500" disabled={unavailable} onClick={() => openForm(null)}><Plus className="w-4 h-4 mr-2" />Add Fee Schedule</Button>
      </CardHeader>
      <CardContent>
        {loadError && <Button variant="outline" size="sm" className="mb-4" onClick={load}>Retry</Button>}
        <Table><TableHeader><TableRow>
          {['Schedule Name', 'Insurance Plan', 'Effective From', 'Effective To (exclusive)', 'Status', 'Procedures', 'Actions'].map(title => <TableHead key={title} className="whitespace-nowrap">{title}</TableHead>)}
        </TableRow></TableHeader><TableBody>
          {loading ? <TableRow><TableCell colSpan={7} className="text-center">Loading schedules...</TableCell></TableRow>
            : schedules.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">{loadError ? 'Schedules unavailable.' : 'No schedules found. Add a fee schedule to get started.'}</TableCell></TableRow>
            : schedules.map(schedule => <TableRow key={schedule.id}>
              <TableCell className="font-medium">{schedule.scheduleName}</TableCell>
              <TableCell>{schedule.insuranceId ? schedule.planName || `Plan ${schedule.insuranceId}` : 'Standard Rates'}</TableCell>
              <TableCell>{schedule.effectiveFrom}</TableCell><TableCell>{schedule.effectiveTo || 'No end date'}</TableCell>
              <TableCell>{feeScheduleStatus(schedule, schedules)}</TableCell><TableCell>{schedule.procedureFees.length}</TableCell>
              <TableCell><div className="flex gap-2">
                <SettingsActionButton action="edit" label={`Edit ${schedule.scheduleName}`} disabled={unavailable} onClick={() => openForm(schedule)} />
                <SettingsActionButton action="delete" label={`Delete ${schedule.scheduleName}`} disabled={loading} onClick={() => { setError(''); setDeleting(schedule) }} />
              </div></TableCell>
            </TableRow>)}
        </TableBody></Table>
      </CardContent>
      <Dialog open={form !== null} onOpenChange={value => { if (!value && !busy) setForm(null) }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id != null ? 'Edit Fee Schedule' : 'Add Fee Schedule'}</DialogTitle>
            <DialogDescription>Choose the plan, effective dates, and complete procedure prices. HMO procedures without a rate fall back to Standard Rates.</DialogDescription>
          </DialogHeader>
          {form && <form onSubmit={save} className="space-y-6" onBlurCapture={event => draft.touch(event.target.id?.replace(/^fee-/, ''))}>
            <fieldset disabled={busy} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="fee-name">Schedule Name *</Label><Input id="fee-name" onBlur={() => draft.touch('scheduleName')} required value={form.scheduleName} onChange={e => change('scheduleName', e.target.value)} /><SettingsFieldError draft={draft} field="scheduleName" /></div>
                <div className="space-y-2"><Label htmlFor="fee-plan">Insurance Plan</Label>
                  <Select disabled={busy} value={form.insuranceId || 'standard'} onValueChange={value => change('insuranceId', value === 'standard' ? '' : value)}>
                    <SelectTrigger id="fee-plan"><SelectValue /></SelectTrigger><SelectContent>
                      <SelectItem value="standard">Standard Rates (no insurance plan)</SelectItem>
                      {form.insuranceId && !plans.some(p => String(p.insurance_id) === form.insuranceId) && <SelectItem value={form.insuranceId}>Plan {form.insuranceId}</SelectItem>}
                      {plans.map(p => <SelectItem key={p.insurance_id} value={String(p.insurance_id)}>{p.plan_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label htmlFor="fee-from">Effective From *</Label><Input id="fee-from" type="date" required value={form.effectiveFrom} onChange={e => change('effectiveFrom', e.target.value)} onBlur={() => draft.touch('effectiveFrom')} /><SettingsFieldError draft={draft} field="effectiveFrom" /></div>
                <div className="space-y-2"><Label htmlFor="fee-to">Effective To (exclusive)</Label><Input id="fee-to" type="date" min={form.effectiveFrom} value={form.effectiveTo} onChange={e => change('effectiveTo', e.target.value)} onBlur={() => draft.touch('effectiveTo')} /><SettingsFieldError draft={draft} field="effectiveTo" /></div>
              </div>
              <p className="text-sm text-muted-foreground">New schedules start with the current Standard prices, or base price + office fee if no Standard price exists. Edit the complete amount below; office fees are already included. For future rate changes, add a new schedule version with a later start date.</p>
              <Table><TableHeader><TableRow><TableHead>Include</TableHead><TableHead>Procedure Code</TableHead><TableHead>Description</TableHead><TableHead>Reference Rate</TableHead><TableHead>Schedule Price *</TableHead></TableRow></TableHeader>
                <TableBody>{form.procedureFees.map(item => <TableRow key={item.code}>
                  <TableCell><input type="checkbox" aria-label={`Include ${item.name}`} checked={item.included} onChange={e => { changeItem(item.code, { included: e.target.checked }); draft.touch('procedureFees') }} /></TableCell>
                  <TableCell>{item.code}</TableCell><TableCell>{item.name}</TableCell><TableCell className="whitespace-nowrap">{money(item.referenceFee)}</TableCell>
                  <TableCell><Input aria-label={`Price for ${item.name}`} type="number" min="0" max="9999999999.99" step="0.01" required={item.included} disabled={!item.included || busy} value={item.scheduleFee} onBlur={() => draft.touch(`price:${item.code}`)} onChange={e => changeItem(item.code, { scheduleFee: e.target.value })} /><SettingsFieldError draft={draft} field={`price:${item.code}`} /></TableCell>
                </TableRow>)}</TableBody>
              </Table>
              <SettingsFieldError draft={draft} field="procedureFees" />
              {form.procedureFees.length === 0 && <p>No procedures available. Add procedures first.</p>}
            </fieldset>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setForm(null)}>Cancel</Button><Button type="submit" className="bg-blue-500" disabled={busy || !draft.canSave}>{busy ? 'Saving...' : 'Save Fee Schedule'}</Button></div>
          </form>}
        </DialogContent>
      </Dialog>
      <Dialog open={deleting !== null} onOpenChange={value => { if (!value && !busy) setDeleting(null) }}>
        <DialogContent><DialogHeader><DialogTitle>Delete Fee Schedule</DialogTitle><DialogDescription>Delete {deleting?.scheduleName} and all its procedure prices? This cannot be undone. Removing a schedule can change which rates apply to future charges.</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button className="bg-red-600 hover:bg-red-700" disabled={busy} onClick={remove}>{busy ? 'Deleting...' : 'Delete Fee Schedule'}</Button></div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function SettingsBranchesTab({ account, branches, setBranches, loading, loadError, reload }) {
  const toast = useSettingsToast()
  const [form, setForm] = useState(null)
  const draft = useSettingsDraft('branch', form)
  const [busy, setBusy] = useState(false)
  const [, setError] = useSettingsFeedback()
  const [deleting, setDeleting] = useState(null)
  const canManage = account?.role === 'IT Admin'
  const openForm = branch => {
    const next = branch ? { ...branch, email: branch.email || '' } : newBranchForm()
    setForm(next)
    draft.start(branch ? next : null)
    setError('')
  }
  const updateList = branch => setBranches(previous => {
    const exists = previous.some(b => b.branch_id === branch.branch_id)
    return (exists ? previous.map(b => b.branch_id === branch.branch_id ? branch : b) : [...previous, branch])
      .sort((a, b) => a.name.localeCompare(b.name))
  })
  const save = async event => {
    event.preventDefault()
    if (busy || !canManage || !draft.canSave) return
    setBusy(true)
    setError('')
    let saved
    try {
      saved = await settingsAPI.saveBranch(account.facility_id, form.branch_id, form)
      updateList(saved)
      setForm(null)
      if (form.branch_id) toast.edited('Branch updated.', draft.changes, saved.name)
      else toast.success('Branch saved.', saved.name)
    } catch (err) {
      setError(err.message)
    } finally { setBusy(false) }
  }
  const remove = async () => {
    if (busy || !canManage) return
    setBusy(true)
    setError('')
    try {
      const result = await settingsAPI.deleteBranch(account.facility_id, deleting.branch_id)
      setBranches(previous => previous.filter(b => b.branch_id !== result.id))
      setDeleting(null)
      toast.success(result.warning || 'Branch deleted.', deleting.name)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div><CardTitle>Locations</CardTitle><CardDescription>Manage clinic branches and contact information</CardDescription></div>
        {canManage && <Button className="bg-blue-500" disabled={loading || !!loadError} onClick={() => openForm(null)}><Plus className="w-4 h-4 mr-2" />Add Branch</Button>}
      </CardHeader>
      <CardContent>
        <SettingsHospitalLogo account={account} />
        {loadError && <Button variant="outline" size="sm" className="mb-4" onClick={reload}>Retry</Button>}
        <Table><TableHeader><TableRow>{['Branch', 'Code', 'Address', 'Contact', 'Status', 'Actions'].map(label => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{loading ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">Loading branches...</TableCell></TableRow>
            : branches.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">{loadError ? 'Branches unavailable.' : 'No branches found. Add a branch to get started.'}</TableCell></TableRow>
            : branches.map(branch => <TableRow key={branch.branch_id}>
              <TableCell className="font-medium">{branch.name}</TableCell><TableCell>{branch.abbreviation}</TableCell><TableCell className="min-w-[180px] max-w-xs whitespace-normal break-words">{branch.address}</TableCell>
              <TableCell><div>{branch.contact_num}</div><div className="text-xs text-muted-foreground">{branch.email}</div></TableCell>
              <TableCell>{branch.is_active ? 'Active' : 'Inactive'}</TableCell>
              <TableCell><div className="flex gap-2"><SettingsActionButton action={canManage ? 'edit' : 'view'} label={`${canManage ? 'Edit' : 'View'} ${branch.name}`} onClick={() => openForm(branch)} />{canManage && <SettingsActionButton action="delete" label={`Delete ${branch.name}`} onClick={() => { setError(''); setDeleting(branch) }} />}</div></TableCell>
            </TableRow>)}</TableBody>
        </Table>
      </CardContent>
      <Dialog open={form !== null} onOpenChange={value => { if (!value && !busy) setForm(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{!canManage ? 'Branch Details' : form?.branch_id ? 'Edit Branch' : 'Add Branch'}</DialogTitle><DialogDescription>Enter the branch details. Fields marked with * are required.</DialogDescription></DialogHeader>
          {form && <form onSubmit={save} className="space-y-6" onBlurCapture={event => draft.touch(event.target.id?.replace(/^branch-/, ''))}>
            <fieldset disabled={busy || !canManage} className="grid gap-4 md:grid-cols-2">
              {[
                ['name', 'Branch Name', 'text', true, 160], ['abbreviation', 'Branch Code', 'text', true, 30],
                ['address', 'Address', 'text', true, 1000], ['contact_num', 'Phone', 'tel', true, 50],
                ['email', 'Email', 'email', false, 254]
              ].map(([key, label, type, required, max]) => <div key={key} className={`space-y-2 ${key === 'address' ? 'md:col-span-2' : ''}`}><Label htmlFor={`branch-${key}`}>{label}{required && <span className="text-red-500"> *</span>}</Label><Input id={`branch-${key}`} type={type} required={required} maxLength={max} value={form[key]} aria-invalid={draft.touched[key] && !!draft.errors[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} /><SettingsFieldError draft={draft} field={key} /></div>)}
              <label className={`flex items-center justify-between gap-3 rounded-lg border p-3 text-sm font-medium ${form.is_active ? 'border-blue-200 bg-blue-50/50' : 'border-slate-200'}`}><span>Active Branch</span><Checkbox className="h-5 w-5 rounded-md" checked={form.is_active} disabled={busy || !canManage} onCheckedChange={checked => setForm(previous => ({ ...previous, is_active: checked === true }))} /></label>
            </fieldset>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setForm(null)}>{canManage ? 'Cancel' : 'Close'}</Button>{canManage && <Button type="submit" className="bg-blue-500" disabled={busy || !draft.canSave}>{busy ? 'Saving...' : 'Save Branch'}</Button>}</div>
          </form>}
        </DialogContent>
      </Dialog>
      <Dialog open={deleting !== null} onOpenChange={value => { if (!value && !busy) setDeleting(null) }}>
        <DialogContent><DialogHeader><DialogTitle>Delete Branch</DialogTitle><DialogDescription>Delete {deleting?.name}? This cannot be undone. Branches with linked rooms cannot be deleted.</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button className="bg-red-600 hover:bg-red-700" disabled={busy} onClick={remove}>{busy ? 'Deleting...' : 'Delete Branch'}</Button></div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function SettingsRoomsTab({ account, branches, branchesLoading, branchesError, reloadBranches }) {
  const toast = useSettingsToast()
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useSettingsFeedback()
  const [form, setForm] = useState(null)
  const draft = useSettingsDraft('room', form)
  const [, setError] = useSettingsFeedback()
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [branchFilter, setBranchFilter] = useState('all')
  const [statusBusy, setStatusBusy] = useState(null)
  const canChangeStatus = ['IT Admin', 'Hospital Staff'].includes(account?.role)
  const canManage = account?.role === 'IT Admin'
  const load = async () => {
    if (!account?.facility_id) return
    setLoading(true)
    setLoadError('')
    try { setRooms(await settingsAPI.getOperatoryRooms(account.facility_id)) }
    catch (err) { setLoadError(err.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (account?.facility_id) load() }, [account?.facility_id])
  const openForm = room => {
    setError('')
    const next = room ? { ...room, equipment: room.equipment?.length ? [...room.equipment] : [''] }
      : newRoomForm(branches.find(b => b.is_active)?.branch_id)
    setForm(next)
    draft.start(room ? next : null)
  }
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const save = async event => {
    event.preventDefault()
    if (busy || !canManage || !draft.canSave) return
    setBusy(true)
    setError('')
    try {
      const saved = await settingsAPI.saveOperatoryRoom(account.facility_id, form.room_id, form)
      setRooms(previous => (form.room_id ? previous.map(r => r.room_id === saved.room_id ? saved : r) : [...previous, saved])
        .sort((a, b) => a.code.localeCompare(b.code)))
      setForm(null)
      if (form.room_id) toast.edited('Room updated.', draft.changes.map(change => change.field === 'Branch' ? { ...change, before: branchName(change.before), after: branchName(change.after) } : change), saved.name)
      else toast.success('Room saved.', saved.name)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const remove = async () => {
    if (busy || !canManage) return
    setBusy(true)
    setError('')
    try {
      const id = await settingsAPI.deleteOperatoryRoom(account.facility_id, deleting.room_id)
      setRooms(previous => previous.filter(r => r.room_id !== id))
      setDeleting(null)
      toast.success('Room deleted.', deleting.name)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  const updateStatus = async (room, status) => {
    if (!canChangeStatus || statusBusy || status === room.status) return
    setStatusBusy(room.room_id)
    setError('')
    try {
      const saved = await settingsAPI.updateOperatingRoomStatus(room.room_id, status, room.status)
      setRooms(previous => previous.map(r => r.room_id === saved.room_id ? saved : r))
      toast.edited('Room status updated.', [{ field: 'Status', before: room.status, after: saved.status }], room.name)
    } catch (err) { setError(err.message); await load() }
    finally { setStatusBusy(null) }
  }
  const unavailable = loading || branchesLoading || !!loadError || !!branchesError
  const branchName = id => branches.find(b => b.branch_id === id)?.name || 'Branch unavailable'
  const filtered = branchFilter === 'all' ? rooms : rooms.filter(room => room.branch_id === branchFilter)
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div><CardTitle>Operating Rooms</CardTitle><CardDescription>Manage treatment rooms, equipment, and availability</CardDescription></div>
        {canManage && <Button className="bg-blue-500" disabled={unavailable || !branches.some(b => b.is_active)} onClick={() => openForm(null)}><Plus className="w-4 h-4 mr-2" />Add Room</Button>}
      </CardHeader>
      <CardContent>
        {(loadError || branchesError) && <Button variant="outline" size="sm" className="mb-4" onClick={() => { load(); reloadBranches() }}>Retry</Button>}
        <div className="w-full sm:w-64 mb-4"><Select value={branchFilter} onValueChange={setBranchFilter}><SelectTrigger aria-label="Filter rooms by branch"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Branches</SelectItem>{branches.map(branch => <SelectItem key={branch.branch_id} value={branch.branch_id}>{branch.name}</SelectItem>)}</SelectContent></Select></div>
        <Table><TableHeader><TableRow>{['Room Code', 'Room Name', 'Branch', 'Floor', 'Patient Capacity', 'Turnaround Time', 'Equipment', 'Status', 'Actions'].map(label => <TableHead key={label} className="whitespace-nowrap">{label}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{loading || branchesLoading ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">Loading rooms...</TableCell></TableRow>
            : filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground">{loadError ? 'Rooms unavailable.' : branches.length === 0 ? 'Add a branch in Locations before adding rooms.' : 'No rooms found.'}</TableCell></TableRow>
            : filtered.map(room => <TableRow key={room.room_id}><TableCell className="font-mono">{room.code}</TableCell><TableCell className="font-medium">{room.name}</TableCell><TableCell>{branchName(room.branch_id)}</TableCell><TableCell className="min-w-[140px]">{room.floor_location || '?'}</TableCell><TableCell>{room.patient_capacity}</TableCell><TableCell className="whitespace-nowrap">{room.turnaround_minutes == null ? '?' : `${room.turnaround_minutes} min`}</TableCell><TableCell className="min-w-[190px] align-top">
                {room.equipment?.length ? (
                  <details className="group relative">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-md border px-3 py-2 hover:bg-slate-50">
                      <span className="text-sm font-normal text-gray-700">{room.equipment.length} {room.equipment.length === 1 ? 'item' : 'items'}</span>
                      <svg className="h-4 w-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                      </svg>
                    </summary>
                    <div className="absolute left-0 top-full z-50 mt-2 w-64 rounded-lg border bg-white p-3 shadow-lg">
                      <ul className="max-h-60 overflow-y-auto space-y-3">
                        {room.equipment.map((item, index) => <li key={`${index}-${item}`} className="text-sm font-normal text-gray-800 break-words">{item}</li>)}
                      </ul>
                    </div>
                  </details>
                ) : <span className="text-sm text-gray-400">Not set</span>}
              </TableCell><TableCell><Select value={room.status} disabled={unavailable || statusBusy !== null || !canChangeStatus} onValueChange={status => updateStatus(room, status)}><SelectTrigger className="w-40" aria-label={`Status of ${room.name}`}><SelectValue /></SelectTrigger><SelectContent>{ROOM_STATUSES.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></TableCell>
              <TableCell><div className="flex gap-2"><SettingsActionButton action={canManage ? 'edit' : 'view'} label={`${canManage ? 'Edit' : 'View'} ${room.name}`} disabled={unavailable} onClick={() => openForm(room)} />{canManage && <SettingsActionButton action="delete" label={`Delete ${room.name}`} onClick={() => { setError(''); setDeleting(room) }} />}</div></TableCell>
            </TableRow>)}</TableBody>
        </Table>
      </CardContent>
      <Dialog open={form !== null} onOpenChange={value => { if (!value && !busy) setForm(null) }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{!canManage ? 'Room Details' : form?.room_id ? 'Edit Room' : 'Add Room'}</DialogTitle><DialogDescription>Room details, equipment, and branch assignment</DialogDescription></DialogHeader>
          {form && <form onSubmit={save} className="space-y-6" onBlurCapture={event => draft.touch(event.target.id?.replace(/^room-/, ''))}>
            <fieldset disabled={busy || !canManage} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="room-branch">Branch <span className="text-red-500">*</span></Label><Select value={form.branch_id} disabled={busy || !canManage} onValueChange={value => change('branch_id', value)}><SelectTrigger id="room-branch"><SelectValue placeholder="Select branch" /></SelectTrigger><SelectContent>{branches.filter(b => b.is_active || b.branch_id === form.branch_id).map(branch => <SelectItem key={branch.branch_id} value={branch.branch_id}>{branch.name}{!branch.is_active ? ' (Inactive)' : ''}</SelectItem>)}</SelectContent></Select></div>
                {[
                  ['code', 'Room Code', 'text', true, undefined, undefined, undefined],
                  ['name', 'Room Name', 'text', true, undefined, undefined, undefined],
                  ['floor_location', 'Floor / Location', 'text', false, undefined, undefined, undefined],
                  ['patient_capacity', 'Patient Capacity', 'number', true, '1', '50', '1'],
                  ['turnaround_minutes', 'Turnaround Time (minutes)', 'number', true, '0', '240', '1']
                ].map(([key, label, type, required, min, max, step]) => <div key={key} className="space-y-2"><Label htmlFor={`room-${key}`}>{label}{required && <span className="text-red-500"> *</span>}</Label><Input id={`room-${key}`} type={type} required={required} min={min} max={max} step={step} maxLength={key === 'code' ? 30 : 160} value={form[key]} aria-invalid={draft.touched[key] && !!draft.errors[key]} onChange={event => change(key, event.target.value)} /><SettingsFieldError draft={draft} field={key} /></div>)}
                <div className="space-y-2"><Label htmlFor="room-status">Status</Label><Select value={form.status} disabled={busy || !canManage} onValueChange={value => change('status', value)}><SelectTrigger id="room-status"><SelectValue /></SelectTrigger><SelectContent>{ROOM_STATUSES.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between"><Label>Equipment</Label>{canManage && <Button type="button" variant="outline" size="icon" aria-label="Add equipment" disabled={busy || form.equipment.length >= 50} onClick={() => change('equipment', [...form.equipment, ''])}><Plus className="w-4 h-4" /></Button>}</div>
                {form.equipment.map((item, index) => <div key={index} className="flex gap-2"><Input aria-label={`Equipment ${index + 1}`} onBlur={() => draft.touch(`equipment.${index}`)} maxLength={160} value={item} placeholder="Equipment name" onChange={event => change('equipment', form.equipment.map((value, i) => i === index ? event.target.value : value))} />{canManage && <Button type="button" variant="ghost" size="icon" aria-label={`Remove equipment ${index + 1}`} onClick={() => change('equipment', form.equipment.length === 1 ? [''] : form.equipment.filter((_, i) => i !== index))}><X className="w-4 h-4" /></Button>}<SettingsFieldError draft={draft} field={`equipment.${index}`} /></div>)}
                <SettingsFieldError draft={draft} field="equipment" />
              </div>
            </fieldset>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setForm(null)}>{canManage ? 'Cancel' : 'Close'}</Button>{canManage && <Button type="submit" className="bg-blue-500" disabled={busy || !draft.canSave}>{busy ? 'Saving...' : 'Save Room'}</Button>}</div>
          </form>}
        </DialogContent>
      </Dialog>
      <Dialog open={deleting !== null} onOpenChange={value => { if (!value && !busy) setDeleting(null) }}>
        <DialogContent><DialogHeader><DialogTitle>Delete Room</DialogTitle><DialogDescription>Delete {deleting?.name}? This cannot be undone.</DialogDescription></DialogHeader>
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button className="bg-red-600 hover:bg-red-700" disabled={busy} onClick={remove}>{busy ? 'Deleting...' : 'Delete Room'}</Button></div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function SettingsHospitalLogo({ account }) {
  const toast = useSettingsToast()
  const [branding, setBranding] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useSettingsFeedback()
  const [loading, setLoading] = useState(true)
  const input = useRef(null)
  const canManage = account?.role === 'IT Admin'
  const load = async () => {
    if (!account?.facility_id) return
    setLoading(true)
    setError('')
    try {
      const data = await settingsAPI.getHospitalLogo(account.facility_id)
      setBranding(data)
      if (data.logoError) setError(data.logoError)
    }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }
  useEffect(() => { if (account?.facility_id) load() }, [account?.facility_id])
  const save = async file => {
    if (busy || !branding || !canManage) return
    setBusy(true)
    setError('')
    try {
      if (file) {
        await validateLogo(file)
        if (typeof createImageBitmap === 'function') {
          const image = await createImageBitmap(file)
          const tooLarge = image.width > 4096 || image.height > 4096
          image.close()
          if (tooLarge) throw new Error('Logo dimensions must be at most 4096 × 4096 pixels.')
        }
      }
      const result = await settingsAPI.setHospitalLogo(branding, file)
      setBranding(result.branding)
      if (file && branding.logo_path) toast.edited('Hospital logo updated.', [{ field: 'Hospital Logo', before: 'Previous logo', after: 'New logo' }])
      else toast.success(file ? 'Hospital logo saved.' : 'Hospital logo removed.')
      if (result.branding.logoError) setError(result.branding.logoError)
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }
  return (
    <div className="mb-6 pb-6 border-b">
      <div className="flex flex-wrap items-center gap-4">
        <div className="w-24 h-24 rounded-lg border-2 border-dashed flex items-center justify-center bg-slate-50 overflow-hidden">{branding?.logoUrl ? <img src={branding.logoUrl} alt="Hospital logo" className="w-full h-full object-contain" /> : <Building2 className="w-8 h-8 text-slate-300" />}</div>
        <div className="space-y-2">
          {canManage && <div className="flex gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Choose hospital logo" className="hidden" disabled={busy || loading} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) save(file) }} />
            <Button type="button" variant="outline" disabled={busy || loading || !branding} onClick={() => input.current?.click()}>{busy ? 'Saving...' : 'Upload Logo'}</Button>
            {branding?.logo_path && <Button type="button" variant="ghost" disabled={busy} onClick={() => save(null)}>Remove Logo</Button>}
          </div>}
          <p className="text-xs text-muted-foreground">PNG, JPEG, or WebP up to 2 MB.</p>
        </div>
      </div>
      {(error || branding?.logoError) && <Button variant="outline" size="sm" className="mt-3" disabled={busy} onClick={load}>Retry</Button>}
    </div>
  )
}


function SettingsActionButton({ action, label, ...props }) {
  const Icon = action === 'delete' ? Trash2 : action === 'view' ? Eye : Pencil
  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} title={label}
      className={`h-8 w-8 ${action === 'delete' ? 'text-red-600 hover:text-red-700 hover:bg-red-50' : ''}`} {...props}>
      <Icon className="h-4 w-4" aria-hidden="true" />
    </Button>
  )
}


function useSettingsFeedback() {
  const toast = useSettingsToast()
  const [message, setMessage] = useState('')
  const report = useCallback(value => {
    setMessage(value)
    if (value) toast.error(value)
  }, [toast])
  return [message, report]
}


const SettingsNotificationContext = createContext(null)

function useSettingsToast() {
  const notify = useContext(SettingsNotificationContext)
  return useMemo(() => ({
    success: (message, subject) => notify('success', message, [], subject),
    error: message => notify('error', message),
    warning: message => notify('warning', message),
    info: message => notify('info', message),
    edited: (message, changes, subject) => notify('edited', message, changes, subject)
  }), [notify])
}

function SettingsNotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])
  const notify = useCallback((kind, message, changes = [], subject = '') => {
    if (!message) return
    setNotifications(previous => previous.some(item => item.kind === kind && item.message === message && item.subject === subject && JSON.stringify(item.changes) === JSON.stringify(changes))
      ? previous : [...previous, { kind, message, changes, subject }])
  }, [])
  const dismiss = () => setNotifications(previous => previous.slice(1))
  const current = notifications[0]
  // Keep the last content throughout the close animation instead of switching
  // to an empty/default notification while Radix is still rendering the dialog.
  const lastNotification = useRef(null)
  if (current) lastNotification.current = current
  const displayed = current || lastNotification.current
  const styles = {
    success: {
      Icon: Check,
      icon: 'bg-emerald-100 text-emerald-600',
      button: 'from-emerald-400 via-emerald-500 to-emerald-600 hover:from-emerald-500 hover:to-emerald-700 shadow-[0_5px_14px_rgba(16,185,129,0.24)]'
    },
    error: {
      Icon: X,
      icon: 'bg-red-100 text-red-500',
      button: 'from-rose-200 via-rose-300 to-red-400 hover:from-rose-300 hover:to-red-500 shadow-[0_5px_14px_rgba(251,113,133,0.24)]'
    },
    edited: {
      Icon: Pencil,
      icon: 'bg-blue-100 text-blue-600',
      button: 'from-sky-300 via-sky-400 to-blue-500 hover:from-sky-400 hover:to-blue-600 shadow-[0_5px_14px_rgba(59,130,246,0.24)]'
    },
    warning: {
      Icon: TriangleAlert,
      icon: 'bg-amber-100 text-amber-600',
      button: 'from-amber-200 via-amber-300 to-orange-400 hover:from-amber-300 hover:to-orange-500 shadow-[0_5px_14px_rgba(245,158,11,0.24)]'
    },
    info: {
      Icon: Info,
      icon: 'bg-blue-100 text-blue-600',
      button: 'from-sky-200 via-sky-300 to-blue-500 hover:from-sky-300 hover:to-blue-600 shadow-[0_5px_14px_rgba(59,130,246,0.24)]'
    }
  }
  const isDeletion = displayed?.kind === 'success' && /\b(deleted|removed)\b/i.test(displayed.message)
  const isCopy = displayed?.kind === 'success' && /\bcopied\b/i.test(displayed.message)
  const appearance = isDeletion ? styles.error : isCopy ? styles.info : styles[displayed?.kind] || styles.info
  const Icon = isDeletion ? Trash2 : isCopy ? Copy : appearance.Icon
  return (
    <SettingsNotificationContext.Provider value={notify}>
      {children}
      <Dialog open={!!current} onOpenChange={open => { if (!open) dismiss() }}>
        <DialogContent aria-describedby={undefined} className={`z-[80] w-[calc(100vw-3rem)] ${displayed?.changes?.length ? 'max-w-[460px] sm:max-w-[460px]' : 'max-w-[340px] sm:max-w-[340px]'} rounded-lg sm:rounded-lg border-white/70 bg-white/95 px-8 pb-7 pt-16 shadow-[0_24px_80px_rgba(45,45,80,0.18)] [&>button]:hidden`}>
          <div className={`absolute -top-10 left-1/2 flex h-20 w-20 -translate-x-1/2 items-center justify-center rounded-full ${appearance.icon}`}>
            <Icon className="h-9 w-9" strokeWidth={2.5} aria-hidden="true" />
          </div>
          <DialogHeader className="items-center space-y-2 text-center sm:text-center">
            <DialogTitle className="text-[22px] font-semibold leading-snug tracking-tight text-[#373252] break-words">{displayed?.message}</DialogTitle>
            {displayed?.subject && <p className="text-lg font-semibold leading-snug text-slate-800 break-words">{displayed.subject}</p>}
          </DialogHeader>
          {displayed?.changes?.length > 0 && <div className="max-h-[35vh] overflow-y-auto space-y-3 text-sm" aria-label="Saved changes">
            {displayed.changes.map((change, index) => <div key={`${index}-${change.field}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <p className="font-medium text-slate-700">{change.field}</p>
              {change.action === 'added' ? (
                <p className="mt-2 break-words text-sm text-slate-800"><span>Added: </span>{change.after}</p>
              ) : change.action === 'deleted' ? (
                <p className="mt-2 break-words text-sm text-slate-800"><span>Deleted: </span>{change.before}</p>
              ) : (
                <p className="mt-2 break-words text-sm leading-relaxed"><span className="text-slate-500">{change.before}</span><span className="mx-2 text-slate-400">changed to</span><span className="text-slate-800">{change.after}</span></p>
              )}
            </div>)}
          </div>}
          <div className="mt-3 flex justify-center">
            <Button className={`h-11 w-full max-w-[220px] rounded-full border-0 bg-gradient-to-b text-sm font-medium text-white transition-all hover:brightness-105 ${appearance.button}`} onClick={dismiss}>OK</Button>
          </div>
        </DialogContent>
      </Dialog>
    </SettingsNotificationContext.Provider>
  )
}


function useSettingsDraft(type, values) {
  const [original, setOriginal] = useState(null)
  const [touched, setTouched] = useState({})
  const errors = validateSettingsForm(type, values || {})
  const changes = settingsChanges(type, original, values)
  return {
    errors, changes, touched,
    canSave: Object.keys(errors).length === 0 && (!original || changes.length > 0),
    start: value => { setOriginal(value ? structuredClone(value) : null); setTouched({}) },
    touch: field => { if (field) setTouched(previous => previous[field] ? previous : { ...previous, [field]: true }) }
  }
}

function SettingsFieldError({ draft, field }) {
  return draft.touched[field] && draft.errors[field]
    ? <p role="alert" className="text-xs text-red-600 leading-relaxed">{draft.errors[field]}</p>
    : null
}