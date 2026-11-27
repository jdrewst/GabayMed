import { useEffect, useRef, useState } from "react"
import { ArrowLeft, Building2, MessageSquare, Search, Send } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useBranch } from "@/lib/branch-context"
import { Header } from "@/components/header"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { getMessageBranchKey, messagesAPI } from "../../services/messages"

export function Messages() {
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [conversations, setConversations] = useState([])
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const messagesEndRef = useRef(null)

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Fetch conversations on mount
  useEffect(() => {
    const fetchConversations = async () => {
      setLoading(true)
      const data = await messagesAPI.getConversations()
      setConversations(data)
      
      // Check URL parameters
      const urlParams = new URLSearchParams(window.location.search)
      const patientId = urlParams.get("patient")
      
      if (patientId) {
        setActiveConversationId(patientId)
      } else if (data.length > 0 && !activeConversationId) {
        setActiveConversationId(data[0].id)
      }
      setLoading(false)
    }
    fetchConversations()
    
    // Poll for new conversations every 5s so incoming mobile messages appear quickly
    const interval = setInterval(fetchConversations, 5000)
    return () => clearInterval(interval)
  }, [])

  // Fetch messages when active conversation changes + poll every 4s for live mobile messages
  useEffect(() => {
    if (!activeConversationId) return

    const fetchMessages = async (markRead = false) => {
      const data = await messagesAPI.getMessages(activeConversationId)
      setMessages(data)
      if (markRead) {
        await messagesAPI.markAsRead(activeConversationId)
        setConversations(prev => prev.map(c => 
          String(c.id) === String(activeConversationId) ? { ...c, unread: false } : c
        ))
      }
    }
    fetchMessages(true)

    const msgInterval = setInterval(() => fetchMessages(false), 4000)
    return () => clearInterval(msgInterval)
  }, [activeConversationId])

  const filteredConversations = conversations.filter((conv) =>
    conv.patientName.toLowerCase().includes(searchQuery.toLowerCase()),
  )
}

function Chat({ conversation, branchKey, onBack, onSent }) {
  const otherBranchKey = conversation.branchKey
  const name = conversation.name || conversation.patientName
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [historyError, setHistoryError] = useState(false)
  const [draft, setDraft] = useState("")
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState(false)
  const endRef = useRef(null)
  const pendingSend = useRef(null)
  const sendInProgress = useRef(false)
  const activeConversation = conversations.find(
    (c) =>
      String(c.id) === String(activeConversationId) ||
      (Array.isArray(c.patientIds) && c.patientIds.some(pid => String(pid) === String(activeConversationId)))
  )

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const history = otherBranchKey
          ? await messagesAPI.getBranchMessages(branchKey, otherBranchKey)
          : await messagesAPI.getMessages(conversation.id, branchKey)
        if (!active) return
        setMessages(previous => {
          const ids = new Set(history.map(message => message.id))
          return [...history, ...previous.filter(message => !ids.has(message.id))]
        })
        setHistoryError(false)
        if (otherBranchKey) {
          const unread = history.filter(message => message.senderBranch === otherBranchKey && !message.isRead)
          await messagesAPI.markBranchAsRead(branchKey, otherBranchKey, unread.map(message => message.id))
        } else if (history.some(message => message.sender === "patient" && !message.isRead)) {
          await messagesAPI.markAsRead(conversation.id, branchKey)
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
  }, [conversation.id, branchKey, otherBranchKey])

  const lastMessageId = messages.at(-1)?.id
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" })
  }, [lastMessageId])

  async function send(event) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || loading || sendInProgress.current) return
    sendInProgress.current = true
    setSending(true)
    setSendError(false)
    try {
      if (pendingSend.current?.text !== text) {
        const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16))
        bytes[6] = (bytes[6] & 15) | 64
        bytes[8] = (bytes[8] & 63) | 128
        const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("")
        const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
        pendingSend.current = { text, id }
      }
      const { id } = pendingSend.current
      const result = otherBranchKey
        ? await messagesAPI.sendBranchMessage(branchKey, otherBranchKey, text, id)
        : await messagesAPI.sendMessage(conversation.id, branchKey, text, id)
      setMessages(previous => previous.some(message => message.id === result.message.id) ? previous : [...previous, result.message])
      pendingSend.current = null
      setDraft("")
      if (!otherBranchKey) onSent(conversation.id, text)
    } catch {
      setSendError(true)
    } finally {
      sendInProgress.current = false
      setSending(false)
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 sm:px-6">
        <Button type="button" variant="ghost" size="icon" className="md:hidden" aria-label="Back to conversations" onClick={onBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <ConversationAvatar conversation={conversation} />
        <div className="min-w-0">
          <h2 className="truncate font-semibold text-slate-900">{name}</h2>
          <p className="text-xs text-slate-500">{otherBranchKey ? "Branch" : "Patient"}</p>
        </div>
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4 sm:p-6">
        {loading && <p className="text-center text-sm text-slate-500">Loading messages…</p>}
        {historyError && <p role="alert" className="text-center text-sm text-red-700">Messaging is currently unavailable.</p>}
        {!loading && !historyError && messages.length === 0 && (
          <div className="mx-auto mt-10 grid max-w-sm justify-items-center gap-2 text-center">
            <div className="rounded-full bg-sky-100 p-3 text-sky-700"><MessageSquare className="size-6" /></div>
            <h3 className="font-semibold text-slate-900">Start a conversation</h3>
            <p className="text-sm text-slate-600">Send the first message to {name} using the field below.</p>
          </div>
        )}
        {messages.map(message => {
          const outgoing = otherBranchKey ? message.senderBranch === branchKey : message.sender === "staff"
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
        {sendError && <p role="alert" className="mb-2 text-sm text-red-700">Could not confirm delivery. Check your connection and try again.</p>}
        <div className="flex gap-2">
          <Input aria-label="Message" placeholder="Type a message…" value={draft} onChange={event => setDraft(event.target.value)} maxLength={4000} disabled={loading || sending} />
          <Button type="submit" aria-label="Send message" size="icon" className="shrink-0 bg-sky-700 hover:bg-sky-800" disabled={loading || sending || !draft.trim()}>
            <Send className="size-4" />
          </Button>
        </div>
      </form>
    </>
  )
}

export function Messages() {
  const { branches, selectedBranch, selectedBranchId, loading } = useBranch()
  const branchKey = selectedBranchId === "all" ? "main" : getMessageBranchKey(selectedBranch)
  const contacts = new Map([["main", "Main"]])
  for (const branch of branches) {
    const key = getMessageBranchKey(branch)
    if (key && branch.is_active !== false) contacts.set(key, branch.name)
  }
  contacts.delete(branchKey)

  return (
    <div className="min-h-screen bg-slate-50">
      <Header />
      {branchKey && !loading
        ? <BranchMessages key={branchKey} branchKey={branchKey} branchName={selectedBranch?.name || "Main"} contacts={contacts} />
        : <p className="p-6 text-sm text-slate-600">{loading ? "Loading branches…" : "Select a branch to open messages."}</p>}
    </div>
  )
}

function BranchMessages({ branchKey, branchName, contacts }) {
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
        const data = await messagesAPI.getConversations(branchKey)
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
  }, [branchKey])

  const branchContacts = Array.from(contacts, ([key, name]) => ({ id: `branch:${key}`, branchKey: key, name }))
  const selected = branchContacts.find(contact => contact.id === activeId)
    || conversations.find(conversation => String(conversation.id) === String(activeId))
  const searchTerms = search.toLowerCase().trim().split(/\s+/).filter(Boolean)
  const visible = conversations.filter(conversation =>
    searchTerms.every(term => conversation.patientName.toLowerCase().includes(term))
  )
  const newPatients = visible.filter(conversation => !conversation.rawTimestamp)
  const existingChats = visible.filter(conversation => conversation.rawTimestamp)

  function openChat(id) {
    setActiveId(id)
    setShowChat(true)
  }

  function updatePreview(id, text) {
    const rawTimestamp = new Date().toISOString()
    setConversations(previous => {
      const item = previous.find(conversation => conversation.id === id)
      return item ? [{ ...item, lastMessage: text, timestamp: "Just now", rawTimestamp }, ...previous.filter(conversation => conversation.id !== id)] : previous
    })
  }

  return (
      <main className="container mx-auto flex h-[calc(100dvh-9rem)] min-h-[24rem] gap-4 px-6 pb-4">
        <aside aria-label="Hospital conversations" className={`${showChat && selected ? "hidden md:flex" : "flex"} w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white md:w-96 md:shrink-0`}>
          <div className="flex items-center justify-between gap-3 px-4 pt-4">
            <h1 className="shrink-0 text-xl font-semibold text-slate-900">Messages</h1>
            <p className="min-w-0 truncate text-right text-sm text-slate-600" title={branchName}>{branchName}</p>
          </div>
          <Tabs defaultValue="patients" className="flex min-h-0 flex-1 flex-col">
            <TabsList aria-label="Conversation type" className="mx-4 mt-3 grid shrink-0 grid-cols-2">
              <TabsTrigger value="patients">Patients</TabsTrigger>
              <TabsTrigger value="branches">Other branches</TabsTrigger>
            </TabsList>
            <TabsContent value="patients" className="mt-0 min-h-0 flex-1 flex-col data-[state=active]:flex">
              <div className="border-b border-slate-200 p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 size-4 text-slate-500" />
                  <Input type="search" aria-label="Search patients at your hospital" placeholder="Search hospital patients" className="pl-9" value={search} onChange={event => setSearch(event.target.value)} />
                </div>
                {newPatients.length > 0 && (
                  <div role="group" aria-label="Start a conversation" className="mt-3 flex gap-2 overflow-x-auto p-1 pb-2">
                    {newPatients.map(patient => (
                      <button
                        key={patient.id}
                        type="button"
                        title={patient.patientName}
                        aria-label={`Start a conversation with ${patient.patientName}`}
                        aria-pressed={selected?.id === patient.id}
                        onClick={() => openChat(patient.id)}
                        className="flex w-20 shrink-0 flex-col items-center gap-1 rounded-lg p-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 aria-pressed:bg-sky-50"
                      >
                        <ConversationAvatar conversation={patient} />
                        <span className="w-full truncate text-center text-xs font-medium text-slate-700">{patient.patientName}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto p-3">
                {visible.length === 0 && <p className="p-3 text-sm text-slate-500">{loading ? "Loading patients…" : loadError ? "Unable to load patients. Please try again shortly." : search.trim() ? "No matching patients." : "No patients found for this clinic."}</p>}
                {visible.length > 0 && existingChats.length === 0 && <p className="p-3 text-sm text-slate-500">{searchTerms.length ? "No matching conversations." : "No conversations in this branch yet."}</p>}
                {existingChats.map(conversation => {
                  const isSelected = selected?.id === conversation.id
                  return (
                    <button
                      type="button"
                      key={conversation.id}
                      aria-pressed={isSelected}
                      onClick={() => openChat(conversation.id)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left ${isSelected ? "border-sky-300 bg-sky-50" : "border-slate-200 hover:bg-slate-50"}`}
                    >
                      <ConversationAvatar conversation={conversation} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{conversation.patientName}</span>
                          {conversation.timestamp && <span className="shrink-0 text-right text-xs text-slate-500">{conversation.timestamp}</span>}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{conversation.lastMessage}</span>
                          {conversation.unread && !isSelected && <span aria-label="Unread messages" className="size-2 shrink-0 rounded-full bg-sky-600" />}
                        </span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </TabsContent>
            <TabsContent value="branches" className="mt-0 min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
              {branchContacts.length === 0 && <p className="p-3 text-sm text-slate-500">No other branches available.</p>}
              {branchContacts.map(contact => (
                <button
                  key={contact.id}
                  type="button"
                  aria-pressed={selected?.id === contact.id}
                  onClick={() => openChat(contact.id)}
                  className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-slate-50 aria-pressed:border-sky-300 aria-pressed:bg-sky-50"
                >
                  <ConversationAvatar conversation={contact} />
                  <span className="truncate text-sm font-semibold text-slate-900">{contact.name}</span>
                </button>
              ))}
            </TabsContent>
          </Tabs>
        </aside>
        <section aria-label="Chat" className={`${showChat && selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white`}>
          {selected ? (
            <Chat key={selected.id} branchKey={branchKey} conversation={selected} onBack={() => setShowChat(false)} onSent={updatePreview} />
          ) : (
            <div className="m-auto grid justify-items-center gap-3 p-4 text-center text-sm text-slate-600">
              <MessageSquare className="size-7 text-sky-700" />
              Select a patient or branch to open the chat.
            </div>
          )}
        </section>
      </main>
  )
}
