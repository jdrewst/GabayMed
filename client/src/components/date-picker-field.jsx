import { useState } from "react"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

/**
 * 1:1 Web port of Gabay 2.0 Mobile's DatePickerField:
 * Calendar popup with month navigation, clickable Month/Year header that switches
 * to a scrollable Year grid (1920–current year), and future-date blocking.
 */
export function DatePickerField({
  value,
  onChange,
  placeholder = "Select date of birth",
  className = "",
}) {
  const today = new Date()
  today.setHours(23, 59, 59, 999)
  const currentYear = today.getFullYear()

  const parseValue = (val) => {
    if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}/.test(val)) {
      const [y, m, d] = val.slice(0, 10).split("-").map(Number)
      if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d)) {
        return { year: y, month: m - 1, day: d }
      }
    }
    return null
  }

  const parsed = parseValue(value)
  const [open, setOpen] = useState(false)
  const [viewYear, setViewYear] = useState(parsed?.year ?? 2000)
  const [viewMonth, setViewMonth] = useState(parsed?.month ?? 0)
  const [pickingYear, setPickingYear] = useState(false)

  const openPicker = () => {
    const p = parseValue(value)
    setViewYear(p?.year ?? 2000)
    setViewMonth(p?.month ?? 0)
    setPickingYear(false)
    setOpen(true)
  }

  const formattedDisplay = parsed
    ? `${MONTHS[parsed.month]} ${parsed.day}, ${parsed.year}`
    : ""

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstWeekday; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const years = []
  for (let y = currentYear; y >= 1920; y--) years.push(y)

  const stepMonth = (delta) => {
    let nextMonth = viewMonth + delta
    let nextYear = viewYear
    if (nextMonth < 0) {
      nextMonth = 11
      nextYear -= 1
    } else if (nextMonth > 11) {
      nextMonth = 0
      nextYear += 1
    }
    if (nextYear >= 1920 && nextYear <= currentYear) {
      setViewMonth(nextMonth)
      setViewYear(nextYear)
    }
  }

  const selectDay = (day) => {
    const picked = new Date(viewYear, viewMonth, day)
    if (picked > today) return
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    onChange(iso)
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className={`flex h-8 w-full items-center justify-between rounded-md border border-input bg-white px-2.5 text-sm shadow-xs transition-colors hover:border-[#38BDF8] focus:outline-none focus:ring-2 focus:ring-[#38BDF8]/40 ${className}`}
      >
        <span className={formattedDisplay ? "text-slate-900 font-medium truncate" : "text-slate-400 truncate"}>
          {formattedDisplay || placeholder}
        </span>
        <Calendar className="w-4 h-4 shrink-0 text-[#0284C7] ml-1.5" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-[340px] p-5 rounded-2xl">
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setPickingYear((prev) => !prev)}
              className="rounded-lg px-3 py-1 text-sm font-bold text-slate-900 hover:bg-[#F0F9FF] hover:text-[#0284C7] transition-colors"
            >
              {MONTHS[viewMonth]} {viewYear} ▾
            </button>

            <button
              type="button"
              onClick={() => stepMonth(1)}
              className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 text-slate-700"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {pickingYear ? (
            <div className="grid grid-cols-4 gap-1.5 max-h-[240px] overflow-y-auto pr-1">
              {years.map((yr) => {
                const active = yr === viewYear
                return (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => {
                      setViewYear(yr)
                      setPickingYear(false)
                    }}
                    className={`rounded-lg py-1.5 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-[#0284C7] text-white"
                        : "bg-slate-50 text-slate-700 hover:bg-[#E0F2FE] hover:text-[#0284C7]"
                    }`}
                  >
                    {yr}
                  </button>
                )
              })}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-1.5">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="text-center text-[11px] font-semibold text-slate-400">
                    {w}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {cells.map((day, idx) => {
                  if (!day) return <div key={`empty-${idx}`} className="h-9" />
                  const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                  const selected = value?.slice(0, 10) === iso
                  const isFuture = new Date(viewYear, viewMonth, day) > today
                  return (
                    <button
                      key={iso}
                      type="button"
                      disabled={isFuture}
                      onClick={() => selectDay(day)}
                      className={`h-9 w-9 mx-auto flex items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                        selected
                          ? "bg-[#0284C7] text-white shadow-sm"
                          : isFuture
                            ? "text-slate-300 cursor-not-allowed"
                            : "text-slate-700 hover:bg-[#E0F2FE] hover:text-[#0284C7]"
                      }`}
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full mt-3 rounded-xl"
            onClick={() => setOpen(false)}
          >
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
