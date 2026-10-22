import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Search, Plus, Calendar, Eye, ArrowLeft } from "lucide-react"
import { AddPatientDialog } from "@/components/add-patient-dialog"
import { PatientProfile } from "@/pages/patient-profile"

export function PatientsTable({ patients = [], loading = false }) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [selectedPatient, setSelectedPatient] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")

  // Filter patients based on search input
  const filteredPatients = patients.filter(patient => 
    patient.full_name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // If a patient is selected, show their profile
  if (selectedPatient) {
    return (
      <div>
        <Button 
          variant="ghost" 
          className="mb-4"
          onClick={() => setSelectedPatient(null)}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Patients
        </Button>
        <PatientProfile patient={selectedPatient} />
      </div>
    )
  }

  return (
    <div>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-sm font-semibold text-[#4B6368]">
            {loading ? "Loading..." : `${filteredPatients.length} Patients in Total`}
          </h2>

          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#4B6368]" />
              <Input 
                placeholder="Search for Patients..." 
                className="pl-9 w-[300px]" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add New Patient
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead>
              <tr className="border-b text-left">
                <th className="pb-3 pl-20 font-medium text-sm text-muted-foreground w-[28%]">Name</th>
                <th className="pb-3 pr-8 font-medium text-sm text-muted-foreground w-[8%]">Age</th>
                <th className="pb-3 font-medium text-sm text-muted-foreground w-[8%]">Gender</th>
                <th className="pb-3 pl-8 font-medium text-sm text-muted-foreground w-[14%]">ID</th>
                <th className="pb-3 -pl-8 font-medium text-sm text-muted-foreground w-[12%]">Last Visit</th>
                <th className="pb-3 pl-16 font-medium text-sm text-muted-foreground w-[30%]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-muted-foreground">
                    Loading patient records...
                  </td>
                </tr>
              ) : filteredPatients.length === 0 ? (
                <tr>
                  <td colSpan="6" className="py-8 text-center text-muted-foreground">
                    No patients found.
                  </td>
                </tr>
              ) : (
                filteredPatients.map((patient, index) => (
                  <tr key={patient.user_id || index} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarImage 
                            src={`https://api.dicebear.com/7.x/initials/svg?seed=${patient.full_name}`} 
                            alt={patient.full_name} 
                          />
                          <AvatarFallback>
                            {patient.full_name
                              ? patient.full_name.split(" ").map((n) => n[0]).join("").substring(0, 2)
                              : "P"}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium truncate">{patient.full_name}</span>
                      </div>
                    </td>
                    <td className="py-4 text-sm">
                      {patient.age}
                    </td>
                    <td className="py-4 text-sm capitalize">
                      {patient.gender}
                    </td>
                    <td className="py-4 text-sm text-muted-foreground font-mono text-xs">
                      {patient.user_id ? (String(patient.user_id).length > 8 ? `${String(patient.user_id).substring(0, 8)}...` : String(patient.user_id)) : 'N/A'}
                    </td>
                    <td className="py-4 text-sm">
                      {patient.visit_date && patient.visit_date !== 'N/A'
                        ? new Date(patient.visit_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) 
                        : <span className="text-muted-foreground italic">No visits</span>}
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" className="flex-1" asChild>
                          <a href={`/appointments?patientId=${patient.user_id}`}>
                            <Calendar className="w-3 h-3 mr-1" />
                            Schedule
                          </a>
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="flex-1"
                          onClick={() => setSelectedPatient(patient)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          View
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <AddPatientDialog 
        open={isAddDialogOpen} 
        onOpenChange={setIsAddDialogOpen} 
      />
    </div>
  )
}
