import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, RefreshControl, useWindowDimensions } from 'react-native';
import { ArrowLeft, Hospital, MessageSquare, Search } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ConversationView } from '../components/conversation-view';
import MessagesAPI from '../services/messagesApi';
import { useTheme } from '../context/ThemeContext';

export function MessagesPage({ onBack }) {
  const { display, isDark, t, fs } = useTheme();
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [searchText, setSearchText] = useState('');
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [loadError, setLoadError] = useState(false);
  const latestRequest = useRef(0);
  const wide = useWindowDimensions().width >= 760;

  const fetchConversations = useCallback(async () => {
    const request = ++latestRequest.current;
    try {
      const data = await MessagesAPI.getConversations();
      if (request !== latestRequest.current) return;
      setConversations(data);
      setLoadError(false);
    } catch {
      if (request === latestRequest.current) setLoadError(true);
    } finally {
      if (request === latestRequest.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => MessagesAPI.subscribeToMessages(fetchConversations), [fetchConversations]);

  // Refresh when pulling down
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchConversations();
  }, [fetchConversations]);

  // Filter based on search
  const searchTerm = searchText.trim().toLowerCase();
  const filteredConversations = conversations.filter(conversation =>
    [conversation.name, conversation.branchName, conversation.lastMessage].some(value => value.toLowerCase().includes(searchTerm))
  );

  const conversation = conversations.find(c => c.id === selectedConversation);
  const chat = conversation ? (
    <ConversationView
      key={conversation.id}
      patientId={conversation.patientId}
      branchKey={conversation.branchKey}
      name={conversation.name}
      branchName={conversation.branchName}
      embedded={wide}
      onSent={message => setConversations(previous => previous.map(item => item.id === conversation.id
        ? { ...item, lastMessage: message.text, timestamp: 'Just now', unread: false }
        : item))}
      onBack={wide ? undefined : () => {
        setSelectedConversation(null);
        fetchConversations();
      }}
    />
  ) : null;

  if (!wide && chat) return chat;

  return (
    <View style={[styles.container, { backgroundColor: display.bg }]}>
      <LinearGradient
        colors={['#66BAFF', '#83BFF0']}
        style={styles.header}
      >
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ArrowLeft size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { fontSize: fs(18) }]}>{t?.messagesTitle || 'Messages'}</Text>
      </LinearGradient>

      <View style={styles.workspace}>
        <View style={[styles.listPane, wide && styles.listPaneWide, { backgroundColor: display.bg }]}>
        <View style={styles.searchContainer}>
          <Text style={[styles.listHeading, { color: display.textPrimary, fontSize: fs(16) }]}>{t?.searchConversations || 'Hospitals & clinics'}</Text>
          <View style={[styles.searchInputWrapper, { backgroundColor: display.subCardBg }]}>
            <Search size={20} color={display.placeholder} style={styles.searchIcon} />
            <TextInput
              style={[styles.searchInput, { color: display.textPrimary, fontSize: fs(14) }]}
              placeholder={t?.searchConversations || 'Search hospitals and clinics'}
              accessibilityLabel={t?.searchConversations || 'Search hospitals and clinics'}
              placeholderTextColor={display.placeholder}
              value={searchText}
              onChangeText={setSearchText}
            />
          </View>
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#0ea5e9" />
          </View>
        ) : (
          <ScrollView
            style={styles.conversationsList}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            {filteredConversations.length === 0 ? (
              <View style={styles.centerContainer}>
                <Text style={[styles.emptyText, { color: display.textSecondary, fontSize: fs(14) }]}>
                  {loadError
                    ? (t?.unableToLoadConversations || 'Unable to load conversations.')
                    : searchTerm
                      ? (t?.noMatchingHospitals || 'No matching hospitals or clinics.')
                      : (t?.noLinkedHospitals || 'No linked hospitals or clinics yet.')}
                </Text>
                {loadError && (
                  <TouchableOpacity accessibilityRole="button" onPress={onRefresh} style={styles.retryButton}>
                    <Text style={[styles.retryText, { fontSize: fs(14) }]}>{t?.tryAgain || 'Try again'}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              filteredConversations.map((conv) => (
                <TouchableOpacity
                  key={conv.id}
                  onPress={() => setSelectedConversation(conv.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedConversation === conv.id }}
                  style={[
                    styles.conversationItem,
                    { backgroundColor: display.cardBg, borderColor: display.border },
                    selectedConversation === conv.id && styles.selectedItem,
                  ]}
                >
                  <View style={[styles.avatar, { backgroundColor: isDark ? '#1e3a8a' : '#e0f2fe' }]}>
                    <Hospital size={22} color="#0369a1" />
                  </View>
                  <View style={styles.conversationContent}>
                    <View style={styles.conversationHeader}>
                      <Text numberOfLines={1} style={[styles.conversationName, { color: display.textPrimary, fontSize: fs(15) }]}>{conv.name}</Text>
                      {!!conv.timestamp && <Text style={[styles.conversationTime, { color: display.textSecondary, fontSize: fs(12) }]}>{conv.timestamp}</Text>}
                    </View>
                    <Text numberOfLines={1} style={[styles.branchName, { fontSize: fs(13) }]}>{conv.branchName}</Text>
                    <Text
                      style={[
                        styles.conversationMessage,
                        { color: display.textSecondary, fontSize: fs(13) },
                        conv.unread && [styles.conversationMessageUnread, { color: display.textPrimary }]
                      ]}
                      numberOfLines={1}
                    >
                      {conv.lastMessage || (t?.startConversation || 'Start a conversation')}
                    </Text>
                  </View>
                  {conv.unread && (
                    <View style={styles.unreadBadge}>
                      <View style={styles.unreadDot} />
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}
        </View>
        {wide && <View style={styles.chatPane}>{chat || (
          <View style={styles.centerContainer}>
            <MessageSquare size={26} color="#0369a1" />
            <Text style={styles.emptyText}>Select a hospital or clinic to open its chat.</Text>
          </View>
        )}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  workspace: { flex: 1, flexDirection: 'row', backgroundColor: '#f8fafc' },
  listPane: { flex: 1, backgroundColor: '#fff' },
  listPaneWide: { flex: 0, width: 320, borderRightWidth: 1, borderRightColor: '#e2e8f0' },
  chatPane: { flex: 1 },
  listHeading: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  selectedItem: { backgroundColor: '#eff6ff', borderColor: '#93c5fd' },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 40,
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
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  searchContainer: {
    padding: 16,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1f2937',
  },
  conversationsList: {
    flex: 1,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  conversationName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  conversationTime: {
    fontSize: 12,
    color: '#6b7280',
  },
  branchName: { color: '#0369a1', fontSize: 12, marginTop: 2, marginBottom: 4 },
  retryButton: { marginTop: 12, padding: 10 },
  retryText: { color: '#0369a1', fontWeight: '600' },
  conversationMessage: {
    fontSize: 14,
    color: '#6b7280',
  },
  conversationMessageUnread: {
    color: '#1f2937',
    fontWeight: '600',
  },
  unreadBadge: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#0ea5e9',
  },
  emptyText: {
    color: '#9ca3af',
    fontSize: 16,
  }
});
