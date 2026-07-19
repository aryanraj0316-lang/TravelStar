import React, { useState, useRef, useEffect } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Image,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Send,
  Smile,
  Phone,
  Video,
  Info,
  MoreVertical,
  Plus,
  Users as UsersIcon,
  Globe as TranslateIcon,
  MapPin,
  CheckCheck,
} from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Avatars used in the chat screenshot
const AVATARS = {
  vikram: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=100&q=80',
  suman: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=100&q=80',
  rajeshandneha: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&q=80',
  ranchiGhat: require('@/assets/images/spiritual-journey.png'),
};

// Initial messages exactly matching the user's screenshot
const INITIAL_MESSAGES = [
  {
    id: 'msg-1',
    senderName: 'Vikram Singh (Organizer)',
    senderRole: 'Organizer',
    avatar: AVATARS.vikram,
    content: 'Hey team! 👋\nWelcome to the group chat for the Ranchi-Vrindavan spiritual trip.\n\nWe will start from Ranchi Junction on 12th August.',
    timestamp: '10:30 AM',
    roleColor: '#0066FF',
    bubbleBg: '#161829',
    borderColor: '#1E2235',
    roleLabelColor: '#58A6FF',
    isMe: false,
    translations: {
      hindi: 'हे टीम! 👋\nरांची-वृंदावन आध्यात्मिक यात्रा के लिए समूह चैट में आपका स्वागत है।\n\nहम 12 अगस्त को रांची जंक्शन से शुरुआत करेंगे।'
    }
  },
  {
    id: 'msg-2',
    senderName: 'Suman Gupta (Tourist)',
    senderRole: 'Tourist',
    avatar: AVATARS.suman,
    content: 'Super excited! 😍 Is the train ticket booking included in the budget or do we pay extra?',
    timestamp: '10:32 AM',
    roleColor: '#00E676',
    bubbleBg: '#0F1E1A',
    borderColor: '#10352A',
    roleLabelColor: '#00E676',
    isMe: false,
    translations: {
      hindi: 'बेहद उत्साहित! 😍 क्या ट्रेन टिकट बुकिंग बजट में शामिल है या हमें अलग से भुगतान करना होगा?'
    }
  },
  {
    id: 'msg-3',
    senderName: 'Vikram Singh (Organizer)',
    senderRole: 'Organizer',
    avatar: AVATARS.vikram,
    content: 'Yes, it is included in the base package of ₹8500 per head.',
    timestamp: '10:33 AM',
    roleColor: '#0066FF',
    bubbleBg: '#161829',
    borderColor: '#1E2235',
    roleLabelColor: '#58A6FF',
    isMe: false,
    reactions: { emoji: '👍', count: 3 },
    translations: {
      hindi: 'हां, यह ₹8500 प्रति व्यक्ति के मूल पैकेज में शामिल है।'
    }
  }
];

export default function ChatScreen() {
  const isDark = useColorScheme() === 'dark';
  const [activeTab, setActiveTab] = useState<'GROUP' | 'GUIDE' | 'PRIVATE'>('GROUP');
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState('');
  const [translatedMsgs, setTranslatedMsgs] = useState<Set<string>>(new Set());

  // Typing indicator
  const [isTyping, setIsTyping] = useState(true);

  // Send message action
  const handleSend = () => {
    if (inputText.trim() === '') return;
    const newMsg = {
      id: `msg-${Date.now()}`,
      senderName: 'You (Tourist)',
      senderRole: 'Tourist',
      avatar: AVATARS.suman,
      content: inputText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      roleColor: '#00E676',
      bubbleBg: '#161829',
      borderColor: '#1E2235',
      roleLabelColor: '#00E676',
      isMe: true,
      translations: { hindi: `[अनुवाद] ${inputText}` }
    };
    setMessages((prev) => [...prev, newMsg]);
    setInputText('');
  };

  // Toggle Translate
  const toggleTranslate = (id: string) => {
    setTranslatedMsgs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      {/* ─── CHANNELS TOP TAB BAR ──────────────────────────────── */}
      <View style={styles.channelTabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'GROUP' && styles.tabActive]}
            onPress={() => setActiveTab('GROUP')}
          >
            <UsersIcon size={15} color={activeTab === 'GROUP' ? '#0066FF' : '#7E8494'} style={{ marginRight: 6 }} />
            <Text style={[styles.tabText, activeTab === 'GROUP' ? styles.tabTextActive : styles.tabTextInactive]}>
              Ranchi-Vrindavan Group
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'GUIDE' && styles.tabActive]}
            onPress={() => setActiveTab('GUIDE')}
          >
            <View style={[styles.statusDot, { backgroundColor: '#00E676' }]} />
            <Text style={[styles.tabText, activeTab === 'GUIDE' ? styles.tabTextActive : styles.tabTextInactive]}>
              Rajesh (Guide)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeTab === 'PRIVATE' && styles.tabActive]}
            onPress={() => setActiveTab('PRIVATE')}
          >
            <View style={[styles.statusDot, { backgroundColor: '#7E8494' }]} />
            <Text style={[styles.tabText, activeTab === 'PRIVATE' ? styles.tabTextActive : styles.tabTextInactive]}>
              Neha (Solo)
            </Text>
          </TouchableOpacity>
        </ScrollView>
        <TouchableOpacity style={styles.menuBtn}>
          <MoreVertical size={20} color="#7E8494" />
        </TouchableOpacity>
      </View>

      {/* ─── ROOM HEADER INFO PANEL ────────────────────────────── */}
      <View style={styles.roomHeader}>
        <View style={styles.roomInfoLeft}>
          <Image source={AVATARS.ranchiGhat} style={styles.roomAvatar} />
          <View style={styles.roomInfoMeta}>
            <Text style={styles.roomTitle}>Vrindavan Group Chat</Text>
            <View style={styles.roomSubRow}>
              <Text style={styles.roomSubtext}>
                <Text style={styles.blueHighlight}>12 Members</Text> • <Text style={styles.blueHighlight}>3 typing...</Text>
              </Text>
            </View>
            {/* Avatar Pile */}
            <View style={styles.avatarPile}>
              <Image source={{ uri: AVATARS.vikram }} style={styles.pileImage} />
              <Image source={{ uri: AVATARS.suman }} style={[styles.pileImage, { marginLeft: -6 }]} />
              <Image source={{ uri: AVATARS.rajeshandneha }} style={[styles.pileImage, { marginLeft: -6 }]} />
              <View style={[styles.pileMore, { marginLeft: -6 }]}>
                <Text style={styles.pileMoreText}>+9</Text>
              </View>
            </View>
          </View>
        </View>
        <View style={styles.roomInfoRight}>
          <TouchableOpacity style={styles.actionCircle}>
            <Phone size={16} color="#0066FF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCircle}>
            <Video size={16} color="#0066FF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionCircle}>
            <Info size={16} color="#0066FF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── MESSAGES AND FEED ─────────────────────────────────── */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Centered Date Separator */}
          <View style={styles.dateSeparator}>
            <Text style={styles.dateText}>Today, 8 May</Text>
          </View>

          {messages.map((msg) => {
            const hasTranslation = !!translatedMsgs.has(msg.id);
            const displayedContent = hasTranslation && msg.translations?.hindi ? msg.translations.hindi : msg.content;

            return (
              <View key={msg.id} style={styles.messageRow}>
                {/* Avatar */}
                <View style={styles.avatarContainer}>
                  <Image source={typeof msg.avatar === 'string' ? { uri: msg.avatar } : msg.avatar} style={styles.messageAvatar} />
                  {msg.senderName.includes('Vikram') && (
                    <View style={styles.onlineBadge} />
                  )}
                </View>

                {/* Bubble & Sender Meta */}
                <View style={styles.messageBody}>
                  {/* Sender Name and Role tag */}
                  <View style={styles.senderHeader}>
                    <Text style={[styles.senderNameText, { color: msg.isMe ? '#00E676' : msg.roleLabelColor }]}>
                      {msg.senderName}
                    </Text>
                    {msg.senderRole === 'Organizer' && (
                      <View style={styles.organizerPill}>
                        <Text style={styles.organizerPillText}>Organizer</Text>
                      </View>
                    )}
                  </View>

                  {/* Bubble wrapper */}
                  <View
                    style={[
                      styles.bubble,
                      {
                        backgroundColor: msg.bubbleBg,
                        borderColor: msg.borderColor,
                      },
                    ]}
                  >
                    <Text style={styles.bubbleText}>{displayedContent}</Text>

                    {/* Translate action trigger */}
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => toggleTranslate(msg.id)}
                      style={styles.translateRow}
                    >
                      <TranslateIcon size={12} color="#0066FF" />
                      <Text style={styles.translateText}>
                        {hasTranslation ? 'Show Original' : 'Translate'}
                      </Text>
                      <Text style={styles.timestampText}>{msg.timestamp}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Reaction (if any) */}
                  {msg.reactions && (
                    <View style={styles.reactionRow}>
                      <View style={styles.reactionPill}>
                        <Text style={styles.reactionPillText}>
                          {msg.reactions.emoji} {msg.reactions.count}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              </View>
            );
          })}

          {/* Typing Indicator */}
          {isTyping && (
            <View style={styles.typingIndicatorRow}>
              <Text style={styles.typingText}>Neha is typing...</Text>
              <View style={styles.typingDots}>
                <View style={styles.typingDot} />
                <View style={[styles.typingDot, { marginHorizontal: 2 }]} />
                <View style={styles.typingDot} />
              </View>
            </View>
          )}
        </ScrollView>

        {/* ─── BOTTOM CHAT INPUT BAR ────────────────────────────── */}
        <View style={styles.bottomInputBar}>
          <TouchableOpacity style={styles.plusCircle}>
            <Plus size={18} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.textInputWrapper}>
            <TextInput
              placeholder="Type your message..."
              placeholderTextColor="#7E8494"
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity style={styles.smileIcon}>
              <Smile size={18} color="#7E8494" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={styles.sendIconCircle} onPress={handleSend}>
            <Send size={15} color="#FFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Style Declarations ─────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#060814',
  },

  // Top Tab bar navigation
  channelTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#111322',
    backgroundColor: '#060814',
    paddingVertical: 10,
  },
  tabsScroll: {
    paddingLeft: 16,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#0066FF',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
  },
  tabTextActive: {
    color: '#0066FF',
  },
  tabTextInactive: {
    color: '#7E8494',
  },
  menuBtn: {
    paddingHorizontal: 16,
    justifyContent: 'center',
  },

  // Room header panel
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#111322',
    backgroundColor: '#060814',
  },
  roomInfoLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  roomAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  roomInfoMeta: {
    marginLeft: 12,
  },
  roomTitle: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  roomSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  roomSubtext: {
    fontSize: 11,
    color: '#7E8494',
    fontWeight: '600',
  },
  blueHighlight: {
    color: '#58A6FF',
  },
  avatarPile: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  pileImage: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#060814',
  },
  pileMore: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#2A2D3C',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#060814',
  },
  pileMoreText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FFF',
  },
  roomInfoRight: {
    flexDirection: 'row',
    gap: 8,
  },
  actionCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#111322',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,102,255,0.05)',
  },

  // Message scroll feed
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 24,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 14,
  },
  dateText: {
    color: '#7E8494',
    fontSize: 11.5,
    fontWeight: '700',
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 10,
  },
  messageAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: '#00E676',
    borderWidth: 1.5,
    borderColor: '#060814',
  },
  messageBody: {
    flex: 1,
  },
  senderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  senderNameText: {
    fontSize: 12,
    fontWeight: '700',
    marginRight: 6,
  },
  organizerPill: {
    backgroundColor: '#0066FF18',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 0.5,
    borderColor: '#0066FF40',
  },
  organizerPillText: {
    color: '#58A6FF',
    fontSize: 8.5,
    fontWeight: '700',
  },
  bubble: {
    borderRadius: 16,
    borderTopLeftRadius: 2,
    borderWidth: 1,
    padding: 12,
    alignSelf: 'flex-start',
    maxWidth: '92%',
  },
  bubbleText: {
    color: '#FFF',
    fontSize: 13,
    lineHeight: 18,
  },
  translateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: '#1A1D30',
  },
  translateText: {
    color: '#0066FF',
    fontSize: 9.5,
    fontWeight: '700',
    marginLeft: 4,
    flex: 1,
  },
  timestampText: {
    color: '#7E8494',
    fontSize: 9,
    fontWeight: '600',
  },

  // Reaction Pills
  reactionRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  reactionPill: {
    backgroundColor: '#161829',
    borderWidth: 1,
    borderColor: '#1E2235',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  reactionPillText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },

  // Typing indicator
  typingIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 48,
    marginTop: 4,
  },
  typingText: {
    color: '#7E8494',
    fontSize: 11,
    fontWeight: '600',
  },
  typingDots: {
    flexDirection: 'row',
    marginLeft: 6,
  },
  typingDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#7E8494',
  },

  // Bottom Input Text bar
  bottomInputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#060814',
    borderTopWidth: 1,
    borderTopColor: '#111322',
  },
  plusCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0066FF18',
    borderWidth: 1,
    borderColor: '#0066FF40',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  textInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111322',
    borderWidth: 1,
    borderColor: '#1A1D30',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
  },
  textInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 13,
    padding: 0,
  },
  smileIcon: {
    padding: 4,
  },
  sendIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0066FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },
});
