import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { ArrowLeft, Send, Hospital } from 'lucide-react-native';
import { GradientView } from './ui/gradient-button';
import MessagesAPI from '../services/messagesApi';

export function ConversationView({ patientId, branchKey, name, branchName, onBack, onSent, embedded }) {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(false);
  const scrollViewRef = useRef();

  useEffect(() => {
    loadMessages();

    // Optional: Poll for new messages every 5 seconds
    const interval = setInterval(loadMessages, 5000);
    return () => clearInterval(interval);
  }, [patientId, branchKey]);

  const loadMessages = async () => {
    try {
      const data = await MessagesAPI.getMessages(patientId, branchKey);
      setMessages(data);
      setLoadError(false);
      if (data.some(item => item.sender === 'staff' && !item.isRead)) {
        await MessagesAPI.markAsRead(patientId, branchKey);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!message.trim() || loading || loadError || sending) return;

    const textToSend = message.trim();
    setMessage(''); // Clear input immediately for better UX
    setSending(true);
    setSendError(false);

    try {
      const result = await MessagesAPI.sendMessage(patientId, branchKey, textToSend);
      if (result.success) {
        onSent(result.message);
        await loadMessages();
      } else {
        setSendError(true);
        setMessage(textToSend); 
      }
    } catch {
      setSendError(true);
      setMessage(textToSend);
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <GradientView
        colors={['#66BAFF', '#83BFF0']}
        style={[styles.header, embedded && styles.embeddedHeader]}
      >
        {onBack && <TouchableOpacity onPress={onBack} style={styles.backButton} accessibilityLabel="Back to conversations" accessibilityRole="button">
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>}
        <View style={styles.avatar}>
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
              <Text accessibilityRole="alert" style={styles.emptyThread}>Unable to load messages.</Text>
              <TouchableOpacity accessibilityRole="button" onPress={loadMessages} style={styles.retryButton}>
                <Text style={styles.threadTitle}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : messages.length === 0 && (
            <View style={styles.threadState}>
              <Text style={styles.threadTitle}>Start a conversation</Text>
              <Text style={styles.emptyThread}>Send a message to {name} using the field below.</Text>
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
                <View style={[styles.messageBubble, styles.receivedBubble]}>
                  <Text style={[styles.messageText, styles.receivedText]}>
                    {msg.text}
                  </Text>
                  <Text style={[styles.messageTime, styles.receivedTime]}>
                    {msg.timestamp}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </ScrollView>
      )}

      {sendError && <Text accessibilityRole="alert" style={styles.sendError}>Message could not be sent. Try again.</Text>}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          value={message}
          onChangeText={setMessage}
          accessibilityLabel="Message"
          maxLength={4000}
          editable={!loading && !loadError && !sending}
          multiline
        />
        <TouchableOpacity
          onPress={handleSend}
          style={[styles.sendButton, !message.trim() && !sending && styles.sendDisabled]}
          disabled={loading || loadError || sending || !message.trim()}
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
