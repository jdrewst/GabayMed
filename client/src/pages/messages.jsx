import { useState, useEffect, useRef } from "react"
import { Send, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardHeader } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Header } from "@/components/header"
import { messagesAPI } from "../../services/messages"

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

  const activeConversation = conversations.find(
    (c) =>
      String(c.id) === String(activeConversationId) ||
      (Array.isArray(c.patientIds) && c.patientIds.some(pid => String(pid) === String(activeConversationId)))
  )

  const handleSendMessage = async () => {
    if (messageText.trim() && activeConversationId) {
      const text = messageText
      setMessageText("") // Clear input immediately
      
      // Optimistic update
      const tempId = Date.now()
      const tempMsg = {
        id: tempId,
        sender: "staff",
        text: text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isRead: false
      }
      setMessages(prev => [...prev, tempMsg])

      // Send to API
      const result = await messagesAPI.sendMessage(activeConversationId, text)
      
      if (result.success) {
        // Replace temp message with real one (optional, or just re-fetch)
        setMessages(prev => prev.map(m => m.id === tempId ? result.message : m))
        
        // Update conversation list last message
        setConversations(prev => prev.map(c => 
          c.id === activeConversationId ? { 
            ...c, 
            lastMessage: text, 
            timestamp: 'Just now' 
          } : c
        ))
      } else {
        // Handle error (remove temp message or show error)
        console.error("Failed to send message")
      }
    }
  }

  return (
    <>
    <div className="min-h-screen bg-[#f9f9f9]">
      <Header />
      <div className="flex h-[calc(100vh-140px)] gap-4 p-6 bg-slate-50 -mt-4">
        {/* Left Sidebar - Conversations List */}
        <div className="w-80 flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm">
        <CardHeader className="pb-4">
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-gray-900">Messages</h2>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search conversations..."
                className="pl-10 h-9"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>

        <div className="flex-1 overflow-y-auto">
          <div className="space-y-1 p-4">
            {loading && conversations.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">Loading...</p>
            ) : filteredConversations.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">No conversations found</p>
            ) : (
              filteredConversations.map((conversation) => (
                <button
                  key={conversation.id}
                  onClick={() => setActiveConversationId(conversation.id)}
                  className={`w-full p-3 rounded-lg transition-colors text-left ${
                    activeConversationId === conversation.id ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={conversation.avatar || "/placeholder-user.jpg"} />
                      <AvatarFallback>{conversation.initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-sm text-gray-900 truncate">{conversation.patientName}</p>
                        {conversation.unread && <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">{conversation.lastMessage}</p>
                      <p className="text-xs text-muted-foreground mt-1">{conversation.timestamp}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Right Pane - Chat Window */}
      {activeConversation ? (
        <div className="flex-1 flex flex-col bg-white rounded-lg border border-slate-200 shadow-sm">
          {/* Chat Header */}
          <div className="border-b p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar>
                <AvatarImage src={activeConversation.avatar || "/placeholder-user.jpg"} />
                <AvatarFallback>{activeConversation.initials}</AvatarFallback>
              </Avatar>
              <div>
                <h3 className="font-semibold text-gray-900">{activeConversation.patientName}</h3>
                <p className="text-xs text-muted-foreground">Patient</p>
              </div>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="space-y-4">
              {messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground mt-10">No messages yet. Start the conversation!</p>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.sender === "staff" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-xs px-4 py-2 rounded-lg ${
                        msg.sender === "staff"
                          ? "bg-[#66BAFF]  text-white rounded-br-none"
                          : "bg-slate-100 text-gray-900 rounded-bl-none"
                      }`}
                    >
                      <p className="text-sm">{msg.text}</p>
                      <p className={`text-xs mt-1 ${msg.sender === "staff" ? "text-blue-100" : "text-muted-foreground"}`}>
                        {msg.timestamp}
                      </p>
                    </div>
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Message Input */}
          <div className="border-t p-4">
            <div className="flex gap-2">
              <Input
                placeholder="Type a message..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
              />
              <Button size="icon" onClick={handleSendMessage} className="bg-blue-500 hover:bg-blue-600">
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-white rounded-lg border border-slate-200 shadow-sm text-muted-foreground">
          Select a conversation to start messaging
        </div>
      )}
      </div>
      </div>
    </>
  )
}
