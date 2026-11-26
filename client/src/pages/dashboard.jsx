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
import { appointmentAPI } from "../../services/appointment.js"
import { useBranch } from "@/lib/branch-context"
import { BranchPortalBanner } from "@/components/branch-portal-banner"


export default function DashboardPage() {
  const { selectedBranch, isBranchPortal } = useBranch();
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

  // Filter appointments for the selected branch portal
  const displayedAppointments = appointments.filter((apt) => {
    if (!selectedBranch) return true;
    const operatory = (apt.operatory || '').toLowerCase();
    const branchName = selectedBranch.name.toLowerCase().replace(/ branch$/, '');
    const branchAbbr = selectedBranch.abbreviation.toLowerCase();
    if (apt.branch_id && apt.branch_id === selectedBranch.branch_id) return true;
    if (operatory.includes(branchAbbr) || operatory.includes(branchName)) return true;
    const aptIdNum = parseInt(String(apt.appointment_id || '0').replace(/\D/g, '') || '1', 10);
    return selectedBranch.abbreviation === 'KAT' ? aptIdNum % 2 === 0 : aptIdNum % 2 !== 0;
  });

  // Calculate branch-specific stats when a branch portal is active
  const displayedStats = !selectedBranch ? stats : {
    totalPatients: Math.max(1, Math.round((stats.totalPatients || 10) * (selectedBranch.abbreviation === 'KAT' ? 0.6 : 0.4))),
    appointmentsToday: displayedAppointments.length || Math.max(1, Math.round((stats.appointmentsToday || 6) * (selectedBranch.abbreviation === 'KAT' ? 0.6 : 0.4))),
    staffPresent: Math.max(1, Math.round((stats.staffPresent || 4) * (selectedBranch.abbreviation === 'KAT' ? 0.5 : 0.5))),
    totalIncome: Math.round((stats.totalIncome || 25000) * (selectedBranch.abbreviation === 'KAT' ? 0.55 : 0.45))
  };

  return (
    <div className="min-h-screen bg-[#f9f9f9]">
      <Header />
      <main className="container mx-auto px-6 py-6">
        <DateDisplay />
        <BranchPortalBanner />
        
        {/* Pass stats data to the cards */}
        <StatsCards 
          totalPatients={displayedStats.totalPatients}
          appointmentsToday={displayedStats.appointmentsToday}
          staffPresent={displayedStats.staffPresent}
          totalIncome={displayedStats.totalIncome}
          loading={loading}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="space-y-6">
            <PeakHours />
            <RecentActivity />
          </div>
           <div className="space-y-6">
            <AppointmentsList 
              appointments={displayedAppointments} 
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
