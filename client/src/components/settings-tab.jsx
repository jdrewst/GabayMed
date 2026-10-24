import { useState, useEffect } from "react"
import { Building2, Plus } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { buildFeeForm, feeFormPayload, feeScheduleStatus } from "../lib/fee-schedules"
import { settingsAPI } from "../../services/settings" // Import API

export function SettingsTabs() {
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [account, setAccount] = useState(null)
  const [accessError, setAccessError] = useState('')
  const [creatingProvider, setCreatingProvider] = useState(false)
  const [providerError, setProviderError] = useState('')
  const [createdCredentials, setCreatedCredentials] = useState(null)
  const [copyMessage, setCopyMessage] = useState('')
  const canAddProvider = account?.role === 'IT Admin'

  useEffect(() => {
    let active = true
    settingsAPI.getAccessContext().then(data => { if (active) setAccount(data) })
      .catch(error => { if (active) setAccessError(error.message) })
    return () => { active = false }
  }, [])
  const [procedures, setProcedures] = useState([])
  const [procedureLoadError, setProcedureLoadError] = useState('')
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

  const [locationData, setLocationData] = useState({
    clinicName: '',
    abbreviation: '',
    address: '',
    phone: '',
    email: '',
    timezone: 'Asia/Manila'
  })
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

  // Fetch location data
  useEffect(() => {
    const fetchLocation = async () => {
      const data = await settingsAPI.getLocation();
      if (data) {
        setLocationData(data);
      }
    }
    fetchLocation()
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

  // Helper to format schedule for display
  const formatScheduleDisplay = (schedule) => {
    if (!schedule || typeof schedule !== 'object') return 'Not set'
    const activeDays = Object.keys(schedule)
    if (activeDays.length === 0) return 'Not set'
    
    // Check if all times are the same
    const firstTime = schedule[activeDays[0]]
    const allSame = activeDays.every(d => schedule[d] === firstTime)
    
    const dayNames = activeDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')
    
    if (allSame) {
      return `${dayNames} (${firstTime})`
    }
    return dayNames // Just list days if times differ
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

  // Handle user form input changes
  const handleUserInputChange = (field, value) => {
    setUserFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Handle location form input changes
  const handleLocationInputChange = (field, value) => {
    setLocationData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Validate user form
  const isUserFormValid = () => {
    return userFormData.name.trim().length >= 2 &&
           userFormData.email.trim().length > 0 &&
           userFormData.role.length > 0
  }

  // Handle save new user (Provider)
  const handleSaveUser = async () => {
    if (creatingProvider) return
    if (!canAddProvider) {
      setProviderError('Only IT Admin accounts can add providers.')
      return
    }
    if (!isUserFormValid()) {
      alert('Please fill in all required fields.')
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
      alert('Please select at least one valid working day and schedule.');
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
      setCopyMessage('')
    } else {
      setProviderError(result.error)
    }
  }

  // Handle edit user
  const handleEditUser = (user) => {
    console.log("Editing provider:", user);

    setEditingUserId(user.id)
    setUserFormData({
      name: user.name || '',
      email: user.email || '',
      role: (user.type || user.role || '').toUpperCase(),
      licenseNo: user.licenseNo || '',
      specialization: user.specialization || '',
    })
    setScheduleData(parseScheduleToState(user.schedule))
    setIsEditUserDialogOpen(true)
  }

  // Handle update user (Provider)
  const handleUpdateUser = async () => {
    if (!userFormData.name.trim() || !userFormData.email.trim()) {
      alert('Please fill in all required fields.')
      return
    }

    const payload = {
      ...userFormData,
      schedule: formatScheduleForAPI()
    }

    const result = await settingsAPI.updateProvider(editingUserId, payload);

    if (result.success) {
      // Update user in the list
      setUsers(prev => prev.map(u => 
        u.id === editingUserId ? { ...u, ...payload, type: payload.role } : u
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
      alert('Provider updated successfully!')
    } else {
      alert('Failed to update provider: ' + result.error)
    }
  }

  // Handle save location
  const handleSaveLocation = async () => {
    const result = await settingsAPI.updateLocation(locationData);

    if (result.success) {
      const updatedFacility = {
        clinicName: locationData.clinicName,
        name: locationData.clinicName,
        abbreviation: locationData.abbreviation,
        address: locationData.address,
        location: locationData.address,
        phone: locationData.phone,
        email: locationData.email,
        timezone: locationData.timezone || 'Asia/Manila'
      };
      if (typeof window !== 'undefined') {
        localStorage.setItem('gabay_facility_data', JSON.stringify(updatedFacility));
        window.dispatchEvent(new CustomEvent('facilityUpdated', { detail: updatedFacility }));
      }
      alert('Location updated successfully!')
    } else {
      alert('Failed to save location: ' + result.error)
    }
  }

  return (
    <div className="space-y-6 -mt-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-muted-foreground">Manage your clinic configuration and preferences</p>
      </div>

      {accessError && <p role="alert" className="text-sm text-red-600">{accessError}</p>}
      {account && <p className="text-sm text-muted-foreground">Signed in as {account.role}</p>}
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
                setCopyMessage('Login details copied.')
              } catch { setCopyMessage('Copy was unavailable. Select and copy the login details manually.') }
            }}>Copy Login Details</Button>
            {copyMessage && <p role="status" className="text-sm">{copyMessage}</p>}
            <div className="flex justify-end"><Button onClick={() => setCreatedCredentials(null)}>Done</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4 lg:w-[600px]">
          <TabsTrigger value="users">Providers</TabsTrigger>
          <TabsTrigger value="location">Location</TabsTrigger>
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
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name <span className="text-red-500">*</span></Label>
                        <Input
                          id="name"
                          placeholder="Dr. Juan Dela Cruz"
                          value={userFormData.name}
                          onChange={(e) => handleUserInputChange('name', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address <span className="text-red-500">*</span></Label>
                        <Input
                          id="email"
                          type="email"
                          placeholder="juan.delacruz@clinic.ph"
                          value={userFormData.email}
                          onChange={(e) => handleUserInputChange('email', e.target.value)}
                        />
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
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="specialization">Specialization</Label>
                        <Input
                          id="specialization"
                          placeholder="e.g. Cardiology, General Dentistry"
                          value={userFormData.specialization}
                          onChange={(e) => handleUserInputChange('specialization', e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="schedule">Schedule Details</Label>
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
                  {providerError && <p role="alert" className="text-sm text-red-600 mt-3">{providerError}</p>}
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
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-name">Full Name <span className="text-red-500">*</span></Label>
                        <Input
                          id="edit-name"
                          placeholder="Dr. Juan Dela Cruz"
                          value={userFormData.name}
                          onChange={(e) => handleUserInputChange('name', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-email">Email Address <span className="text-red-500">*</span></Label>
                        <Input
                          id="edit-email"
                          type="email"
                          placeholder="juan.delacruz@clinic.ph"
                          value={userFormData.email}
                          onChange={(e) => handleUserInputChange('email', e.target.value)}
                        />
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
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-licenseNo">License Number</Label>
                        <Input
                          id="edit-licenseNo"
                          placeholder="PRC-123456"
                          value={userFormData.licenseNo}
                          onChange={(e) => handleUserInputChange('licenseNo', e.target.value)}
                        />
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
                        />
                      </div>
                      <div className="space-y-2">
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
                          <Button variant="ghost" size="sm" onClick={() => handleEditUser(user)}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Location Info Tab */}
        <TabsContent value="location">
          <Card>
            <CardHeader>
              <CardTitle>Location Information</CardTitle>
              <CardDescription>Clinic details used for billing and correspondence</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center bg-slate-50">
                  <Building2 className="w-8 h-8 text-slate-300" />
                </div>
                <Button variant="outline">Upload Logo</Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Clinic Name <span className="text-red-500">*</span></Label>
                  <Input 
                    value={locationData.clinicName} 
                    onChange={(e) => handleLocationInputChange('clinicName', e.target.value)}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Abbreviation</Label>
                  <Input 
                    value={locationData.abbreviation} 
                    onChange={(e) => handleLocationInputChange('abbreviation', e.target.value)}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Address <span className="text-red-500">*</span></Label>
                  <Input 
                    value={locationData.address} 
                    onChange={(e) => handleLocationInputChange('address', e.target.value)}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone <span className="text-red-500">*</span></Label>
                  <Input 
                    value={locationData.phone} 
                    onChange={(e) => handleLocationInputChange('phone', e.target.value)}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email <span className="text-red-500">*</span></Label>
                  <Input 
                    type="email" 
                    value={locationData.email} 
                    onChange={(e) => handleLocationInputChange('email', e.target.value)}
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Input value={locationData.timezone} disabled />
                </div>
              </div>
              <div className="flex justify-end">
                <Button className="bg-blue-500" onClick={handleSaveLocation}>Save Changes</Button>
              </div>
            </CardContent>
          </Card>
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
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  const openForm = procedure => {
    setEditingId(procedure?.id ?? null)
    setForm(procedure ? { ...procedure } : { ...emptyForm })
    setError('')
    setOpen(true)
  }

  const save = async event => {
    event.preventDefault()
    if (busy) return
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
        {loadError && <p role="alert" className="text-sm text-red-600 mb-4">Failed to load procedures: {loadError}</p>}
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
                  <Button variant="ghost" size="sm" onClick={() => openForm(p)}>Edit</Button>
                  <Button variant="ghost" size="sm" className="text-red-600" onClick={() => { setDeleting(p); setDeleteError('') }}>Delete</Button>
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
          <form onSubmit={save} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              {fields.map(([key, label, type]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`procedure-${key}`}>{label} <span className="text-red-500">*</span></Label>
                  <Input id={`procedure-${key}`} type={type} required disabled={busy}
                    min={type === 'number' ? key === 'duration' ? 1 : 0 : undefined}
                    step={type === 'number' ? key === 'duration' ? 1 : '0.01' : undefined}
                    value={form[key]} onChange={event => setForm(previous => ({ ...previous, [key]: event.target.value }))} />
                </div>
              ))}
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-blue-500" disabled={busy}>{busy ? 'Saving...' : 'Save Procedure'}</Button>
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
          {deleteError && <p role="alert" className="text-sm text-red-600">{deleteError}</p>}
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
  const [schedules, setSchedules] = useState([])
  const [plans, setPlans] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState(null)
  const [error, setError] = useState('')
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
    setForm(buildFeeForm(procedures, schedules, schedule))
  }
  const change = (key, value) => setForm(previous => ({ ...previous, [key]: value }))
  const changeItem = (code, patch) => setForm(previous => ({ ...previous,
    procedureFees: previous.procedureFees.map(item => item.code === code ? { ...item, ...patch } : item)
  }))

  const save = async event => {
    event.preventDefault()
    if (busy) return
    setError('')
    try {
      const payload = feeFormPayload(form)
      setBusy(true)
      await settingsAPI.saveFeeSchedule(form.id, payload)
      setForm(null)
      setNotice('Fee schedule saved.')
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
      setNotice('Fee schedule deleted.')
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
        {notice && <p role="status" className="text-sm text-green-700 mb-3">{notice}</p>}
        {loadError && <div role="alert" className="mb-4 text-sm text-red-600">Failed to load schedules: {loadError} <Button variant="outline" size="sm" onClick={load}>Retry</Button></div>}
        {procedureLoadError && <p role="alert" className="text-sm text-red-600 mb-4">Procedure catalog unavailable: {procedureLoadError}</p>}
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
                <Button variant="ghost" size="sm" disabled={unavailable} onClick={() => openForm(schedule)}>Edit</Button>
                <Button variant="ghost" size="sm" className="text-red-600" disabled={loading} onClick={() => { setError(''); setDeleting(schedule) }}>Delete</Button>
              </div></TableCell>
            </TableRow>)}
        </TableBody></Table>
      </CardContent>
      <Dialog open={form !== null} onOpenChange={value => { if (!value && !busy) setForm(null) }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id != null ? 'Edit Fee Schedule' : 'Add Fee Schedule'}</DialogTitle>
            <DialogDescription>Choose the plan, effective dates, and complete procedure prices. HMO procedures without a rate fall back to Standard Rates.</DialogDescription>
          </DialogHeader>
          {form && <form onSubmit={save} className="space-y-6">
            <fieldset disabled={busy} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="fee-name">Schedule Name *</Label><Input id="fee-name" required value={form.scheduleName} onChange={e => change('scheduleName', e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="fee-plan">Insurance Plan</Label>
                  <Select disabled={busy} value={form.insuranceId || 'standard'} onValueChange={value => change('insuranceId', value === 'standard' ? '' : value)}>
                    <SelectTrigger id="fee-plan"><SelectValue /></SelectTrigger><SelectContent>
                      <SelectItem value="standard">Standard Rates (no insurance plan)</SelectItem>
                      {form.insuranceId && !plans.some(p => String(p.insurance_id) === form.insuranceId) && <SelectItem value={form.insuranceId}>Plan {form.insuranceId}</SelectItem>}
                      {plans.map(p => <SelectItem key={p.insurance_id} value={String(p.insurance_id)}>{p.plan_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label htmlFor="fee-from">Effective From *</Label><Input id="fee-from" type="date" required value={form.effectiveFrom} onChange={e => change('effectiveFrom', e.target.value)} /></div>
                <div className="space-y-2"><Label htmlFor="fee-to">Effective To (exclusive)</Label><Input id="fee-to" type="date" min={form.effectiveFrom} value={form.effectiveTo} onChange={e => change('effectiveTo', e.target.value)} /></div>
              </div>
              <p className="text-sm text-muted-foreground">New schedules start with the current Standard prices, or base price + office fee if no Standard price exists. Edit the complete amount below; office fees are already included. For future rate changes, add a new schedule version with a later start date.</p>
              <Table><TableHeader><TableRow><TableHead>Include</TableHead><TableHead>Procedure Code</TableHead><TableHead>Description</TableHead><TableHead>Reference Rate</TableHead><TableHead>Schedule Price *</TableHead></TableRow></TableHeader>
                <TableBody>{form.procedureFees.map(item => <TableRow key={item.code}>
                  <TableCell><input type="checkbox" aria-label={`Include ${item.name}`} checked={item.included} onChange={e => changeItem(item.code, { included: e.target.checked })} /></TableCell>
                  <TableCell>{item.code}</TableCell><TableCell>{item.name}</TableCell><TableCell className="whitespace-nowrap">{money(item.referenceFee)}</TableCell>
                  <TableCell><Input aria-label={`Price for ${item.name}`} type="number" min="0" max="9999999999.99" step="0.01" required={item.included} disabled={!item.included || busy} value={item.scheduleFee} onChange={e => changeItem(item.code, { scheduleFee: e.target.value })} /></TableCell>
                </TableRow>)}</TableBody>
              </Table>
              {form.procedureFees.length === 0 && <p>No procedures available. Add procedures first.</p>}
            </fieldset>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setForm(null)}>Cancel</Button><Button type="submit" className="bg-blue-500" disabled={busy || form.procedureFees.length === 0}>{busy ? 'Saving...' : 'Save Fee Schedule'}</Button></div>
          </form>}
        </DialogContent>
      </Dialog>
      <Dialog open={deleting !== null} onOpenChange={value => { if (!value && !busy) setDeleting(null) }}>
        <DialogContent><DialogHeader><DialogTitle>Delete Fee Schedule</DialogTitle><DialogDescription>Delete {deleting?.scheduleName} and all its procedure prices? This cannot be undone. Removing a schedule can change which rates apply to future charges.</DialogDescription></DialogHeader>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancel</Button><Button className="bg-red-600 hover:bg-red-700" disabled={busy} onClick={remove}>{busy ? 'Deleting...' : 'Delete Fee Schedule'}</Button></div>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
