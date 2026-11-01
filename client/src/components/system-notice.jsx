import { useRef } from 'react'
import { Info, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export function SystemNotice({ message, kind = 'info', onClose }) {
  const last = useRef({ message, kind })
  if (message) last.current = { message, kind }
  const displayed = last.current
  const isError = displayed.kind === 'error'
  const Icon = isError ? X : Info
  return <Dialog open={!!message} onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent aria-describedby={undefined} className="z-[80] w-[calc(100vw-3rem)] max-w-[340px] sm:max-w-[340px] rounded-lg sm:rounded-lg border-white/70 bg-white/95 px-8 pb-7 pt-16 shadow-[0_24px_80px_rgba(45,45,80,0.18)] [&>button]:hidden">
      <div className={`absolute -top-10 left-1/2 flex h-20 w-20 -translate-x-1/2 items-center justify-center rounded-full ${isError ? 'bg-red-100 text-red-500' : 'bg-blue-100 text-blue-600'}`}>
        <Icon className="h-9 w-9" strokeWidth={2.5} aria-hidden="true" />
      </div>
      <DialogHeader className="items-center text-center sm:text-center">
        <DialogTitle className="text-[22px] font-semibold leading-snug tracking-tight text-[#373252] break-words">{displayed.message}</DialogTitle>
      </DialogHeader>
      <div className="mt-3 flex justify-center">
        <Button onClick={onClose} className={`h-11 w-full max-w-[220px] rounded-full border-0 bg-gradient-to-b text-sm font-medium text-white ${isError ? 'from-red-300 to-red-500 hover:to-red-600' : 'from-sky-200 via-sky-300 to-blue-500 hover:to-blue-600'}`}>OK</Button>
      </div>
    </DialogContent>
  </Dialog>
}
