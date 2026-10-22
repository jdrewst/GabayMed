import React, { useState, useEffect } from "react"
import { ChevronLeft, ChevronRight, CalendarIcon, Clock, Plus, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarView } from "@/components/calendar-view" 
import { format } from "date-fns"
import { appointmentAPI } from "../../services/appointment"

const hours = Array.from({ length: 10 }, (_, i) => i + 8) // 8 AM to 5 PM

export function AppointmentScheduler() {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [selectedSlot, setSelectedSlot] = useState(null)
  
  // State for API Data
  const [providers, setProviders] = useState([])
  const [bookedAppointments, setBookedAppointments] = useState([])
  const [procedures, setProcedures] = useState([])
  const [loading, setLoading] = useState(true)

  // Search State
  const [patientSearchResults, setPatientSearchResults] = useState([])

  const [formData, setFormData] = useState({
    patient: '',
    patientId: null,
    status: 'PENDING',
    procedure: '',
    operatory: 'Room 101',
    primaryProvider: '',
    additionalProvider: '',
    length: '30',
    notes: ''
  })

  // Fetch Data on Mount and Date Change
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const providersData = await appointmentAPI.getProviders();
        setProviders(providersData);

        const appointmentsData = await appointmentAPI.getAppointmentsByDate(selectedDate);
        setBookedAppointments(appointmentsData);

        const proceduresData = await appointmentAPI.getProcedures();
        setProcedures(proceduresData);

      } catch (error) {
        console.error("Failed to load scheduler data", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [selectedDate]);

  const getAppointmentForSlot = (providerId, time) => {
    return bookedAppointments.find((apt) => apt.providerId === providerId && apt.time === time)
  }

  // Handle slot clicks to initialize form data
  const handleSlotClick = (providerId, time, appointment) => {
    setSelectedSlot({ providerId, time, date: selectedDate, appointment })
    
    if (!appointment) {
      // Initialize form data so "Save" button works immediately
      setFormData({
        patient: '',
        patientId: null,
        status: 'PENDING', 
        procedure: '',
        operatory: 'Room 101',
        primaryProvider: providerId ? providerId.toString() : '', 
        additionalProvider: '',
        length: '30',
        notes: ''
      })
    } else {
      // POPULATE FORM FOR EDITING (with safe fallbacks to avoid crashes)
      setFormData({
        patient: appointment.patient || '',
        patientId: appointment.patientId || null,
        status: appointment.status || 'PENDING',
        procedure: appointment.procedureId ? appointment.procedureId.toString() : '',
        operatory: appointment.operatory || 'Room 101',
        primaryProvider: appointment.providerId ? appointment.providerId.toString() : (providerId ? providerId.toString() : ''),
        additionalProvider: '',
        length: appointment.length ? appointment.length.toString() : '30',
        notes: appointment.notes || ''
      })
    }
  }

  const handleNewAppointment = () => {
    const defaultProviderId = providers.length > 0 && providers[0].id ? providers[0].id.toString() : ''
    
    setSelectedSlot({ 
      providerId: defaultProviderId || (providers[0]?.id ?? 1), 
      time: 8, 
      date: selectedDate, 
      appointment: null 
    })
    setFormData({
      patient: '',
      patientId: null,
      status: 'PENDING',
      procedure: '',
      operatory: 'Room 101',
      primaryProvider: defaultProviderId,
      additionalProvider: '',
      length: '30',
      notes: ''
    })
  }

  // --- New Search Logic ---
  const handlePatientSearch = async (value) => {
    setFormData({ ...formData, patient: value, patientId: null }); // Reset ID on type
    if (value.length > 1) {
        const results = await appointmentAPI.searchPatients(value);
        setPatientSearchResults(results);
    } else {
        setPatientSearchResults([]);
    }
  }

  const selectPatient = (patient) => {
      setFormData({ ...formData, patient: patient.name, patientId: patient.id });
      setPatientSearchResults([]);
  }
  // ------------------------

  // --- Save Logic ---
  const handleSave = async () => {
    if (!formData.patientId) {
        alert("Please select a valid patient from the search results.");
        return;
    }

    // Construct Date Time
    const date = new Date(selectedSlot.date);
    date.setHours(selectedSlot.time, 0, 0, 0);
    // Adjust for timezone offset if necessary, or use local ISO
    // For simplicity, using ISO string (UTC)
    
    const newAppointment = {
        patientId: formData.patientId,
        providerId: formData.primaryProvider,
        procedureId: formData.procedure,
        date: date.toISOString(),
        duration: formData.length,
        status: formData.status,
        notes: formData.notes
    };

    const result = await appointmentAPI.createAppointment(newAppointment);
    
    if (result.success) {
        // Refresh Grid
        const appointmentsData = await appointmentAPI.getAppointmentsByDate(selectedDate);
        setBookedAppointments(appointmentsData);
        setSelectedSlot(null); // Close panel
    } else {
        alert("Failed to create appointment: " + result.error);
    }
  }
  // ------------------

  // --- Update Logic ---
  const handleUpdate = async () => {
    if (!selectedSlot?.appointment?.id) return;

    const updates = {
        providerId: formData.primaryProvider,
        procedureId: formData.procedure,
        duration: formData.length,
        status: formData.status,
        notes: formData.notes
    };

    const result = await appointmentAPI.updateAppointment(selectedSlot.appointment.id, updates);
    
    if (result.success) {
        // Refresh Grid
        const appointmentsData = await appointmentAPI.getAppointmentsByDate(selectedDate);
        setBookedAppointments(appointmentsData);
        setSelectedSlot(null); // Close panel
    } else {
        alert("Failed to update appointment: " + result.error);
    }
  }

  const handleCancelAppointment = async () => {
    if (!selectedSlot?.appointment?.id) return;
    if (!window.confirm("Are you sure you want to cancel this appointment?")) return;

    const result = await appointmentAPI.updateAppointment(selectedSlot.appointment.id, {
      status: 'CANCELLED'
    });

    if (result.success) {
      const appointmentsData = await appointmentAPI.getAppointmentsByDate(selectedDate);
      setBookedAppointments(appointmentsData);
      setSelectedSlot(null); // Close panel
    } else {
      alert("Failed to cancel appointment: " + result.error);
    }
  }
  // ------------------

  const isFormValid = () => {
    return formData.patient && formData.patientId && formData.status && formData.procedure && formData.operatory && formData.primaryProvider && formData.length
  }

  const goToPreviousDay = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() - 1)
    setSelectedDate(newDate)
  }

  const goToToday = () => {
    setSelectedDate(new Date())
  }

  const goToNextDay = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + 1)
    setSelectedDate(newDate)
  }

  if (loading && providers.length === 0) {
    return <div className="p-8 text-center text-muted-foreground">Loading scheduler...</div>
  }

  return (
    <div className="flex h-[calc(100vh-120px)] gap-6">
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold">
              {selectedDate.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </h2>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8 bg-transparent" onClick={goToPreviousDay}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="icon" className="h-8 w-8 bg-transparent">
                    <CalendarIcon className="w-4 h-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarView value={selectedDate} onChange={setSelectedDate} highlightToday={false} />
                </PopoverContent>
              </Popover>
              <Button variant="outline" size="icon" className="h-8 w-8 bg-transparent" onClick={goToNextDay}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <Button onClick={handleNewAppointment}>New Appointment</Button>
        </div>

        <div className="flex-1 border rounded-2xl overflow-auto bg-white shadow-sm">
          <div className="grid min-w-[800px]" style={{ gridTemplateColumns: `80px repeat(${providers.length}, 1fr)` }}>
            {/* Header */}
            <div className="sticky top-0 z-10 bg-white border-b p-4"></div>
            {providers.map((provider) => (
              <div
                key={provider.id}
                className="sticky top-0 z-10 bg-white border-b border-l p-4 flex items-center gap-3"
              >
                <Avatar className="h-10 w-10">
                  <AvatarImage src={provider.image || "/placeholder.svg"} />
                  <AvatarFallback>{provider.name[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium text-sm">{provider.name}</div>
                  <div className="text-xs text-muted-foreground">{provider.role}</div>
                </div>
              </div>
            ))}

            {/* Time Slots */}
            {hours.map((hour) => (
              <React.Fragment key={`hour-row-${hour}`}>
                <div
                  key={`time-${hour}`}
                  className="border-b p-4 text-sm text-muted-foreground text-right sticky left-0 bg-white"
                >
                  {hour > 12 ? `${hour - 12} PM` : hour === 12 ? "12 PM" : `${hour} AM`}
                </div>
                {providers.map((provider) => {
                  const appointment = getAppointmentForSlot(provider.id, hour)
                  return (
                    <div
                      key={`slot-${provider.id}-${hour}`}
                      className={`border-b border-l min-h-[100px] p-2 relative group cursor-pointer transition-colors ${
                        appointment ? "bg-blue-50 hover:bg-blue-100" : "hover:bg-slate-50"
                      }`}
                      // UPDATED: Use the new handler instead of inline function
                      onClick={() => handleSlotClick(provider.id, hour, appointment)}
                    >
                      {appointment ? (
                        <div className="space-y-1">
                          <div className="font-medium text-sm">{appointment.patient}</div>
                          <div className="text-xs text-muted-foreground">{appointment.procedure}</div>
                          <Badge variant="secondary" className="text-xs">
                            {appointment.status}
                          </Badge>
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="bg-blue-50 text-blue-600 hover:bg-blue-100 hover:text-blue-700"
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel - Appointment Details */}
      {selectedSlot && (
        <Card className="w-[400px] shrink-0 overflow-auto border shadow-md rounded-2xl bg-white">
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">
                {selectedSlot?.appointment ? "Appointment Details" : "New Appointment"}
              </h3>
              <Button variant="ghost" size="icon" onClick={() => setSelectedSlot(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {selectedSlot && (
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-muted-foreground text-xs uppercase tracking-wider">Date & Time</Label>
                <div className="flex items-center gap-2 font-medium">
                  <CalendarIcon className="w-4 h-4 text-blue-500" />
                  {selectedDate.toLocaleDateString()}
                </div>
                <div className="flex items-center gap-2 font-medium">
                  <Clock className="w-4 h-4 text-blue-500" />
                  {selectedSlot.time > 12
                    ? `${selectedSlot.time - 12}:00 PM`
                    : selectedSlot.time === 12
                      ? "12:00 PM"
                      : `${selectedSlot.time}:00 AM`}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Patient <span className="text-red-500">*</span></Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search patient..."
                    value={selectedSlot.appointment?.patient || formData.patient}
                    onChange={(e) => handlePatientSearch(e.target.value)}
                    disabled={!!selectedSlot.appointment} // Keep Patient locked for edits to avoid confusion
                  />
                  {/* Search Results Dropdown */}
                  {!selectedSlot.appointment && patientSearchResults.length > 0 && (
                      <div className="absolute z-50 w-full bg-white border rounded-md shadow-lg mt-1 max-h-40 overflow-auto">
                          {patientSearchResults.map(p => (
                              <div 
                                  key={p.id} 
                                  className="p-2 hover:bg-slate-100 cursor-pointer text-sm"
                                  onClick={() => selectPatient(p)}
                              >
                                  {p.name}
                              </div>
                          ))}
                      </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status <span className="text-red-500">*</span></Label>
                <Select 
                  value={formData.status} // Use formData directly
                  onValueChange={(value) => setFormData({ ...formData, status: value })}
                  // Removed disabled prop
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Pending</SelectItem>
                    <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                    <SelectItem value="ONGOING">On-going</SelectItem>
                    <SelectItem value="COMPLETED">Complete</SelectItem>
                    <SelectItem value="MISSED">Missed</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Procedures <span className="text-red-500">*</span></Label>
                <Select 
                  value={formData.procedure} // Use formData directly
                  onValueChange={(value) => setFormData({ ...formData, procedure: value })}
                  // Removed disabled prop
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select procedure" />
                  </SelectTrigger>
                  <SelectContent>
                    {procedures.length > 0 ? (
                      procedures.map((proc) => (
                        <SelectItem key={proc.id} value={proc.id.toString()}>{proc.name}</SelectItem>
                      ))
                    ) : (
                      <SelectItem value="0" disabled>No procedures found</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Operatory <span className="text-red-500">*</span></Label>
                <Select 
                  value={formData.operatory} // Use formData directly
                  onValueChange={(value) => setFormData({ ...formData, operatory: value })}
                  // Removed disabled prop
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select room" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Room 101">Room 101</SelectItem>
                    <SelectItem value="Room 102">Room 102</SelectItem>
                    <SelectItem value="Room 103">Room 103</SelectItem>
                    <SelectItem value="Room 104">Room 104</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Primary Provider <span className="text-red-500">*</span></Label>
                <Select 
                  value={formData.primaryProvider} // Use formData directly
                  onValueChange={(value) => setFormData({ ...formData, primaryProvider: value })}
                  // Removed disabled prop
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id.toString()}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Additional Provider (Optional)</Label>
                <Select 
                  value={formData.additionalProvider}
                  onValueChange={(value) => setFormData({ ...formData, additionalProvider: value })}
                  // Removed disabled prop
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select additional provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id.toString()}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Length (minutes) <span className="text-red-500">*</span></Label>
                <Select 
                  value={formData.length} // Use formData directly
                  onValueChange={(value) => setFormData({ ...formData, length: value })}
                  // Removed disabled prop
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="45">45 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                    <SelectItem value="90">90 minutes</SelectItem>
                    <SelectItem value="120">120 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea 
                  placeholder="Add appointment notes..." 
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  // Removed disabled prop
                />
              </div>

              <div className="pt-4 flex gap-2">
                {selectedSlot.appointment ? (
                  <>
                    <Button className="w-full bg-blue-500" onClick={handleUpdate}>Update</Button>
                    <Button variant="destructive" className="w-full" onClick={handleCancelAppointment}>
                      Cancel Appointment
                    </Button>
                  </>
                ) : (
                  <>
                    <Button className="w-full" disabled={!isFormValid()} onClick={handleSave}>Save</Button>
                    <Button variant="outline" className="w-full bg-transparent" onClick={() => setSelectedSlot(null)}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
