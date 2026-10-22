import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { CalendarView } from "@/components/calendar-view"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { GabayAPI } from "../../services/gabayApi"
import { POSTGabayAPI } from "../../services/postGabayApi"

export function AddPatientDialog({ open, onOpenChange }) {
  const [dob, setDob] = useState()
  const [plans, setPlans] = useState([]) // Changed from carriers to plans
  const [loading, setLoading] = useState(false)
  
  // Form State
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [gender, setGender] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [address, setAddress] = useState("")
  const [insuranceId, setInsuranceId] = useState("")

  // Load Plans on Mount
  useEffect(() => {
    const loadPlans = async () => {
      // Fetch Plans instead of Carriers
      const data = await GabayAPI.getInsurancePlans();
      setPlans(data);
    };
    if (open) loadPlans();
  }, [open]);

  const handleSave = async () => {
    if (!firstName || !lastName || !dob || !gender || !phone) {
      alert("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    const patientData = {
      full_name: `${firstName} ${lastName}`.trim(),
      phone_number: phone,
      address: address,
      email: email,
      date_of_birth: format(dob, "yyyy-MM-dd"),
      gender: gender,
      insurance_id: insuranceId || null // Optional
    };

    const result = await POSTGabayAPI.createPatient(patientData);

    setLoading(false);
    if (result.success) {
      alert("Patient added successfully!");
      onOpenChange(false);
      // Reset Form
      setFirstName(""); setLastName(""); setDob(null); setGender("");
      setPhone(""); setEmail(""); setAddress(""); setInsuranceId("");
      // Ideally, trigger a refresh of the patient list here
      window.location.reload(); // Simple reload to show new data
    } else {
      alert("Error adding patient: " + result.error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Patient</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name <span className="text-red-500">*</span></Label>
              <Input 
                id="firstName" 
                placeholder="Enter first name" 
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name <span className="text-red-500">*</span></Label>
              <Input 
                id="lastName" 
                placeholder="Enter last name" 
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required 
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dob">Date of Birth <span className="text-red-500">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal bg-transparent">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dob ? format(dob, "MM/dd/yyyy") : <span>Pick a date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarView value={dob} onChange={setDob} highlightToday={false} />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sex">Sex <span className="text-red-500">*</span></Label>
              <Select value={gender} onValueChange={setGender} required>
                <SelectTrigger id="sex">
                  <SelectValue placeholder="Select sex" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Male">Male</SelectItem>
                  <SelectItem value="Female">Female</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Contact Number <span className="text-red-500">*</span></Label>
              <Input 
                id="phone" 
                placeholder="+63" 
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="patient@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Textarea 
              id="address" 
              placeholder="Enter full address" 
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="insurance">Insurance Information</Label>
            <Select value={insuranceId} onValueChange={setInsuranceId}>
              <SelectTrigger id="insurance">
                <SelectValue placeholder="Select insurance plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={plan.id}>
                    {plan.name} <span className="text-muted-foreground text-xs ml-2">({plan.carrier})</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Patient"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
