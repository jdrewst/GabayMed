import { Card } from "@/components/ui/card"
import { Clock } from "lucide-react"

export function AppointmentsList({ appointments = [], loading = false }) {
  
  return (
    <Card className="p-6">
      <h3 className="text-2xl font-bold text-[#4B6368] mb-4">Appointments</h3>
      <div className="space-y-4">
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading appointments...</div>
        ) : appointments.length === 0 ? (
          <div className="text-sm text-muted-foreground">No appointments today</div>
        ) : (
          appointments.map((apt) => {
            // Format the data from Supabase to match UI needs
            const time = new Date(apt.appointment_date).toLocaleTimeString([], { 
              hour: '2-digit', 
              minute: '2-digit' 
            });
            const patientName = apt.patients?.full_name || "Unknown Patient";
            const procId = apt.procedure_id || apt.procedures?.procedure_id;
            const procedureName = procId ? `Procedure #${procId}` : "General Consultation";
            const doctorName = apt.providers?.name; // Using doctor name instead of Room

            return (
              <div key={apt.appointment_id} className="flex gap-3">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#66BAFF]" />
                  <div className="w-0.5 flex-1 bg-[#66BAFF]" />
                </div>
                <div 
                  className="flex-1 rounded-lg p-3"
                  style={{ 
                    background: 'linear-gradient(135deg, rgba(168, 213, 255, 0.15) 0%, rgba(122, 184, 232, 0.15) 100%)'
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Clock className="w-4 h-4 text-[#4B6368]" />
                    <span className="font-bold text-sm text-[#4B6368]">{time}</span>
                  </div>
                  <div className="text-sm font-semibold text-[#4B6368] mb-1">{patientName}</div>
                  {doctorName && (
                    <div className="text-xs text-[#4B6368]/70 mb-2">{doctorName}</div>
                  )}
                  <div className="text-xs text-[#4B6368]/60">
                    {procedureName}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
