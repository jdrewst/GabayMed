import { useEffect, useState } from "react"
import { format } from "date-fns"
import { Header } from "@/components/header"
import { DateDisplay } from "@/components/date-display"
import { StatsCards } from "@/components/stats-cards"
import { PeakHours } from "@/components/peak-hours"
import { AppointmentsList } from "@/components/appointments-list"
import { CalendarView } from "@/components/calendar-view"
import { RecentActivity } from "@/components/recent-activity"
import { UpcomingSection } from "@/components/upcoming-sections"
import { GabayAPI } from "../../services/gabayApi.js" 
import { appointmentAPI } from "../../services/appointment.js" // Added import


export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalPatients: 0,
    appointmentsToday: 0,
    staffPresent: 0,
    totalIncome: 0
  });
  const [appointments, setAppointments] = useState([]);
  const [upcoming, setUpcoming] = useState([]); // <--- Add State
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const today = format(new Date(), 'yyyy-MM-dd');

        // 1. Fetch Stats, Schedule, and Upcoming in parallel
        const [statsData, scheduleData, upcomingData] = await Promise.all([ 
          GabayAPI.getDashboardStats(),
          GabayAPI.getFacilitySchedule(today),
          GabayAPI.getUpcomingSchedule(today)
        ]);

        // 2. Enrich Upcoming Data with Peak Hours
        const enrichedUpcoming = await Promise.all(upcomingData.map(async (item) => {
          const peak = await appointmentAPI.getPeakHourForDate(item.date);
          return { ...item, peakHour: peak };
        }));

        setStats(statsData);
        setAppointments(scheduleData);
        setUpcoming(enrichedUpcoming); // Set enriched data
      } catch (error) {
        console.error("Failed to load dashboard:", error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  return (
    <div className="min-h-screen bg-[#f9f9f9]">
      <Header />
      <main className="container mx-auto px-6 py-6">
        <DateDisplay />
        
        {/* Pass stats data to the cards */}
        <StatsCards 
          totalPatients={stats.totalPatients}
          appointmentsToday={stats.appointmentsToday}
          staffPresent={stats.staffPresent}
          totalIncome={stats.totalIncome}
          loading={loading}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="space-y-6">
            <PeakHours />
            <RecentActivity />
          </div>
           <div className="space-y-6">
            <AppointmentsList 
              appointments={appointments} 
              loading={loading}
            />
           </div>
          <div className="space-y-6">
            <CalendarView mode="display" />
            <UpcomingSection 
              schedule={upcoming}
              loading={loading}
            />
          </div>
        </div>
      </main>
    </div>
  )
}
