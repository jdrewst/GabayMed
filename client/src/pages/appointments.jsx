import { Header } from "@/components/header"
import { AppointmentScheduler } from "@/components/appointment-scheduler"
import { BranchPortalBanner } from "@/components/branch-portal-banner"

export default function AppointmentsPage() {
  return (
    <div className="min-h-screen bg-[#f9f9f9]">
      <Header />
      <main className="container mx-auto px-6 py-6 -mt-8">
        <BranchPortalBanner className="mb-4" />
        <AppointmentScheduler />
      </main>
    </div>
  )
}
