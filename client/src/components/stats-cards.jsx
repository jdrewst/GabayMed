import { Calendar, Users, Banknote, FileText, ArrowUpRight } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export function StatsCards({ 
  totalPatients = 0, 
  appointmentsToday = 0, 
  staffPresent = 0, 
  totalIncome = 0, 
  loading = false,
  links = {}
}) {

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  const statsData = [
    {
      id: "appointments",
      icon: Calendar,
      value: loading ? "..." : appointmentsToday.toString(),
      label: "Appointments",
      badge: "Today",
      badgeVariant: "default",
      href: links.appointments || "/appointments",
    },
    {
      id: "staff",
      icon: Users,
      value: loading ? "..." : staffPresent.toString(),
      label: "Staff Present",
      badge: null,
      href: links.staff || "/settings?tab=users",
    },
    {
      id: "income",
      icon: Banknote,
      value: loading ? "..." : formatCurrency(totalIncome),
      label: "Income",
      badge: "Today",
      badgeVariant: "default",
      href: links.income || "/settings?tab=fees",
    },
    {
      id: "patients",
      icon: FileText,
      value: loading ? "..." : totalPatients.toString(),
      label: "Total Patients",
      badge: "Active",
      badgeVariant: "secondary",
      href: links.patients || "/patients",
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
      {statsData.map((stat) => (
        <a
          key={stat.id}
          href={stat.href}
          className="group block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#66BAFF] focus-visible:ring-offset-2 transition-transform duration-200 hover:-translate-y-0.5"
          aria-label={`${stat.label}: ${stat.value}`}
        >
          <Card className="p-4 h-full cursor-pointer transition-all duration-200 border border-slate-200/80 bg-white hover:border-[#66BAFF] hover:shadow-md">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-[#f9f9f9] flex items-center justify-center transition-colors group-hover:bg-[#EBF5FF]">
                  <stat.icon className="w-6 h-6 text-[#66BAFF] transition-transform duration-200 group-hover:scale-110" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-semibold text-gray-900">{stat.value}</span>
                    {stat.badge && (
                      <Badge variant={stat.badgeVariant || "secondary"} className="text-xs text-black bg-[#66BAFF]">
                        {stat.badge}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground font-semibold group-hover:text-gray-900 transition-colors">
                    {stat.label}
                  </div>
                </div>
              </div>
              <div className="text-slate-300 group-hover:text-[#66BAFF] transition-colors p-1">
                <ArrowUpRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all duration-200 transform -translate-x-1 translate-y-1 group-hover:translate-x-0 group-hover:translate-y-0" />
              </div>
            </div>
          </Card>
        </a>
      ))}
    </div>
  )
}
