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
import { settingsAPI } from "../../services/settings" // Import API

export function SettingsTabs() {
  const [activeTab, setActiveTab] = useState('users')
  const [users, setUsers] = useState([])
  const [procedures, setProcedures] = useState([])
  const [feeSchedules, setFeeSchedules] = useState([])
  const [editingProcedureId, setEditingProcedureId] = useState(null)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingProcedures, setLoadingProcedures] = useState(true)
  const [loadingFeeSchedules, setLoadingFeeSchedules] = useState(false)
  const [isUserDialogOpen, setIsUserDialogOpen] = useState(false)
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false)
  const [editingUserId, setEditingUserId] = useState(null)
  const [feeScheduleDialog, setFeeScheduleDialog] = useState(false)
  const [editFeeScheduleDialog, setEditFeeScheduleDialog] = useState(false)
  const [editingScheduleId, setEditingScheduleId] = useState(null)
  
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
    password: '',
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
  const [feeScheduleFormData, setFeeScheduleFormData] = useState({
    scheduleName: '',
    procedureFees: []
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
      const data = await settingsAPI.getProviders();
      setUsers(data);
      setLoadingUsers(false);
    }
    fetchUsers()
  }, [])

  // Fetch procedure codes from database
  useEffect(() => {
    const fetchProcedures = async () => {
      setLoadingProcedures(true);
      const data = await settingsAPI.getProcedures();
      setProcedures(data);
      
      // Initialize fee schedule form with procedures
      setFeeScheduleFormData(prev => ({
        ...prev,
        procedureFees: data.map(p => ({
          code: p.code,
          name: p.description,
          originalFee: p.officeFee,
          scheduleFee: p.officeFee
        }))
      }));
      setLoadingProcedures(false);
    }
    fetchProcedures()
  }, [])

  // Fetch fee schedules
  useEffect(() => {
    const fetchFeeSchedules = async () => {
      setLoadingFeeSchedules(true);
      const data = await settingsAPI.getFeeSchedules();
      setFeeSchedules(data);
      setLoadingFeeSchedules(false);
    }
    fetchFeeSchedules()
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

  // Helper function to format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount)
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

  // Handle fee schedule form input changes
  const handleFeeScheduleInputChange = (field, value) => {
    setFeeScheduleFormData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  // Update procedure fee in fee schedule form
  const updateProcedureFee = (code, newFee) => {
    setFeeScheduleFormData(prev => ({
      ...prev,
      procedureFees: prev.procedureFees.map(p =>
        p.code === code ? { ...p, scheduleFee: parseFloat(newFee) || p.originalFee } : p
      )
    }))
  }

  // Handle inline procedure edit
  const handleEditProcedure = (procedureId) => {
    setEditingProcedureId(procedureId)
  }

  // Handle procedure field change
  const handleProcedureFieldChange = (procedureId, field, value) => {
    setProcedures(prev => prev.map(p => 
      p.id === procedureId ? { ...p, [field]: field === 'officeFee' ? parseFloat(value) || 0 : value } : p
    ))
  }

  // Handle save procedure
  const handleSaveProcedure = async (procedure) => {
    const result = await settingsAPI.updateProcedure(procedure.id, {
      category: procedure.category,
      officeFee: procedure.officeFee
    });

    if (result.success) {
      setEditingProcedureId(null)
      alert('Procedure updated successfully!')
    } else {
      alert('Failed to save procedure: ' + result.error)
    }
  }

  // Handle cancel edit
  const handleCancelEdit = () => {
    setEditingProcedureId(null)
  }

  // Validate user form
  const isUserFormValid = () => {
    return userFormData.name.trim().length >= 2 &&
           userFormData.email.trim().length > 0 &&
           userFormData.role.length > 0
  }

  // Handle save new user (Provider)
  const handleSaveUser = async () => {
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

    const result = await settingsAPI.createProvider(payload);

    if (result.success) {
      // Add new user to the list
      setUsers(prev => [...prev, result.provider])
      
      // Reset form and close dialog
      setUserFormData({
        name: '',
        email: '',
        password: '',
        role: '',
        licenseNo: '',
        specialization: ''
      })
      setScheduleData(parseScheduleToState({})) // Reset schedule
      setIsUserDialogOpen(false)
      alert('Provider created successfully!')
    } else {
      alert('Failed to create provider: ' + result.error)
    }
  }

  // Handle edit user
  const handleEditUser = (user) => {
    setEditingUserId(user.id)
    setUserFormData({
      name: user.name,
      email: user.email,
      role: user.type || user.role,
      licenseNo: user.licenseNo,
      specialization: user.specialization || '',
      password: '' // Don't populate password
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
        password: '',
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
      alert('Location updated successfully!')
    } else {
      alert('Failed to save location: ' + result.error)
    }
  }

  // Handle save fee schedule
  const handleSaveFeeSchedule = async () => {
    if (!feeScheduleFormData.scheduleName.trim()) {
      alert('Please enter a schedule name.')
      return
    }

    const result = await settingsAPI.createFeeSchedule(feeScheduleFormData);

    if (result.success) {
      // Add new fee schedule to the list
      setFeeSchedules(prev => [...prev, result.feeSchedule])
      
      // Reset form and close dialog
      setFeeScheduleFormData({
        scheduleName: '',
        procedureFees: procedures.map(p => ({
          code: p.code,
          name: p.description,
          originalFee: p.officeFee,
          scheduleFee: p.officeFee
        }))
      })
      setFeeScheduleDialog(false)
      alert('Fee schedule created successfully!')
    } else {
      alert('Failed to create fee schedule: ' + result.error)
    }
  }

  // Handle open edit fee schedule dialog
  const handleOpenEditFeeSchedule = (schedule) => {
    setEditingScheduleId(schedule.id)
    setFeeScheduleFormData({
      scheduleName: schedule.scheduleName,
      procedureFees: schedule.procedureFees.map(p => ({ ...p }))
    })
    setEditFeeScheduleDialog(true)
  }

  // Handle update fee schedule
  const handleUpdateFeeSchedule = async () => {
    if (!feeScheduleFormData.scheduleName.trim()) {
      alert('Please enter a schedule name.')
      return
    }

    const result = await settingsAPI.updateFeeSchedule(editingScheduleId, feeScheduleFormData);

    if (result.success) {
      // Update fee schedule in the list
      setFeeSchedules(prev => prev.map(fs => 
        fs.id === editingScheduleId ? { ...fs, ...feeScheduleFormData } : fs
      ))
      
      // Reset form and close dialog
      setFeeScheduleFormData({
        scheduleName: '',
        procedureFees: procedures.map(p => ({
          code: p.code,
          name: p.description,
          originalFee: p.officeFee,
          scheduleFee: p.officeFee
        }))
      })
      setEditingScheduleId(null)
      setEditFeeScheduleDialog(false)
      alert('Fee schedule updated successfully!')
    } else {
      alert('Failed to update fee schedule: ' + result.error)
    }
  }

  return (
    <div className="space-y-6 -mt-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-muted-foreground">Manage your clinic configuration and preferences</p>
      </div>

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
              <Dialog open={isUserDialogOpen} onOpenChange={setIsUserDialogOpen}>
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
                        <Label htmlFor="password">Password <span className="text-red-500">*</span></Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="Minimum 6 characters"
                          value={userFormData.password}
                          onChange={(e) => handleUserInputChange('password', e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="role">Role / Type <span className="text-red-500">*</span></Label>
                        <Select
                          value={userFormData.role}
                          onValueChange={(value) => handleUserInputChange('role', value)}
                        >
                          <SelectTrigger id="role">
                            <SelectValue placeholder="Select role" />
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
                    <Button variant="outline" onClick={() => setIsUserDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button 
                      className="bg-blue-500 hover:bg-blue-600"
                      onClick={handleSaveUser}
                      disabled={!isUserFormValid()}
                    >
                      Create Provider
                    </Button>
                  </div>
                  {!isUserFormValid() && (
                    <p className="text-xs text-muted-foreground text-center">
                      Please fill in all required fields (Name, Email, Password, Role)
                    </p>
                  )}
                </DialogContent>
              </Dialog>

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
                            <SelectValue placeholder="Select role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Doctor">Doctor</SelectItem>
                            <SelectItem value="Dentist">Dentist</SelectItem>
                            <SelectItem value="Nurse">Nurse</SelectItem>
                            <SelectItem value="Receptionist">Receptionist</SelectItem>
                            <SelectItem value="Administrator">Administrator</SelectItem>
                            <SelectItem value="Medical Assistant">Medical Assistant</SelectItem>
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
                        No providers found. Click "Add New Provider" to get started.
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

        {/* Procedure Codes Tab */}
        <TabsContent value="procedures">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Procedure Codes</CardTitle>
                <CardDescription>Manage standard procedure codes and base fees</CardDescription>
              </div>
              <div className="flex gap-2">
                <Button >Import PhilHealth</Button>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Office Fee</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingProcedures ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        Loading procedures...
                      </TableCell>
                    </TableRow>
                  ) : procedures.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        No procedures found. Click "Add Procedure" to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    procedures.map((procedure) => (
                      <TableRow key={procedure.id}>
                        <TableCell className="font-mono">{procedure.code}</TableCell>
                        <TableCell>{procedure.description}</TableCell>
                        <TableCell>
                          {editingProcedureId === procedure.id ? (
                            <Input
                              value={procedure.category}
                              onChange={(e) => handleProcedureFieldChange(procedure.id, 'category', e.target.value)}
                              className="h-8"
                            />
                          ) : (
                            procedure.category
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editingProcedureId === procedure.id ? (
                            <Input
                              type="number"
                              value={procedure.officeFee}
                              onChange={(e) => handleProcedureFieldChange(procedure.id, 'officeFee', e.target.value)}
                              className="h-8 text-right"
                              step="0.01"
                            />
                          ) : (
                            formatCurrency(procedure.officeFee)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {editingProcedureId === procedure.id ? (
                            <div className="flex gap-2 justify-end">
                              <Button variant="ghost" size="sm" onClick={() => handleSaveProcedure(procedure)}>
                                Save
                              </Button>
                              <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button variant="ghost" size="sm" onClick={() => handleEditProcedure(procedure.id)}>
                              Edit
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Fee Schedules</CardTitle>
                <CardDescription>Manage different fee structures for insurance plans</CardDescription>
              </div>
              <Button className="bg-blue-500" onClick={() => setFeeScheduleDialog(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add Fee Schedule
              </Button>
            </CardHeader>
            
            <Dialog open={feeScheduleDialog} onOpenChange={setFeeScheduleDialog}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Create Fee Schedule</DialogTitle>
                </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid gap-2">
                      <Label>Schedule Name <span className="text-red-500">*</span></Label>
                      <Input 
                        placeholder="e.g. Maxicare Standard" 
                        value={feeScheduleFormData.scheduleName}
                        onChange={(e) => handleFeeScheduleInputChange('scheduleName', e.target.value)}
                      />
                    </div>
                    <div className="border rounded-lg p-4 bg-slate-50">
                      <h4 className="font-medium mb-4">Procedure Fees</h4>
                      <div className="text-sm text-muted-foreground mb-3">
                        Original Fees are based on your office fee schedule. Edit the Fee Schedule column to set
                        insurance-specific rates.
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Code</TableHead>
                            <TableHead>Procedure Name</TableHead>
                            <TableHead className="text-right">Original Fee</TableHead>
                            <TableHead className="text-right">Fee Schedule</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {feeScheduleFormData.procedureFees.slice(0, 5).map((procedure) => (
                            <TableRow key={procedure.code}>
                              <TableCell className="font-mono">{procedure.code}</TableCell>
                              <TableCell>{procedure.name}</TableCell>
                              <TableCell className="text-right">{formatCurrency(procedure.originalFee)}</TableCell>
                              <TableCell className="text-right">
                                <Input 
                                  className="h-8 text-right" 
                                  value={procedure.scheduleFee}
                                  onChange={(e) => updateProcedureFee(procedure.code, e.target.value)}
                                  type="number"
                                  step="0.01"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                          {feeScheduleFormData.procedureFees.length > 5 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                                + {feeScheduleFormData.procedureFees.length - 5} more procedures
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={() => setFeeScheduleDialog(false)}>
                        Cancel
                      </Button>
                      <Button className="bg-blue-500" onClick={handleSaveFeeSchedule}>
                        Create Schedule
                      </Button>
                    </div>
                  </div>
              </DialogContent>
            </Dialog>

            {/* Edit Fee Schedule Dialog */}
            <Dialog open={editFeeScheduleDialog} onOpenChange={setEditFeeScheduleDialog}>
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Fee Schedule</DialogTitle>
                </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid gap-2">
                      <Label>Schedule Name <span className="text-red-500">*</span></Label>
                      <Input 
                        placeholder="e.g. Maxicare Standard" 
                        value={feeScheduleFormData.scheduleName}
                        onChange={(e) => handleFeeScheduleInputChange('scheduleName', e.target.value)}
                      />
                    </div>
                    <div className="border rounded-lg p-4 bg-slate-50">
                      <h4 className="font-medium mb-4">Procedure Fees</h4>
                      <div className="text-sm text-muted-foreground mb-3">
                        Original Fees are based on your office fee schedule. Edit the Fee Schedule column to set
                        insurance-specific rates.
                      </div>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Code</TableHead>
                            <TableHead>Procedure Name</TableHead>
                            <TableHead className="text-right">Original Fee</TableHead>
                            <TableHead className="text-right">Fee Schedule</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {feeScheduleFormData.procedureFees.map((procedure) => (
                            <TableRow key={procedure.code}>
                              <TableCell className="font-mono">{procedure.code}</TableCell>
                              <TableCell>{procedure.name}</TableCell>
                              <TableCell className="text-right">{formatCurrency(procedure.originalFee)}</TableCell>
                              <TableCell className="text-right">
                                <Input 
                                  className="h-8 text-right" 
                                  value={procedure.scheduleFee}
                                  onChange={(e) => updateProcedureFee(procedure.code, e.target.value)}
                                  type="number"
                                  step="0.01"
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" onClick={() => setEditFeeScheduleDialog(false)}>
                        Cancel
                      </Button>
                      <Button className="bg-blue-500" onClick={handleUpdateFeeSchedule}>
                        Update Schedule
                      </Button>
                    </div>
                  </div>
              </DialogContent>
            </Dialog>
            
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Schedule Name</TableHead>
                    <TableHead>Associated Plans</TableHead>
                    <TableHead>Total Procedures</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingFeeSchedules ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Loading fee schedules...
                      </TableCell>
                    </TableRow>
                  ) : feeSchedules.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No fee schedules found. Click "Add Fee Schedule" to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    feeSchedules.map((schedule) => (
                      <TableRow key={schedule.id}>
                        <TableCell className="font-medium">{schedule.scheduleName}</TableCell>
                        <TableCell>{schedule.associatedPlans || 'N/A'}</TableCell>
                        <TableCell>{schedule.procedureFees?.length || 0} procedures</TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleOpenEditFeeSchedule(schedule)}>
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
      </Tabs>
    </div>
  )
}
