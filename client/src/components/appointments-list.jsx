import { Card } from "@/components/ui/card"
import { format, parseISO } from "date-fns"
import { Clock } from "lucide-react"

export function AppointmentsList({ appointments = [], loading = false }) {
  
  return (
    <Card className="flex max-h-[100dvh] flex-col p-6">
      <h3 id="home-appointments-heading" className="mb-4 shrink-0 text-2xl font-bold text-[#4B6368]">Appointments</h3>
      <div className="min-h-0 space-y-4 overflow-y-auto" role="region" aria-labelledby="home-appointments-heading" tabIndex={0}>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading appointments...</div>
        ) : appointments.length === 0 ? (
          <div className="text-sm text-muted-foreground">No confirmed appointments today</div>
        ) : (
          appointments.map((apt) => {
            const date = apt.appointment_date.slice(0, 10);
            const dateLabel = format(parseISO(date), 'MMM d, yyyy');
            const scheduledTime = apt.appointment_time
              ? parseISO(`${date}T${apt.appointment_time}`)
              : parseISO(apt.appointment_date);
            const timeLabel = (apt.appointment_time || apt.appointment_date.length > 10)
              && format(scheduledTime, 'h:mm a');
            const patientName = apt.patients?.full_name || "Unknown Patient";
            const doctorName = apt.providers?.name;

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
                    <span className="font-bold text-sm text-[#4B6368]">
                      {dateLabel}{timeLabel && ` · ${timeLabel}`}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-[#4B6368] mb-1">{patientName}</div>
                  {doctorName && (
                    <div className="text-xs text-[#4B6368]/70 mb-2">{doctorName}</div>
                  )}
                  {apt.procedure_id && (
                    <div className="text-xs text-[#4B6368]/60">Procedure #{apt.procedure_id}</div>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </Card>
  )
}
