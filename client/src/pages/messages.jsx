import { useEffect, useRef, useState } from "react"
import { ArrowLeft, MessageSquare, Search, Send } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Header } from "@/components/header"
import { Input } from "@/components/ui/input"
import { messagesAPI } from "../../services/messages"

function PatientAvatar({ conversation }) {
  return (
    <Avatar className="h-11 w-11 shrink-0">
      {conversation.avatar && <AvatarImage src={conversation.avatar} />}
      <AvatarFallback className="bg-sky-100 font-semibold text-sky-800">{conversation.initials}</AvatarFallback>
    </Avatar>
  )
}

function PatientChat({ conversation, onBack, onSent }) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [historyError, setHistoryError] = useState(false)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const history = await messagesAPI.getMessages(conversation.id)
        if (!active) return
        setMessages(previous => {
          const ids = new Set(history.map(message => message.id))
          return [...history, ...previous.filter(message => !ids.has(message.id))]
        })
        setHistoryError(false)
        if (history.some(message => message.sender === "patient" && !message.isRead)) {
          await messagesAPI.markAsRead(conversation.id)
        }
      } catch {
        if (active) setHistoryError(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 10000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [conversation.id])

  const lastMessageId = messages.at(-1)?.id
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" })
  }, [lastMessageId])

  async function send(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || loading || historyError || sending) return
    setSending(true)
    setSendError(false)
    try {
      const result = await messagesAPI.sendMessage(conversation.id, text)
      if (!result.success) throw new Error("Message could not be sent")
      setMessages(previous => previous.some(message => message.id === result.message.id) ? previous : [...previous, result.message])
      setDraft("")
      onSent(conversation.id, text)
    } catch {
      setSendError(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
        <Button type="button" variant="ghost" size="icon" className="md:hidden" aria-label="Back to conversations" onClick={onBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <PatientAvatar conversation={conversation} />
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-slate-900">{conversation.patientName}</h2>
          <p className="text-xs text-slate-500">Patient</p>
        </div>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 sm:p-6">
        {loading && <p className="text-center text-sm text-slate-500">Loading messages…</p>}
        {historyError && <p role="alert" className="text-center text-sm text-red-700">Messaging is currently unavailable.</p>}
        {!loading && !historyError && messages.length === 0 && <p className="text-center text-sm text-slate-500">No messages yet. Send a message to start the conversation.</p>}
        {messages.map(message => {
          const outgoing = message.sender === "staff"
          return (
            <div key={message.id} className={outgoing ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 sm:max-w-[70%] ${outgoing ? "rounded-br-sm bg-sky-700 text-white" : "rounded-bl-sm border border-slate-200 bg-white text-slate-900"}`}>
                <p className="whitespace-pre-wrap break-words text-sm">{message.text}</p>
                <p className={`mt-1 text-xs ${outgoing ? "text-sky-100" : "text-slate-500"}`}>{message.timestamp}</p>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      <form onSubmit={send} className="border-t border-slate-200 p-4 sm:px-6">
        {sendError && <p role="alert" className="mb-2 text-sm text-red-700">Message could not be sent. Try again.</p>}
        <div className="flex gap-2">
          <Input aria-label="Message" placeholder="Type a message…" value={draft} onChange={event => setDraft(event.target.value)} disabled={loading || historyError || sending} />
          <Button type="submit" aria-label="Send message" size="icon" className="shrink-0 bg-sky-700 hover:bg-sky-800" disabled={loading || historyError || sending || !draft.trim()}>
            <Send className="size-4" />
          </Button>
        </div>
      </form>
    </>
  )
}

export function Messages() {
  const [activeId, setActiveId] = useState(() => new URLSearchParams(window.location.search).get("patient"))
  const [showChat, setShowChat] = useState(() => Boolean(activeId))
  const [conversations, setConversations] = useState([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await messagesAPI.getConversations()
        if (!active) return
        setConversations(data)
        setLoadError(false)
      } catch {
        if (active) setLoadError(true)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    const interval = setInterval(load, 15000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  const selected = conversations.find(conversation => String(conversation.id) === String(activeId))
  const searchTerms = search.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const visible = conversations.filter(conversation =>
    searchTerms.every(term => conversation.patientName.toLowerCase().includes(term))
  )

  function updatePreview(id, text) {
    setConversations(previous => {
      const item = previous.find(conversation => conversation.id === id)
      return item ? [{ ...item, lastMessage: text, timestamp: "Just now" }, ...previous.filter(conversation => conversation.id !== id)] : previous
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      <main className="mx-auto flex h-[calc(100dvh-9rem)] min-h-[24rem] max-w-7xl gap-4 px-4 pb-4 sm:px-6">
        <aside aria-label="Patient conversations" className={`${showChat && selected ? "hidden md:flex" : "flex"} w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white md:w-80 md:shrink-0`}>
          <div className="border-b border-slate-200 p-4">
            <h1 className="mb-3 text-xl font-semibold text-slate-900">Messages</h1>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-4 text-slate-500" />
              <Input type="search" aria-label="Search patients" placeholder="Search patients" className="pl-9" value={search} onChange={event => setSearch(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2 overflow-y-auto p-3">
            {visible.length === 0 && <p className="p-3 text-sm text-slate-500">{loading ? "Loading patients…" : loadError ? "Unable to load patients. Please try again shortly." : search.trim() ? "No matching patients." : "No patients found for this clinic."}</p>}
            {visible.map(conversation => {
              const isSelected = selected?.id === conversation.id
              return (
                <button
                  type="button"
                  key={conversation.id}
                  aria-pressed={isSelected}
                  onClick={() => { setActiveId(conversation.id); setShowChat(true) }}
                  className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${isSelected ? "border-sky-300 bg-sky-50" : "border-slate-200 hover:bg-slate-50"}`}
                >
                  <PatientAvatar conversation={conversation} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-900">{conversation.patientName}</span>
                    <span className="block truncate text-xs text-slate-600">{conversation.lastMessage || "Start a conversation"}</span>
                    {conversation.timestamp && <span className="mt-1 block text-xs text-slate-500">{conversation.timestamp}</span>}
                  </span>
                  {conversation.unread && !isSelected && <span aria-label="Unread messages" className="size-2 shrink-0 rounded-full bg-sky-600" />}
                </button>
              )
            })}
          </div>
        </aside>
        <section aria-label="Chat" className={`${showChat && selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white`}>
          {selected ? (
            <PatientChat key={selected.id} conversation={selected} onBack={() => setShowChat(false)} onSent={updatePreview} />
          ) : (
            <div className="m-auto grid justify-items-center gap-3 p-4 text-center text-sm text-slate-600">
              <MessageSquare className="size-7 text-sky-700" />
              Select a patient conversation to open the chat.
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
