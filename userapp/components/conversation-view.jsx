import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { ArrowLeft, Send, Hospital } from 'lucide-react-native';
import { GradientView } from './ui/gradient-button';
import MessagesAPI from '../services/messagesApi';
import { useTheme } from '../context/ThemeContext';

function createMessageId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function ConversationView({ patientId, branchKey, name, branchName, onBack, onSent, embedded }) {
  const { display, isDark } = useTheme();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const scrollViewRef = useRef();
  const latestRequest = useRef(0);
  const pendingSend = useRef(null);
  const sendInProgress = useRef(false);

  const loadMessages = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const data = await MessagesAPI.getMessages(patientId, branchKey);
      if (request !== latestRequest.current) return;
      setMessages(data);
      setLoadError(false);
      if (data.some(item => item.sender === 'staff' && !item.isRead)) {
        await MessagesAPI.markAsRead(patientId, branchKey);
      }
    } catch {
      if (request === latestRequest.current) setLoadError(true);
    } finally {
      if (request === latestRequest.current) setLoading(false);
    }
  }, [patientId, branchKey]);

  useEffect(() => MessagesAPI.subscribeToMessages(loadMessages, { patientId, branchKey }),
    [loadMessages, patientId, branchKey]);

  const handleSend = async () => {
    if (!message.trim() || loading || sendInProgress.current) return;

    const textToSend = message.trim();
    sendInProgress.current = true;
    setSending(true);
    setSendError(false);

    try {
      if (pendingSend.current?.text !== textToSend) pendingSend.current = { text: textToSend, id: createMessageId() };
      const result = await MessagesAPI.sendMessage(patientId, branchKey, textToSend, pendingSend.current.id);
      pendingSend.current = null;
      setMessage('');
      setMessages(previous => previous.some(item => item.id === result.message.id) ? previous : [...previous, result.message]);
      onSent(result.message);
      void loadMessages();
    } catch {
      setSendError(true);
    } finally {
      sendInProgress.current = false;
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={[styles.container, { backgroundColor: display.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <GradientView
        colors={['#66BAFF', '#83BFF0']}
        style={[styles.header, embedded && styles.embeddedHeader]}
      >
        {onBack && <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityLabel="Back to conversations" accessibilityRole="button">
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>}
        <View style={[styles.avatar, { backgroundColor: isDark ? '#1e3a8a' : '#e0f2fe' }]}>
          <Hospital size={22} color="#0369a1" />
        </View>
        <View style={styles.headerInfo}>
          <Text numberOfLines={1} style={styles.headerTitle}>{name}</Text>
          <Text numberOfLines={1} style={styles.headerStatus}>{branchName}</Text>
        </View>
      </GradientView>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0ea5e9" />
        </View>
      ) : (
        <ScrollView 
          ref={scrollViewRef}
          style={styles.messagesContainer}
          onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        >
          {loadError ? (
            <View style={styles.threadState}>
              <Text accessibilityRole="alert" style={[styles.emptyThread, { color: display.textSecondary }]}>Unable to load messages.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={loadMessages} style={styles.retryButton}>
                <Text style={styles.threadTitle}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : messages.length === 0 && (
            <View style={styles.threadState}>
              <Text style={styles.threadTitle}>Start a conversation</Text>
              <Text style={[styles.emptyThread, { color: display.textSecondary }]}>Send a message to {name} using the field below.</Text>
            </View>
          )}
          {messages.map((msg) => (
            <View
              key={msg.id}
              style={[
                styles.messageWrapper,
                msg.sender === 'patient' ? styles.sentWrapper : styles.receivedWrapper,
              ]}
            >
              {msg.sender === 'patient' ? (
                <GradientView
                  colors={['#66BAFF', '#83BFF0']}
                  style={[styles.messageBubble, styles.sentBubble]}
                >
                  <Text style={[styles.messageText, styles.sentText]}>
                    {msg.text}
                  </Text>
                  <Text style={[styles.messageTime, styles.sentTime]}>
                    {msg.timestamp}
                  </Text>
                </GradientView>
              ) : (
                <View style={[styles.messageBubble, styles.receivedBubble, { backgroundColor: display.cardBg, borderColor: display.border }]}>
                  <Text style={[styles.messageText, styles.receivedText, { color: display.textPrimary }]}>
                    {msg.text}
                  </Text>
                  <Text style={[styles.messageTime, styles.receivedTime, { color: display.textSecondary }]}>
                    {msg.timestamp}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {sendError && <Text accessibilityRole="alert" style={styles.sendError}>Could not confirm delivery. Check your connection and try again.</Text>}
      <View style={[styles.inputContainer, { backgroundColor: display.cardBg, borderTopColor: display.border }]}>
        <TextInput
          style={[styles.input, { backgroundColor: display.subCardBg, color: display.textPrimary }]}
          placeholder="Type a message..."
          placeholderTextColor={display.placeholder}
          value={message}
          onChangeText={setMessage}
          accessibilityLabel="Message"
          maxLength={4000}
          editable={!loading && !sending}
          multiline
        />
        <TouchableOpacity
          onPress={handleSend}
          style={[styles.sendButton, !message.trim() && !sending && styles.sendDisabled]}
          disabled={loading || sending || !message.trim()}
          accessibilityLabel="Send message"
          accessibilityRole="button"
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Send size={20} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  embeddedHeader: { paddingTop: 12 },
  threadState: { alignItems: 'center', margin: 24, gap: 8 },
  threadTitle: { color: '#0369a1', fontSize: 16, fontWeight: '600' },
  emptyThread: { textAlign: 'center', color: '#475569' },
  retryButton: { padding: 10 },
  sendError: { color: '#b91c1c', marginHorizontal: 16, marginTop: 8 },
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
    borderWidth: 2,
    borderColor: '#38bdf8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerInfo: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  headerStatus: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)',
  },
  messagesContainer: {
    flex: 1,
    padding: 16,
  },
  messageWrapper: {
    marginBottom: 16,
  },
  sentWrapper: {
    alignItems: 'flex-end',
  },
  receivedWrapper: {
    alignItems: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 16,
  },
  sentBubble: {
    borderBottomRightRadius: 4,
  },
  receivedBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  messageText: {
    fontSize: 14,
  },
  sentText: {
    color: '#fff',
  },
  receivedText: {
    color: '#1f2937',
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
  },
  sentTime: {
    color: 'rgba(255, 255, 255, 0.7)',
  },
  receivedTime: {
    color: '#9ca3af',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    alignItems: 'flex-end',
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 14,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0369a1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendDisabled: { opacity: 0.45 },
});
