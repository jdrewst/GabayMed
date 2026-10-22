import { useState, useEffect } from "react"
import { Phone, Mail, MapPin, Edit2, Wallet, ArrowRightFromLine, FileText, CreditCard, Calendar } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { AddInsurancePlanDialog } from "@/components/add-insurance-plan-dialog"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { profileAPI } from "../../services/profile"
import { appointmentAPI } from "../../services/appointment"
import { PatientLedger } from "../components/patient-ledger" // 1. Import the component

export function PatientProfile({ patient }) {
  const [isAddPlanOpen, setIsAddPlanOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  
  // Data States
  const [insurancePlans, setInsurancePlans] = useState([])
  // const [ledgerData, setLedgerData] = useState([]) // 2. Remove old ledger state
  const [clinicalNotes, setClinicalNotes] = useState([])
  const [upcomingAppointments, setUpcomingAppointments] = useState([]) // New State
  
  // Loading States
  const [loadingPlans, setLoadingPlans] = useState(true)
  // const [loadingLedger, setLoadingLedger] = useState(true) // 3. Remove old loading state
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [loadingAppointments, setLoadingAppointments] = useState(true) // New State

  // Initialize state safely mapping from the Table's data structure
  const [patientData, setPatientData] = useState({
    id: patient?.user_id || patient?.id, 
    name: patient?.full_name || patient?.name || "Unknown Patient",
    age: patient?.age || "N/A",
    sex: patient?.gender || patient?.sex || "N/A",
    patientId: patient?.user_id || "N/A",
    phone: patient?.phone_number || "+63 912 345 6789",
    email: patient?.email || "no-email@example.com",
    address: patient?.address || "No address provided",
    birthDate: patient?.date_of_birth || "2000-01-01",
    emergencyContact: "",
    emergencyPhone: ""
  })
  
  const [editFormData, setEditFormData] = useState({ ...patientData })

  // 1. Load All Patient Data
  useEffect(() => {
    const loadData = async () => {
      if (!patientData.id) return;

      // A. Fetch Profile Details
      const profile = await profileAPI.getPatientDetails(patientData.id);
      if (profile) {
        setPatientData(prev => ({ ...prev, ...profile }));
        setEditFormData(prev => ({ ...prev, ...profile }));
      }

      // B. Fetch Insurance
      setLoadingPlans(true);
      const plans = await profileAPI.getInsurancePlans(patientData.id);
      setInsurancePlans(plans);
      setLoadingPlans(false);

      // C. Fetch Ledger - REMOVED (Now handled by PatientLedger component)

      // D. Fetch Notes
      setLoadingNotes(true);
      const notes = await profileAPI.getClinicalNotes(patientData.id);
      setClinicalNotes(notes);
      setLoadingNotes(false);

      // E. Fetch Upcoming Appointments
      setLoadingAppointments(true);
      const appointments = await appointmentAPI.getUpcomingAppointmentsByPatient(patientData.id);
      setUpcomingAppointments(appointments);
      setLoadingAppointments(false);
    };

    loadData();
  }, [patientData.id]);

  // Refresh helper for Insurance
  const refreshInsurance = async () => {
    setLoadingPlans(true);
    const plans = await profileAPI.getInsurancePlans(patientData.id);
    setInsurancePlans(plans);
    setLoadingPlans(false);
  }

  // 2. Handle Profile Update
  const handleEditSave = async () => {
    const result = await profileAPI.updatePatient(patientData.id, editFormData);
    
    if (result.success) {
      setPatientData({ ...editFormData });
      setIsEditDialogOpen(false);
    } else {
      alert('Failed to update patient profile: ' + result.error);
    }
  }
  
  const isEditFormValid = () => {
    return editFormData.name && 
           editFormData.name.trim().length >= 2 &&
           editFormData.birthDate &&
           editFormData.sex
  }

  const getInitials = (name) => {
    if (!name) return "P";
    return name
      .split(" ")
      .map(n => n[0])
      .join("")
      .substring(0, 2)
  }

  return (
    <div className="space-y-6">
      {/* Profile Header */}
      <Card className="bg-gradient-to-r from-blue-50 to-white border-blue-100">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <Avatar className="w-24 h-24 border-4 border-white shadow-lg">
              <AvatarImage src={`https://api.dicebear.com/7.x/initials/svg?seed=${patientData.name}`} />
              <AvatarFallback>{getInitials(patientData.name)}</AvatarFallback>
            </Avatar>

            <div className="flex-1 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{patientData.name}</h1>
                  <div className="flex items-center gap-2 text-muted-foreground mt-1">
                    <span>{patientData.age} Years Old</span>
                    <span>•</span>
                    <span>{patientData.sex === 'M' || patientData.sex === 'Male' ? 'Male' : 'Female'}</span>
                    <span>•</span>
                    <span className="font-mono text-xs">ID: {String(patientData.patientId).length > 8 ? `${String(patientData.patientId).substring(0,8)}...` : String(patientData.patientId)}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsEditDialogOpen(true)}>
                    <Edit2 className="w-4 h-4 mr-2" />
                    Edit Profile
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="w-4 h-4 text-blue-500" />
                  <span>{patientData.phone || 'No phone'}</span>
                  <Badge variant="secondary" className="text-xs">
                    Preferred
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="w-4 h-4 text-blue-500" />
                  <span>{patientData.email || 'No email'}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-blue-500" />
                  <span>{patientData.address || 'No address'}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Content Tabs */}
      <Tabs defaultValue="ledger" className="space-y-6">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent space-x-6">
          <TabsTrigger
            value="overview"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent px-4 py-3"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="ledger"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent px-4 py-3"
          >
            Ledger
          </TabsTrigger>
          <TabsTrigger
            value="insurance"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent px-4 py-3"
          >
            Insurance
          </TabsTrigger>
          <TabsTrigger
            value="notes"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:bg-transparent px-4 py-3"
          >
            Clinical Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-3 gap-6">
            <Card className="col-span-2">
              <CardHeader>
                <CardTitle>Upcoming Appointments</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingAppointments ? (
                  <div className="text-sm text-muted-foreground">Loading appointments...</div>
                ) : upcomingAppointments.length === 0 ? (
                  <div className="text-muted-foreground text-sm">No upcoming appointments scheduled.</div>
                ) : (
                  <div className="space-y-4">
                    {upcomingAppointments.map((apt) => (
                      <div key={apt.id} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                        <div className="flex items-center gap-4">
                          <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                            <Calendar className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{apt.procedure}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(apt.date).toLocaleDateString()} at {new Date(apt.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">{apt.provider}</p>
                          <Badge variant="outline" className="mt-1">{apt.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Button variant="outline" className="justify-start bg-transparent">
                  <Wallet className="w-4 h-4 mr-2" />
                  Walkout Statement
                </Button>
                <Button variant="outline" className="justify-start bg-transparent">
                  <ArrowRightFromLine className="w-4 h-4 mr-2" />
                  Send Claim
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 4. Replace the entire Ledger Tab content */}
        <TabsContent value="ledger">
          <PatientLedger patientId={patientData.id} />
        </TabsContent>

        {/* INSURANCE TAB */}
        <TabsContent value="insurance">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Insurance Plans</CardTitle>
              <Button size="sm" onClick={() => setIsAddPlanOpen(true)}>
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
                  {insurancePlans.map((plan) => (
                    <div key={plan.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-lg">{plan.carrier}</h3>
                          <p className="text-sm text-muted-foreground">{plan.coverageType}</p>
                        </div>
                        <Badge variant={plan.status === 'active' ? 'default' : 'secondary'}>
                          {plan.status || 'Active'}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground">Subscriber ID:</span>
                          <span className="ml-2 font-medium">{plan.subscriberId}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Coverage Start:</span>
                          <span className="ml-2">{plan.coverageStartDate ? new Date(plan.coverageStartDate).toLocaleDateString() : 'N/A'}</span>
                        </div>
                        {plan.coverageEndDate && (
                          <div>
                            <span className="text-muted-foreground">Coverage End:</span>
                            <span className="ml-2">{new Date(plan.coverageEndDate).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>
                      {plan.notes && (
                        <div className="mt-3 pt-3 border-t">
                          <p className="text-sm text-muted-foreground">{plan.notes}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CLINICAL NOTES TAB */}
        <TabsContent value="notes">
          <Card>
            <CardHeader>
              <CardTitle>Clinical Notes</CardTitle>
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
                              {new Date(note.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
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
      </Tabs>

      <AddInsurancePlanDialog 
        open={isAddPlanOpen} 
        onOpenChange={setIsAddPlanOpen}
        patientId={patientData.id}
        onPlanAdded={refreshInsurance}
      />

      {/* Edit Profile Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Patient Profile</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name <span className="text-red-500">*</span></Label>
                <Input
                  id="name"
                  value={editFormData.name || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patientId">Patient ID</Label>
                <Input
                  id="patientId"
                  value={editFormData.patientId || ''}
                  disabled
                  className="bg-gray-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="birthDate">Birth Date <span className="text-red-500">*</span></Label>
                <Input
                  id="birthDate"
                  type="date"
                  value={editFormData.birthDate || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, birthDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  value={editFormData.age || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, age: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sex">Sex <span className="text-red-500">*</span></Label>
                <Select
                  value={editFormData.sex || ''}
                  onValueChange={(value) => setEditFormData({ ...editFormData, sex: value })}
                >
                  <SelectTrigger id="sex">
                    <SelectValue placeholder="Select sex" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="M">Male</SelectItem>
                    <SelectItem value="F">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={editFormData.phone || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
                  placeholder="+63 XXX XXX XXXX"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={editFormData.email || ''}
                  onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={editFormData.address || ''}
                onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                placeholder="Full address"
              />
            </div>

            <div className="flex gap-2 justify-end mt-4">
              <Button variant="outline" onClick={() => {
                setIsEditDialogOpen(false)
                setEditFormData({ ...patientData }) // Reset form on cancel
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleEditSave}
                disabled={!isEditFormValid()}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
