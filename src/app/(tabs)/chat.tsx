import { LinearGradient } from 'expo-linear-gradient';
import { logger } from '@/lib/logger';
import { errorToastMessage, showAlert, toast, useConfirm } from '@/lib/feedback';
import { getCurrentDeviceLocation } from '@/lib/device-location';
import { uploadFileToUrl } from '@/lib/upload';
import { formatINR } from '@/lib/money';
import { formatDateRange } from '@/lib/datetime';
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { RouteErrorFallback } from '@/components/route-error-fallback';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  BarChart2,
  Calendar,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  Copy,
  CornerUpLeft,
  DollarSign,
  Download,
  Image as ImageIcon,
  LogOut,
  MapPin,
  MessageSquare,
  MoreVertical,
  Pin,
  Plus,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Smile,
  Globe as TranslateIcon,
  Trash2,
  Users as UsersIcon,
  X,
} from 'lucide-react-native';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  PanResponder,
  Platform,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { apiService } from '@/services/api';
import { eventBus } from '@/services/event-bus';
import { useApp } from '@/store/AppContext';
import { C, MIN_TOUCH_TARGET, fontSize, radii } from '@/theme/tokens';
import { Button, Input } from '@/components/ui';

// Deliberately require(), not import(): needs to synchronously catch a
// missing/unlinked native module at load time (same reasoning as
// profile.tsx's identical pattern).
let ImagePicker: typeof import('expo-image-picker') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  ImagePicker = require('expo-image-picker');
} catch {
  ImagePicker = null;
}

// Color Palette matching search theme exactly

// Custom Type for Rich Messages
interface CustomMessage {
  id: string;
  senderName: string;
  senderRole: 'Organizer' | 'Guide' | 'Tourist' | 'Family' | 'System' | string;
  avatar: string;
  content: string;
  timestamp: string;
  isMe: boolean;
  senderId?: string;
  type?: 'text' | 'image' | 'voice' | 'poll' | 'expense' | 'location' | 'sos';
  mediaUrl?: string;
  translations?: Record<string, string>;
  pollQuestion?: string;
  pollOptions?: { text: string; votes: number }[];
  pollVoted?: number; // index of option voted by me
  expenseAmount?: number;
  expenseDesc?: string;
  expenseSplitWith?: number;
  locationCoords?: { latitude: number; longitude: number };
  sosId?: string;
  resolved?: boolean;
  replyTo?: {
    id: string;
    senderName: string;
    content: string;
  };
}

// docs/REMEDIATION.md §9.3/§9.4 follow-up: an INITIAL_TRIP_MESSAGES
// constant used to live here — full fabricated conversations for three
// seed trip ids ("trip-1"/"trip-2"/"trip-3"), spread into tripMessages'
// initial state, alongside five hardcoded inboxRooms entries
// ("Ranchi-Vrindavan Group Chat", two fake 1:1 guide chats, etc.) with
// invented unread counts and Date.now()-derived timestamps so they always
// looked recent. loadInboxRooms() below only ever *merged* real API rooms
// into that list rather than replacing it, so every user, on every
// account, saw these five fake chat rooms with fabricated people and
// conversations permanently mixed into their real inbox — the exact
// "mock data presented as real" pattern §0.2 bans and that every other
// screen in this remediation program has had removed already (chat.tsx's
// own removed polls/expense-ledger/documents-vault below are the same
// call, just never applied to the inbox/message seed itself). Removed;
// tripMessages and inboxRooms now start empty and are populated
// exclusively from apiService.getChats()/getChatMessages() and the
// socket sync effect.

// Group polls were removed here, not rebuilt (docs/REMEDIATION.md §8.7).
// This used to be INITIAL_TRIP_POLLS: three hardcoded polls keyed by the
// old seed trip ids, each with invented vote counts ("Govinda's Restaurant
// (ISKCON)", votes: 8) that every user saw identically. There is no Poll
// model, no endpoint, and no per-user vote record, so nothing stopped one
// person voting a hundred times and no vote survived a reload. The
// identical "group consensus polls" feature in group-organizer.tsx was
// already removed as unbackable for exactly these reasons; this is the same
// call, applied consistently.

// The in-chat expense ledger was removed here, not rebuilt
// (docs/REMEDIATION.md §8.7 / §8.12). It was a local useState map seeded
// with INITIAL_TRIP_EXPENSES — hardcoded rows like "Train Ticket Booking,
// ₹8,500, paid by Vikram Singh, split 12 ways" — that reset on unmount,
// invented its own ids (`exp-${Date.now()}`, banned by §0.2.4), and was a
// second, contradictory expense system competing with the real one: §8.12
// built a persisted TripExpense model with participant-scoped
// GET/POST/DELETE /trips/:tripId/expenses and server-derived splits, which
// budget-tracker.tsx uses. Chat now links there instead of keeping a
// parallel fake ledger that never agreed with it.

// Swipe to Reply gesture wrapper component
const SwipeableMessageRow = ({
  children,
  onSwipeReply,
  isMe,
}: {
  children: React.ReactNode;
  onSwipeReply: () => void;
  isMe: boolean;
}) => {
  const pan = useState(() => new Animated.Value(0))[0];

  // useState's lazy initializer (matching `pan` above), not useRef().current
  // - reading .current synchronously during render is a react-hooks/refs
  // violation; this is the React Compiler's supported way to create a
  // stable value without it.
  const panResponder = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        // Active when dragging left-to-right significantly, and horizontal exceeds vertical
        return gestureState.dx > 10 && Math.abs(gestureState.dy) < 8;
      },
      onPanResponderMove: (evt, gestureState) => {
        // Drag only to the right, up to a limit of 70px
        if (gestureState.dx > 0) {
          pan.setValue(Math.min(gestureState.dx, 70));
        } else {
          pan.setValue(0);
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dx > 55) {
          onSwipeReply();
        }
        Animated.spring(pan, {
          toValue: 0,
          useNativeDriver: true,
          tension: 50,
          friction: 6,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(pan, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    }),
  )[0];

  return (
    <View style={{ position: 'relative', width: '100%' }} {...panResponder.panHandlers}>
      {/* Revealed background reply icon container */}
      <Animated.View
        style={{
          position: 'absolute',
          left: 12,
          top: 0,
          bottom: 0,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: pan.interpolate({
            inputRange: [0, 35],
            outputRange: [0, 1],
            extrapolate: 'clamp',
          }),
          transform: [
            {
              scale: pan.interpolate({
                inputRange: [0, 55],
                outputRange: [0.6, 1.1],
                extrapolate: 'clamp',
              }),
            },
          ],
        }}
      >
        <LinearGradient
          colors={['#0066FF', '#7C3AED']}
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: '#0066FF',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 4,
            elevation: 4,
          }}
        >
          <CornerUpLeft size={16} color="#FFF" />
        </LinearGradient>
      </Animated.View>

      <Animated.View
        style={{
          transform: [{ translateX: pan }],
          width: '100%',
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
};

// WhatsApp-style Room model
interface ChatRoom {
  id: string;
  tripId: string;
  name: string;
  avatar: string;
  type: 'GROUP' | 'GUIDE' | 'SAFETY';
  latestMessage: string;
  latestTime: string;
  unreadCount: number;
  badge?: string;
  lastMessageAt?: string;
}

const SENDER_ROLE_LABEL_KEYS: Record<string, string> = {
  Organizer: 'chat.roleOrganizer',
  Guide: 'chat.roleGuide',
  Tourist: 'chat.roleTourist',
  Family: 'chat.roleFamily',
  System: 'chat.roleSystem',
};

// One chat message. Extracted from an inline `.map()` so the message list can
// be virtualized (the FlatList below) and so the React Compiler
// (app.json > experiments.reactCompiler) can memoize bubbles independently —
// which is why there is no hand-written React.memo here. A busy trip group is
// the app's only truly unbounded list, and it previously mounted every message
// it had ever loaded, all at once (docs/REMEDIATION.md Phase 10).
function MessageBubble({
  msg,
  previousSenderName,
  isTranslated,
  onReply,
  onShowOptions,
  onToggleTranslate,
  onPollVote,
  onOpenMap,
  canResolveSOS,
  onResolveSOS,
}: {
  msg: CustomMessage;
  previousSenderName: string | null;
  isTranslated: boolean;
  onReply: (msg: CustomMessage) => void;
  onShowOptions: (msg: CustomMessage) => void;
  onToggleTranslate: (id: string) => void;
  onPollVote: (msgId: string, optionIdx: number) => void;
  onOpenMap: () => void;
  // Resolving an SOS is an organizer/guide action, and it clears the trip's
  // *active* alert rather than this message — hence no message argument.
  canResolveSOS: boolean;
  onResolveSOS: () => void;
}) {
  const { t } = useTranslation();
  const hasTranslation = isTranslated;
  const displayedContent = hasTranslation && msg.translations?.hindi ? msg.translations.hindi : msg.content;
  const isSOS = msg.type === 'sos';
  const isSystem = msg.senderRole === 'SYSTEM' || msg.senderName === 'System';

  if (isSystem) {
    return (
      <View style={styles.systemMessageContainer}>
        <Text style={styles.systemMessageText}>{displayedContent}</Text>
      </View>
    );
  }

  // Check if previous message was sent by the same sender using senderName as key
  const isConsecutive = previousSenderName === msg.senderName;

  return (
    <SwipeableMessageRow isMe={msg.isMe} onSwipeReply={() => onReply(msg)}>
      <View
        style={[
          styles.messageRow,
          msg.isMe && { justifyContent: 'flex-end' },
          isSOS && styles.sosMessageBg,
          isConsecutive && { marginTop: 2 },
        ]}
      >
        {!msg.isMe && (
          <View style={styles.avatarContainer}>
            {!isConsecutive && (
              <>
                <Image source={{ uri: msg.avatar }} style={styles.messageAvatar} />
              </>
            )}
          </View>
        )}

        <View style={[styles.messageBody, msg.isMe ? { flex: 1, alignItems: 'flex-end' } : { flex: 1 }]}>
          {!isConsecutive && (
            <View style={[styles.senderHeader, msg.isMe && { justifyContent: 'flex-end' }]}>
              <Text
                style={[
                  styles.senderNameText,
                  msg.senderRole === 'Organizer'
                    ? { color: C.blueGlow }
                    : msg.senderRole === 'Guide'
                      ? { color: C.purple }
                      : { color: C.green },
                ]}
              >
                {msg.isMe ? t('chat.you') : msg.senderName}
              </Text>
              {msg.senderRole && !msg.isMe && (
                <View
                  style={[
                    styles.rolePill,
                    msg.senderRole === 'Organizer'
                      ? styles.rolePillOrganizer
                      : msg.senderRole === 'Guide'
                        ? styles.rolePillGuide
                        : styles.rolePillTourist,
                  ]}
                >
                  <Text style={styles.rolePillText}>
                    {SENDER_ROLE_LABEL_KEYS[msg.senderRole] ? t(SENDER_ROLE_LABEL_KEYS[msg.senderRole]) : msg.senderRole}
                  </Text>
                </View>
              )}
            </View>
          )}

          {msg.type === 'poll' ? (
            <View style={styles.pollCard}>
              <View style={styles.pollHeader}>
                <BarChart2 size={16} color={C.orange} style={{ marginRight: 6 }} />
                <Text style={styles.pollQuestionText}>{msg.pollQuestion}</Text>
              </View>
              {msg.pollOptions?.map((opt, idx) => {
                const totalVotes = msg.pollOptions?.reduce((acc, current) => acc + current.votes, 0) || 1;
                const percent = Math.round((opt.votes / totalVotes) * 100) || 0;
                const isVotedByMe = msg.pollVoted === idx;

                return (
                  <TouchableOpacity
                    key={opt.text}
                    style={[styles.pollOptionTouch, isVotedByMe && styles.pollOptionVoted]}
                    onPress={() => onPollVote(msg.id, idx)}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.pollOptionLabel', { option: opt.text, percent, votes: opt.votes })}
                    accessibilityState={{ selected: isVotedByMe }}
                  >
                    <View style={[styles.pollProgressFill, { width: `${percent}%` }]} />
                    <View style={styles.pollOptionContent}>
                      <Text style={[styles.pollOptionLabel, isVotedByMe && { fontWeight: '800', color: '#FFF' }]}>
                        {opt.text}
                      </Text>
                      <Text style={styles.pollOptionPercent}>
                        {percent}% ({opt.votes})
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
              <Text style={styles.pollFooter}>{t('chat.tapToVote')}</Text>
            </View>
          ) : msg.type === 'expense' ? (
            <View style={styles.expenseCard}>
              <View style={styles.expenseHeader}>
                <DollarSign size={16} color={C.green} />
                <Text style={styles.expenseHeaderTitle}>{t('chat.sharedExpenseLogged')}</Text>
              </View>
              <Text style={styles.expenseBillDesc}>{msg.expenseDesc}</Text>
              <Text style={styles.expenseBillAmount}>₹{msg.expenseAmount}</Text>
              <View style={styles.expenseDivider} />
              <View style={styles.expenseFooterRow}>
                <Text style={styles.expenseShareText}>{t('chat.splitWithMembers', { count: msg.expenseSplitWith })}</Text>
                <Text style={styles.expenseCostHead}>
                  {t('chat.perHead', { amount: Math.round((msg.expenseAmount || 0) / (msg.expenseSplitWith || 1)) })}
                </Text>
              </View>
            </View>
          ) : msg.type === 'location' ? (
            <View style={styles.locationCard}>
              <View style={styles.locationHeader}>
                <MapPin size={16} color={C.blueGlow} />
                <Text style={styles.locationCardTitle}>{t('chat.sharedMeetingPoint')}</Text>
              </View>
              <Text style={styles.locationText}>{msg.content}</Text>
              <View style={styles.miniMapPlaceholder}>
                <View style={styles.radarRing1} />
                <View style={styles.radarRing2} />
                <MapPin size={24} color={C.red} style={styles.miniMapPin} />
                <Text style={styles.coordsText}>
                  {t('chat.latLng', {
                    lat: msg.locationCoords?.latitude.toFixed(4),
                    lng: msg.locationCoords?.longitude.toFixed(4),
                  })}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.locationActionTouch}
                onPress={onOpenMap}
                hitSlop={{ top: 9, bottom: 9, left: 9, right: 9 }}
                accessibilityRole="button"
                accessibilityLabel={t('chat.openLiveNavigation')}
              >
                <Text style={styles.locationActionText}>{t('chat.openLiveNavigation')}</Text>
              </TouchableOpacity>
            </View>
          ) : msg.type === 'voice' ? (
            <View style={styles.voiceNoteCard}>
              <TouchableOpacity
                style={styles.playButtonCircle}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('chat.playVoiceMessage')}
              >
                <View style={styles.playArrow} />
              </TouchableOpacity>
              <View style={styles.waveformContainer}>
                <View style={[styles.waveBar, { height: 12, backgroundColor: C.blueGlow }]} />
                <View style={[styles.waveBar, { height: 22, backgroundColor: C.blueGlow }]} />
                <View style={[styles.waveBar, { height: 18, backgroundColor: C.blueGlow }]} />
                <View style={[styles.waveBar, { height: 14, backgroundColor: C.textSec }]} />
                <View style={[styles.waveBar, { height: 8, backgroundColor: C.textSec }]} />
                <View style={[styles.waveBar, { height: 16, backgroundColor: C.textSec }]} />
                <View style={[styles.waveBar, { height: 24, backgroundColor: C.textSec }]} />
                <View style={[styles.waveBar, { height: 10, backgroundColor: C.textSec }]} />
              </View>
              <Text style={styles.voiceDuration}>0:04</Text>
            </View>
          ) : msg.type === 'image' ? (
            <View style={styles.imageCard}>
              <Image source={{ uri: msg.mediaUrl }} style={styles.imageMedia} />
              <View style={styles.imageOverlayTextRow}>
                <Text style={styles.imageCardDesc} numberOfLines={1}>
                  {msg.content}
                </Text>
                <TouchableOpacity
                  style={styles.imageDownloadBtn}
                  hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.downloadImage')}
                >
                  <Download size={14} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>
          ) : msg.type === 'sos' ? (
            <View style={styles.sosCardAlert}>
              <View style={styles.sosAlertHeader}>
                <AlertCircle size={18} color="#FFF" />
                <Text style={styles.sosAlertHeaderTitle}>{t('chat.criticalEmergencyWarning')}</Text>
              </View>
              <Text style={styles.sosAlertDesc}>{msg.content}</Text>
              <Text style={styles.sosAlertCoords}>
                {t('chat.coordinates', {
                  lat: msg.locationCoords?.latitude.toFixed(4),
                  lng: msg.locationCoords?.longitude.toFixed(4),
                })}
              </Text>
              <View style={styles.sosAlertBtnRow}>
                <TouchableOpacity
                  style={[styles.sosAlertBtn, { backgroundColor: 'rgba(255,255,255,0.15)' }]}
                  onPress={onOpenMap}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.showOnMap')}
                >
                  <Text style={styles.sosAlertBtnText}>{t('chat.showOnMap')}</Text>
                </TouchableOpacity>
                {canResolveSOS ? (
                  <TouchableOpacity
                    style={[styles.sosAlertBtn, { backgroundColor: C.green }]}
                    onPress={onResolveSOS}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.markAsSafe')}
                  >
                    <Text style={styles.sosAlertBtnText}>{t('chat.markAsSafe')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={[msg.isMe ? styles.instagramBubbleContainerMe : styles.bubbleContainerOther]}>
              {msg.isMe ? (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onLongPress={() => onShowOptions(msg)}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.you')}
                  accessibilityHint={t('chat.messageOptionsHint')}
                >
                  <LinearGradient
                    colors={['#0066FF', '#7C3AED', '#BA68C8']}
                    start={(() => {
                      // Compute deterministic but randomized start coordinates based on message ID
                      let hash = 0;
                      const idStr = msg.id || 'random';
                      for (let i = 0; i < idStr.length; i++) {
                        hash = idStr.charCodeAt(i) + ((hash << 5) - hash);
                      }
                      const normX = (Math.abs(hash) % 5) / 10; // 0.0 to 0.4
                      const normY = (Math.abs(hash >> 2) % 5) / 10; // 0.0 to 0.4
                      return { x: normX, y: normY };
                    })()}
                    end={(() => {
                      let hash = 0;
                      const idStr = msg.id || 'random';
                      for (let i = 0; i < idStr.length; i++) {
                        hash = idStr.charCodeAt(i) + ((hash << 3) - hash);
                      }
                      const normX = 0.6 + (Math.abs(hash) % 5) / 10; // 0.6 to 1.0
                      const normY = 0.6 + (Math.abs(hash >> 2) % 5) / 10; // 0.6 to 1.0
                      return { x: normX, y: normY };
                    })()}
                    style={styles.instagramGradientBubble}
                  >
                    {msg.replyTo && (
                      <View style={styles.bubbleReplyHeaderMe}>
                        <Text style={styles.bubbleReplySenderMe} numberOfLines={1}>
                          {msg.replyTo.senderName}
                        </Text>
                        <Text style={styles.bubbleReplyContentMe} numberOfLines={1}>
                          {msg.replyTo.content}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.bubbleTextMe}>{displayedContent}</Text>
                    <Text style={styles.timestampTextMe}>{msg.timestamp}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.9}
                  onLongPress={() => onShowOptions(msg)}
                  accessibilityRole="button"
                  accessibilityLabel={msg.senderName}
                  accessibilityHint={t('chat.messageOptionsHint')}
                >
                  <View style={[styles.bubble, styles.bubbleOther]}>
                    {msg.replyTo && (
                      <View style={styles.bubbleReplyHeaderOther}>
                        <Text style={styles.bubbleReplySenderOther} numberOfLines={1}>
                          {msg.replyTo.senderName}
                        </Text>
                        <Text style={styles.bubbleReplyContentOther} numberOfLines={1}>
                          {msg.replyTo.content}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.bubbleText}>{displayedContent}</Text>
                    {msg.translations && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => onToggleTranslate(msg.id)}
                        style={styles.translateRow}
                        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={hasTranslation ? t('chat.showOriginal') : t('chat.translateToHindi')}
                      >
                        <TranslateIcon size={12} color={C.blueGlow} />
                        <Text style={styles.translateText}>
                          {hasTranslation ? t('chat.showOriginal') : t('chat.translateToHindi')}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <Text style={styles.timestampText}>{msg.timestamp}</Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>
    </SwipeableMessageRow>
  );
}

const messageKeyExtractor = (m: CustomMessage) => m.id;

function ChatScreen() {
  useEffect(() => {
    logger.log('Screen mounted: ChatScreen');
  }, []);
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const lastScrollYRef = useRef(0);
  const navbarHiddenRef = useRef(false);
  const {
    trips,
    profile,
    sosAlerts,
    triggerSOS,
    resolveSOS,
    activeRoomId,
    setActiveRoomId,
    messages,
    sendMessage,
    setTyping,
    typingUser,
    clearChatUnread,
    refreshTrips,
  } = useApp();

  // Active Trip selection (binds details drawer + polls + expenses)
  const [selectedTripId, setSelectedTripId] = useState<string>('');

  // Dynamic database members state
  const [dbMembers, setDbMembers] = useState<{ name: string; avatar: string; role: string; id?: string }[]>([]);

  // Stateful Chat Data — starts empty; populated exclusively from
  // apiService.getChats()/getChatMessages() (loadInboxRooms below and the
  // message-history effect) and the real-time socket sync effect. See the
  // removed-INITIAL_TRIP_MESSAGES comment above the CustomMessage/ChatRoom
  // interfaces for why this used to be seeded with fake conversations.
  const [tripMessages, setTripMessages] = useState<Record<string, CustomMessage[]>>({});

  // Inbox Rooms state - updates snippet text in real-time. Starts empty for
  // the same reason as tripMessages above.
  const [inboxRooms, setInboxRooms] = useState<ChatRoom[]>([]);

  const loadInboxRooms = useCallback(async () => {
    try {
      const res = await apiService.getChats();
      if (res && res.length > 0) {
        const loadedRooms: ChatRoom[] = res.map((r) => ({
          id: r.id,
          tripId: r.tripId ?? '',
          name: r.name,
          avatar: r.avatar,
          type: (r.type as ChatRoom['type']) || 'GROUP',
          latestMessage: r.latestMessage,
          latestTime: r.latestTime,
          unreadCount: r.unreadCount || 0,
          badge: r.badge || 'Member',
          lastMessageAt: r.lastMessageAt || new Date().toISOString(),
        }));

        setInboxRooms((prevRooms) => {
          const merged = [...prevRooms];
          loadedRooms.forEach((lr) => {
            const idx = merged.findIndex((mr) => mr.id === lr.id);
            if (idx >= 0) {
              merged[idx] = { ...merged[idx], ...lr };
            } else {
              merged.push(lr);
            }
          });
          return merged;
        });
      }
    } catch (e) {
      logger.warn('Failed to load chat rooms from backend:', e);
    }
  }, []);

  useEffect(() => {
    clearChatUnread();
    refreshTrips();
    // False positive: the linter traces into loadInboxRooms and sees it
    // eventually calls setInboxRooms, but that call happens after an
    // `await`, inside a resolved promise's continuation — not synchronously
    // within this effect's body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInboxRooms();
  }, [clearChatUnread, refreshTrips, loadInboxRooms]);

  // Navigation States
  const selectedRoomId = activeRoomId;
  const setSelectedRoomId = setActiveRoomId;
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isTripDetailsExpanded, setIsTripDetailsExpanded] = useState(false);

  // Tab Selection
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'chat' | 'itinerary' | 'members'>('chat');

  // Load message history from DB
  useEffect(() => {
    if (selectedRoomId) {
      apiService
        .markChatRead(selectedRoomId)
        .then(() => {
          setInboxRooms((prevRooms) =>
            prevRooms.map((room) => (room.id === selectedRoomId ? { ...room, unreadCount: 0 } : room)),
          );
        })
        .catch((e) => logger.warn('[Chat] Mark-read failed:', e));

      apiService
        .getChatMessages(selectedRoomId)
        .then((history) => {
          if (history && history.length > 0) {
            const mappedHistory: CustomMessage[] = history.map((m) => {
              const isMe = m.senderId === profile.id || !!(profile.name && m.senderName === profile.name);
              return {
                id: m.id,
                senderId: m.senderId,
                senderName: m.senderName,
                senderRole: m.senderRole,
                avatar: isMe
                  ? profile.avatar
                  : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
                content: m.content,
                timestamp: m.timestamp,
                isMe: isMe,
                type: m.mediaType === 'IMAGE' ? 'image' : m.mediaType === 'VOICE' ? 'voice' : 'text',
              };
            });

            setTripMessages((prev) => ({
              ...prev,
              [selectedRoomId]: mappedHistory,
            }));

            const lastMsg = history[history.length - 1];
            setInboxRooms((prevRooms) => {
              const nowIso = new Date().toISOString();
              const existingRoom = prevRooms.find((r) => r.id === selectedRoomId);
              const otherRooms = prevRooms.filter((r) => r.id !== selectedRoomId);

              if (existingRoom) {
                const updatedRoom: ChatRoom = {
                  ...existingRoom,
                  latestMessage: `${lastMsg.senderName === profile.name ? 'You' : lastMsg.senderName}: ${lastMsg.content}`,
                  latestTime: lastMsg.timestamp,
                  unreadCount: 0,
                  lastMessageAt: nowIso,
                };
                return [updatedRoom, ...otherRooms];
              }
              return prevRooms;
            });
          }
        })
        .catch((e) => {
          logger.warn('Failed to load chat messages:', e);
        });
    }
  }, [selectedRoomId, profile.avatar, profile.id, profile.name]);

  // Reset tab to chat when activeRoomId/selectedRoomId changes. react.dev's
  // documented pattern for this (compare against a ref during render, adjust
  // state if it changed) isn't compatible with the React Compiler running on
  // this codebase — it flags ref reads/writes during render as impure
  // (react-hooks/refs) — so this stays a plain effect. The cascading-render
  // cost the set-state-in-effect rule warns about is one extra render on
  // room switch, not a correctness issue.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveTab('chat');
  }, [activeRoomId]);

  // Sync real-time socket messages from context to component's map state.
  // dbMembers/tripMessages/inboxRooms are each hydrated from their own REST
  // call elsewhere in this file too, so this can't be replaced with a pure
  // derivation of `messages` alone — it incrementally merges each arriving
  // socket message into whatever those calls already loaded.
  useEffect(() => {
    if (messages.length > 0) {
      const latestMsg = messages[messages.length - 1];
      const key = latestMsg.roomId || activeRoomId || 'unknown-room';

      // Check if this is a system message about a new user joining
      const isSystemMsg = latestMsg.senderRole === 'SYSTEM' || latestMsg.senderName === 'System';
      if (isSystemMsg && latestMsg.content.includes('has joined the group')) {
        const userName = latestMsg.content.replace(' has joined the group', '').trim();
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDbMembers((prev) => {
          if (prev.some((m) => m.name.toLowerCase() === userName.toLowerCase())) return prev;
          return [
            ...prev,
            {
              name: userName,
              avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
              role: 'Tourist',
            },
          ];
        });
      }

      setTripMessages((prev) => {
        const roomMsgs = prev[key] || [];
        if (roomMsgs.some((m) => m.id === latestMsg.id)) {
          return prev;
        }

        const isMe = latestMsg.senderId === profile.id || !!(profile.name && latestMsg.senderName === profile.name);
        const dupIdx = isMe
          ? roomMsgs.findIndex((m) => m.isMe && m.content === latestMsg.content && m.id.startsWith('msg-'))
          : -1;

        if (dupIdx >= 0) {
          const updatedMsgs = [...roomMsgs];
          updatedMsgs[dupIdx] = {
            ...updatedMsgs[dupIdx],
            id: latestMsg.id,
            timestamp: latestMsg.timestamp,
          };
          return {
            ...prev,
            [key]: updatedMsgs,
          };
        }

        const newMsg: CustomMessage = {
          id: latestMsg.id,
          senderId: latestMsg.senderId,
          senderName: latestMsg.senderName,
          senderRole: latestMsg.senderRole,
          avatar: isMe
            ? profile.avatar
            : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
          content: latestMsg.content,
          timestamp: latestMsg.timestamp,
          isMe: isMe,
          type: latestMsg.mediaType === 'IMAGE' ? 'image' : latestMsg.mediaType === 'VOICE' ? 'voice' : 'text',
        };

        return {
          ...prev,
          [key]: [...roomMsgs, newMsg],
        };
      });

      setInboxRooms((prevRooms) => {
        const nowIso = new Date().toISOString();
        const isMe = latestMsg.senderId === profile.id || !!(profile.name && latestMsg.senderName === profile.name);
        const senderLabel = isMe ? 'You' : latestMsg.senderName || 'System';
        const snippetText = `${senderLabel}: ${latestMsg.content}`;

        const existingRoom = prevRooms.find((room) => room.id === key);
        const otherRooms = prevRooms.filter((room) => room.id !== key);

        if (existingRoom) {
          const updatedRoom: ChatRoom = {
            ...existingRoom,
            latestMessage: snippetText,
            latestTime: latestMsg.timestamp || 'Just Now',
            unreadCount: key === activeRoomId ? 0 : existingRoom.unreadCount + 1,
            lastMessageAt: nowIso,
          };
          return [updatedRoom, ...otherRooms];
        } else {
          const roomType = key.includes('guide') || key.includes('dm') ? 'GUIDE' : 'GROUP';
          const newRoom: ChatRoom = {
            id: key,
            tripId: selectedTripId,
            name: key.includes('group') ? 'New Group Chat' : latestMsg.senderName || 'New Chat',
            avatar: isMe
              ? profile.avatar
              : 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80',
            type: roomType,
            latestMessage: snippetText,
            latestTime: latestMsg.timestamp || 'Just Now',
            unreadCount: key === activeRoomId || isMe ? 0 : 1,
            badge: roomType === 'GUIDE' ? 'Guide' : 'Group Chat',
            lastMessageAt: nowIso,
          };
          return [newRoom, ...otherRooms];
        }
      });
    }
  }, [messages, activeRoomId, profile.avatar, profile.id, profile.name, selectedTripId]);

  // Filters for the Inbox List view
  const [inboxFilter, setInboxFilter] = useState<'ALL' | 'GROUPS' | 'GUIDES'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Load trip members from database dynamically when selectedTripId changes
  useEffect(() => {
    if (selectedTripId) {
      apiService
        .getTripMembers(selectedTripId)
        .then((membersData) => {
          if (membersData && Array.isArray(membersData)) {
            // TripMemberRow (src/types/api.ts) carries `isCreator`, not a
            // `role`/nested `user` shape — this used to read fields that
            // never existed on the real response (`m.role`, `m.user.role`,
            // `m.user.profile.*`), so every member silently rendered as
            // 'Tourist' regardless of who actually organized the trip.
            const mapped = membersData.map((m) => ({
              id: m.userId,
              name: m.name,
              avatar: m.avatar,
              role: m.isCreator ? 'Organizer' : 'Tourist',
            }));
            setDbMembers(mapped);
          } else {
            setDbMembers([]);
          }
        })
        .catch((err) => {
          logger.warn('Failed to fetch trip members:', err);
          setDbMembers([]);
        });
    }
  }, [selectedTripId]);

  // Bottom attachments overlay
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const attachPanelHeight = useState(() => new Animated.Value(0))[0];

  // Keyboard height tracking for input bar repositioning
  const keyboardOffset = useState(() => new Animated.Value(0))[0];

  // Custom Modal Forms
  const [activeModal, setActiveModal] = useState<'NONE' | 'LOCATION'>('NONE');
  const [locationForm, setLocationForm] = useState({ label: '', lat: '', lng: '' });
  const [locatingSelf, setLocatingSelf] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);

  // Dynamic Room Sync effect. selectedTripId can't be a pure derived value
  // here — it's also set directly by user actions elsewhere (picking a room
  // from a list) — this effect only keeps it aligned when selectedRoomId (or
  // the async-loaded inboxRooms/trips it's matched against) changes out from
  // under it.
  useEffect(() => {
    if (selectedRoomId) {
      const matchedRoom = inboxRooms.find((r) => r.id === selectedRoomId);
      if (matchedRoom) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSelectedTripId(matchedRoom.tripId);
      } else {
        const matchedTrip = trips.find((t) => t.chatRoomId === selectedRoomId || `room-${t.id}` === selectedRoomId);
        if (matchedTrip) {
          setSelectedTripId(matchedTrip.id);
        }
      }
    }
  }, [selectedRoomId, inboxRooms, trips]);

  // Dynamic trips synchronization into inboxRooms. inboxRooms is hydrated
  // from two other independent sources (loadInboxRooms' REST call and the
  // real-time socket-sync effect below), so it can't be recomputed as a pure
  // derived value of `trips` alone — this backfills any trip that doesn't
  // have a room yet without discarding what those other sources loaded.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInboxRooms((prevRooms) => {
      const missingTrips = trips.filter((t) => !prevRooms.some((r) => r.tripId === t.id));
      if (missingTrips.length === 0) return prevRooms;

      const newRooms: ChatRoom[] = missingTrips.map((t) => ({
        id: t.chatRoomId || `room-${t.id}`,
        tripId: t.id,
        name: t.name.includes('Chat') || t.name.includes('Group') ? t.name : `${t.name} Group Chat`,
        avatar: t.coverImage || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=150&q=80',
        type: 'GROUP',
        latestMessage: 'System: Welcome to the group chat! Start planning together.',
        latestTime: 'Just Now',
        unreadCount: 0,
        badge: 'Organizer Trip',
        lastMessageAt: new Date().toISOString(),
      }));

      return [...prevRooms, ...newRooms];
    });
  }, [trips]);

  // Input states
  const [inputText, setInputText] = useState('');
  // docs/REMEDIATION.md §8.7 — emits real 'typing' events instead of doing
  // nothing (the indicator the *other* side sees was a fake timer; this is
  // the half that actually tells them). Sends isTyping:true once per burst
  // of typing, then isTyping:false 2s after the user stops — not on every
  // keystroke, which would flood the socket.
  const typingStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingActiveRef = useRef(false);
  const handleInputChange = (text: string) => {
    setInputText(text);
    if (!isTypingActiveRef.current) {
      isTypingActiveRef.current = true;
      setTyping(true);
    }
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      isTypingActiveRef.current = false;
      setTyping(false);
    }, 2000);
  };
  const [replyingToMessage, setReplyingToMessage] = useState<CustomMessage | null>(null);
  const [selectedMessageForOptions, setSelectedMessageForOptions] = useState<CustomMessage | null>(null);
  const [selectedRoomForOptions, setSelectedRoomForOptions] = useState<ChatRoom | null>(null);
  const [pinnedRoomIds, setPinnedRoomIds] = useState<Set<string>>(new Set());
  const [translatedMsgs, setTranslatedMsgs] = useState<Set<string>>(new Set());

  // Typing simulator
  const [isTyping, setIsTyping] = useState(false);
  const [typerName, setTyperName] = useState('Neha');

  // SOS Countdown
  const [sosCountdown, setSosCountdown] = useState<number | null>(null);
  const countdownInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Scroll ref
  // FlatList, not ScrollView, since the message list was virtualized in
  // Phase 10. `scrollToEnd` exists on both, so scrollToBottom is unchanged.
  const messageListRef = useRef<FlatList<CustomMessage>>(null);

  // Auto scroll
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollToBottom = useCallback((animated = true) => {
    if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    scrollTimerRef.current = setTimeout(() => {
      messageListRef.current?.scrollToEnd({ animated });
    }, 40);
  }, []);

  // Fetch current active trip data
  // The real trip for the open room, or null. This used to fall back to a
  // hardcoded "Ranchi to Vrindavan" trip — invented cities, dates, meeting
  // point and a ₹8,500 budget — which every panel below then rendered as
  // this room's actual trip details (docs/REMEDIATION.md §0.2 rule 4).
  const activeTrip = trips.find((t) => t.id === selectedTripId) ?? null;

  // Real per-trip day itinerary (docs/REMEDIATION.md §9.3/§9.4 follow-up).
  // The "Vertical Itinerary Roadmap" below used to render a hardcoded
  // getTripItineraryHighlights() function — a full fake day-by-day plan for
  // the two seed trip ids, and (worse) the SAME fake Kerala itinerary for
  // every other real trip, regardless of its actual cities or dates. This
  // uses the same real, persisted itinerary endpoint group-organizer.tsx's
  // organizer view already reads and writes.
  const [chatItinerary, setChatItinerary] = useState<{ id: string; day: number; title: string; plan: string }[]>([]);
  const [chatItineraryLoading, setChatItineraryLoading] = useState(false);

  // Standard fetch-on-dependency-change effect: reset then load. The
  // synchronous setState below is the "clear stale data" half of a fetch
  // that completes asynchronously right after — not the pattern this lint
  // rule exists to catch.
  useEffect(() => {
    if (!selectedTripId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setChatItinerary([]);
      return;
    }
    setChatItineraryLoading(true);
    apiService
      .getTripItinerary(selectedTripId)
      .then((res) => setChatItinerary(res?.days ?? []))
      .catch((e) => {
        logger.warn('[Chat] Failed to load trip itinerary:', e);
        setChatItinerary([]);
      })
      .finally(() => setChatItineraryLoading(false));
  }, [selectedTripId]);

  // There is no trip -> guide relation on the client Trip type, so the
  // "Your Travel Guide" card that used to live in the settings panel was
  // removed rather than kept: it picked a guide by matching the old seed
  // trip ids and otherwise fell through to `guides[0]`, i.e. an arbitrary
  // guide with no connection to this trip, who was then also injected into
  // the room's member list labelled "Guide". The member list now comes only
  // from real ChatRoomMember rows (dbMembers).

  // Active global SOS check
  const activeSOS = sosAlerts.find((sos) => sos.status === 'ACTIVE');

  // Retrieve current active messages list (unified feed)
  const currentMessages = useMemo(
    () => tripMessages[selectedRoomId || selectedTripId] || [],
    [tripMessages, selectedRoomId, selectedTripId],
  );

  // Dynamically extract group members from message history in this room/trip
  const groupMembers = useMemo(() => {
    const membersMap = new Map<string, { name: string; avatar: string; role: string }>();

    // Add database/real-time members
    if (dbMembers && dbMembers.length > 0) {
      dbMembers.forEach((m) => {
        // Normalize role name
        let roleName = m.role || 'Tourist';
        if (roleName === 'TOURIST' || roleName === 'MEMBER') roleName = 'Tourist';
        if (roleName === 'ORGANIZER') roleName = 'Organizer';
        if (roleName === 'GUIDE') roleName = 'Guide';

        membersMap.set(m.name, {
          name: m.name,
          avatar: m.avatar,
          role: roleName,
        });
      });
    }

    // Add other senders from the current active messages
    currentMessages.forEach((msg) => {
      if (msg.senderName && !msg.isMe) {
        // Only add if not already present to avoid overriding database entries
        if (!membersMap.has(msg.senderName)) {
          membersMap.set(msg.senderName, {
            name: msg.senderName,
            avatar:
              msg.avatar ||
              'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
            role: msg.senderRole || 'Tourist',
          });
        }
      }
    });

    // Fallback static list of members if message history and database are empty
    if (membersMap.size <= 1) {
      const mockMembers = [
        {
          name: 'Neha Sharma',
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80',
          role: 'Tourist',
        },
        {
          name: 'Vikram Singh',
          avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
          role: 'Tourist',
        },
        {
          name: 'Suman Gupta',
          avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80',
          role: 'Tourist',
        },
        {
          name: 'Aditya Sen',
          avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
          role: 'Tourist',
        },
      ];
      mockMembers.forEach((m) => {
        {
          membersMap.set(m.name, m);
        }
      });
    }

    return Array.from(membersMap.values());
  }, [currentMessages, dbMembers]);

  // Click a member to direct message
  const handleMemberClick = (member: { name: string; avatar: string }) => {
    setIsSettingsOpen(false); // Close settings panel
    handleStartDirectMessage(member.name, member.avatar);
  };

  // Toggle Attachment panel Animation
  useEffect(() => {
    Animated.timing(attachPanelHeight, {
      toValue: isAttachmentOpen ? 1 : 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  }, [isAttachmentOpen, attachPanelHeight]);

  // Keyboard show/hide — lift input bar above keyboard
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvent, (e) => {
      const kbHeight = e.endCoordinates.height;
      Animated.timing(keyboardOffset, {
        toValue: kbHeight,
        duration: Platform.OS === 'ios' ? 250 : 150,
        useNativeDriver: false,
      }).start();
      scrollToBottom();
    });

    const onHide = Keyboard.addListener(hideEvent, () => {
      Animated.timing(keyboardOffset, {
        toValue: 0,
        duration: Platform.OS === 'ios' ? 200 : 100,
        useNativeDriver: false,
      }).start();
    });

    return () => {
      onShow.remove();
      onHide.remove();
    };
  }, [keyboardOffset, scrollToBottom]);

  // docs/REMEDIATION.md §8.7: this was a "Typing indicator simulation" (the
  // original code's own comment) — a fixed setTimeout that showed a
  // hardcoded name ('Aditya'/'Suman', not even a real member of the room)
  // "typing" on a schedule with no connection to whether anyone actually
  // was. Real typing events arrive via AppContext's socket subscription
  // (typingUser) and are filtered down here to whichever room is currently
  // open — see the TextInput's onChangeText below for the emitting side.
  useEffect(() => {
    if (!typingUser || typingUser.roomId !== (selectedRoomId || selectedTripId)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTyperName(typingUser.userName);
    setIsTyping(typingUser.isTyping);
  }, [typingUser, selectedTripId, selectedRoomId]);


  useEffect(() => {
    if (selectedRoomId) {
      scrollToBottom(true);
    }
  }, [selectedRoomId, tripMessages, scrollToBottom]);

  // Translate toggle
  const toggleTranslate = (id: string) => {
    setTranslatedMsgs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // Core send message handler
  const sendNewMessage = (msgData: Partial<CustomMessage>) => {
    const key = selectedRoomId || selectedTripId;
    const mediaType = msgData.type === 'image' ? 'IMAGE' : msgData.type === 'voice' ? 'VOICE' : 'NONE';

    // Call global websocket sender
    sendMessage(msgData.content || '', mediaType);

    const newMsg: CustomMessage = {
      id: `msg-${Date.now()}`,
      senderId: profile.id,
      senderName: profile.name,
      senderRole: profile.role === 'TOURIST' ? 'Tourist' : 'Organizer',
      avatar: profile.avatar,
      content: msgData.content || '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
      ...msgData,
    };

    // Update messages map
    setTripMessages((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), newMsg],
    }));

    // Update the WhatsApp Inbox snippet text dynamically and move room to index 0 (TOP)!
    setInboxRooms((prevRooms) => {
      const nowIso = new Date().toISOString();
      const existingRoom = prevRooms.find((r) => r.id === selectedRoomId);
      const otherRooms = prevRooms.filter((r) => r.id !== selectedRoomId);

      if (existingRoom) {
        const updatedRoom: ChatRoom = {
          ...existingRoom,
          latestMessage: `You: ${msgData.content || 'Attachment shared'}`,
          latestTime: newMsg.timestamp,
          unreadCount: 0,
          lastMessageAt: nowIso,
        };
        return [updatedRoom, ...otherRooms];
      }
      return prevRooms;
    });

    scrollToBottom();
  };

  // Submit keyboard text message
  // docs/REMEDIATION.md §8.7 — "Leave Group"/"Exit Group" used to only call
  // setInboxRooms((prev) => prev.filter(...)): a client-side-only list
  // hide, with the caller still a real ChatRoomMember row server-side, so
  // the "left" group reappeared the next time the inbox refetched. This
  // calls the real DELETE /chats/:id/members/me and only updates local
  // state once the server confirms it.
  const handleLeaveRoom = async (roomId: string) => {
    try {
      await apiService.leaveChatRoom(roomId);
      setInboxRooms((prev) => prev.filter((r) => r.id !== roomId));
    } catch (e) {
      logger.warn('[Chat] Leave room failed:', e);
      toast(errorToastMessage(e, 'Could not leave the group. Please try again.'), 'error');
    }
  };

  const handleSendText = () => {
    if (inputText.trim() === '') return;
    // Sending clears the composer, so there is nothing left to be "typing"
    // — stop immediately rather than waiting out the 2s debounce.
    if (typingStopTimerRef.current) clearTimeout(typingStopTimerRef.current);
    if (isTypingActiveRef.current) {
      isTypingActiveRef.current = false;
      setTyping(false);
    }
    const msgData: Partial<CustomMessage> = {
      content: inputText,
      type: 'text',
    };

    if (replyingToMessage) {
      msgData.replyTo = {
        id: replyingToMessage.id,
        senderName: replyingToMessage.senderName,
        content: replyingToMessage.content,
      };
      setReplyingToMessage(null);
    }

    sendNewMessage(msgData);
    setInputText('');
  };

  // Copy message text to device clipboard safely
  const handleCopyMessage = (content: string) => {
    try {
      // Synchronous require() so the catch block below can fall back
      // cleanly if this module isn't present in this RN build - an async
      // import() can't replicate that at the point of use here.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ClipboardObj = require('react-native').Clipboard;
      if (ClipboardObj && typeof ClipboardObj.setString === 'function') {
        ClipboardObj.setString(content);
      }
    } catch {
      // Fallback if Clipboard module is unlinked or not bundled in Expo client
    }
    toast('Message text copied to clipboard.', 'success');
    setSelectedMessageForOptions(null);
  };

  // Delete message from current active room history stream
  const handleDeleteMessage = (msgId: string) => {
    const key = selectedRoomId || selectedTripId;
    setTripMessages((prev) => {
      const list = prev[key] || [];
      return {
        ...prev,
        [key]: list.filter((m) => m.id !== msgId),
      };
    });
    setSelectedMessageForOptions(null);
  };

  // Start Direct Message with sender
  const handleStartDirectMessage = (senderName: string, avatar: string) => {
    const dmRoomId = `room-dm-${senderName.toLowerCase().replace(/\s+/g, '-')}`;

    // Check if DM room already exists in state
    const existingRoom = inboxRooms.find((r) => r.id === dmRoomId);
    if (existingRoom) {
      setSelectedRoomId(dmRoomId);
      setSelectedTripId(existingRoom.tripId);
    } else {
      // Create new private chat room
      const newRoom: ChatRoom = {
        id: dmRoomId,
        tripId: selectedTripId,
        name: senderName,
        avatar: avatar,
        type: 'GUIDE', // treat as GUIDE/DM in inbox rendering
        latestMessage: `Direct chat started with ${senderName}`,
        latestTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        unreadCount: 0,
        badge: 'Member',
        lastMessageAt: new Date().toISOString(),
      };

      setInboxRooms((prev) => [newRoom, ...prev]);

      // Initialize message history
      setTripMessages((prev) => ({
        ...prev,
        [dmRoomId]: [
          {
            id: `dm-init-${Date.now()}`,
            senderName: senderName,
            senderRole: 'Tourist',
            avatar: avatar,
            content: `This is the beginning of your private message thread with ${senderName}. 👋`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isMe: false,
          },
        ],
      }));

      setSelectedRoomId(dmRoomId);
    }
    setSelectedMessageForOptions(null);
  };

  // Vote in Poll
  const handlePollVote = (msgId: string, optionIndex: number) => {
    const key = selectedTripId;
    setTripMessages((prev) => {
      const currentList = prev[key] || [];
      const updatedList = currentList.map((msg) => {
        if (msg.id === msgId && msg.pollOptions) {
          const votedPrev = msg.pollVoted;
          const updatedOptions = msg.pollOptions.map((opt, idx) => {
            let delta = 0;
            if (idx === optionIndex) delta = 1;
            if (idx === votedPrev) delta = -1;
            return { ...opt, votes: Math.max(0, opt.votes + delta) };
          });
          return {
            ...msg,
            pollOptions: updatedOptions,
            pollVoted: votedPrev === optionIndex ? undefined : optionIndex,
          };
        }
        return msg;
      });
      return { ...prev, [key]: updatedList };
    });
  };

  // Submit Poll
  // Submit Location
  // Shares a place with the room. The coordinates must be real: this used to
  // fall back to `parseFloat(...) || 27.565 / 77.6593` — hardcoded Vrindavan
  // — whenever the fields were blank or unparseable, so "share your
  // location" silently sent everyone a pin in Uttar Pradesh regardless of
  // where the place actually was. Inventing geodata and presenting it as a
  // real place is the same fault §8.8 removed from the map.
  const handleShareLocationSubmit = () => {
    if (!locationForm.label.trim()) return;

    const lat = Number(locationForm.lat);
    const lng = Number(locationForm.lng);
    const valid =
      Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

    if (!valid) {
      toast('Enter a valid latitude and longitude, or use "Use my location".', 'error');
      return;
    }

    sendNewMessage({
      type: 'location',
      content: `📍 Location Shared: ${locationForm.label.trim()}`,
      locationCoords: { latitude: lat, longitude: lng },
    });
    setLocationForm({ label: '', lat: '', lng: '' });
    setActiveModal('NONE');
    setIsAttachmentOpen(false);
  };

  // Fills the coordinate fields from the device's real GPS, so the common
  // case ("I am here") does not require the user to type coordinates.
  const handleUseMyLocation = async () => {
    setLocatingSelf(true);
    try {
      const result = await getCurrentDeviceLocation();
      if (!result.ok) {
        toast(
          result.reason === 'PERMISSION_DENIED'
            ? 'Location permission is off, so we cannot read your position.'
            : 'Could not read your location right now.',
          'error',
        );
        return;
      }
      setLocationForm((p) => ({
        ...p,
        lat: String(result.latitude),
        lng: String(result.longitude),
        label: p.label || 'My current location',
      }));
    } finally {
      setLocatingSelf(false);
    }
  };

  // Voice note simulator
  // The "Voice Note" attachment was removed, not rebuilt
  // (docs/REMEDIATION.md §8.7). It recorded nothing: it sent a message whose
  // mediaUrl was the literal string 'simulated_voice_note.mp3' and whose
  // body read "Audio Recording...", so the recipient saw a voice message
  // that had never existed and could never play. Real voice notes need an
  // audio recording library (expo-audio), a duration/waveform, and the same
  // object-storage upload the photo path now uses — a feature, not a fix.

  // Sends a photo to the room. The picked asset's `uri` is a device-local
  // file://(/blob:/data: on web) path that resolves for nobody but the
  // sender, so this used to put a broken image in front of every other
  // member (docs/REMEDIATION.md §8.7 — the same bug §8.2/§8.4/§8.17 fixed
  // for avatars, trip covers and reels). The bytes now go straight to object
  // storage via a presigned URL and the message carries the public URL.
  //
  // No fake fallback: if storage is not configured the send fails visibly
  // rather than posting a link only the sender can open.
  const handleSendPhoto = async () => {
    setIsAttachmentOpen(false);
    try {
      if (!ImagePicker || typeof ImagePicker.requestMediaLibraryPermissionsAsync !== 'function') {
        await showAlert('Photos unavailable', 'The photo gallery module is still starting up. Try again shortly.');
        return;
      }
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult?.granted) {
        await showAlert('Permission required', 'Allow photo access to send a picture to this group.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      if (!asset) return;

      const contentType =
        asset.mimeType === 'image/png' || asset.mimeType === 'image/webp' ? asset.mimeType : 'image/jpeg';

      setPhotoUploading(true);
      const { uploadUrl, publicUrl } = await apiService.getChatMediaUploadUrl(contentType);
      await uploadFileToUrl(asset.uri, uploadUrl, contentType);

      sendNewMessage({
        content: '📷 Photo',
        type: 'image',
        mediaUrl: publicUrl,
      });
    } catch (err) {
      logger.warn('[Chat] Photo send failed:', err);
      toast(errorToastMessage(err, 'Could not send that photo. Please try again.'), 'error');
    } finally {
      setPhotoUploading(false);
    }
  };

  // SOS Countdown handles
  const startSOSCountdown = () => {
    setSosCountdown(3);
    countdownInterval.current = setInterval(() => {
      setSosCountdown((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          clearInterval(countdownInterval.current!);
          void triggerSOSEvent();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSOS = () => {
    if (countdownInterval.current) {
      clearInterval(countdownInterval.current);
    }
    setSosCountdown(null);
  };

  // Trigger SOS context logic. Uses the real device GPS position
  // (REMEDIATION.md §8.9) — never a guessed/hardcoded coordinate. If the
  // device can't produce a real fix, the alert is not sent with a wrong
  // location; the user is told to try again or call 112 directly instead.
  const triggerSOSEvent = async () => {
    const location = await getCurrentDeviceLocation();
    if (!location.ok) {
      const message =
        location.reason === 'PERMISSION_DENIED'
          ? 'Location permission is required to send an accurate SOS. Please enable it and try again, or call 112 directly.'
          : 'Could not get your current location. Please try again, or call 112 directly.';
      toast(message, 'error');
      return;
    }
    const { latitude: lat, longitude: lng } = location;

    triggerSOS(lat, lng);

    const sosMessage: CustomMessage = {
      id: `sos-gen-${Date.now()}`,
      type: 'sos',
      content: `🚨 SOS PANIC TRIGGERED by ${profile.name}! Needs immediate assistance.`,
      locationCoords: { latitude: lat, longitude: lng },
      resolved: false,
      senderId: profile.id,
      senderName: profile.name,
      senderRole: 'Tourist',
      avatar: profile.avatar,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isMe: true,
    };

    setTripMessages((prev) => {
      const key = selectedTripId;
      return {
        ...prev,
        [key]: [...(prev[key] || []), sosMessage],
      };
    });

    setInboxRooms((prevRooms) =>
      prevRooms.map((room) => {
        if (room.tripId === selectedTripId) {
          return {
            ...room,
            latestMessage: `🚨 SOS Alert Triggered!`,
            latestTime: 'Now',
            lastMessageAt: new Date().toISOString(),
          };
        }
        return room;
      }),
    );
  };

  const handleResolveSOSEvent = () => {
    if (activeSOS) {
      resolveSOS(activeSOS.id);
    }
  };

  const attachMenuHeight = attachPanelHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 120],
  });

  // Filtered and sorted rooms listing (pins at the top!)
  const filteredRooms = useMemo(() => {
    return inboxRooms
      .filter((room) => {
        const matchesSearch =
          room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          room.latestMessage.toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesSearch) return false;

        if (inboxFilter === 'ALL') return true;
        if (inboxFilter === 'GROUPS') return room.type === 'GROUP';
        if (inboxFilter === 'GUIDES') return room.type === 'GUIDE';

        return true;
      })
      .sort((a, b) => {
        const aPinned = pinnedRoomIds.has(a.id) ? 1 : 0;
        const bPinned = pinnedRoomIds.has(b.id) ? 1 : 0;
        if (aPinned !== bPinned) {
          return bPinned - aPinned;
        }
        const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bTime - aTime;
      });
  }, [inboxRooms, searchQuery, inboxFilter, pinnedRoomIds]);

  // Find Room info of the selected room
  let activeRoom = inboxRooms.find((r) => r.id === selectedRoomId);
  if (!activeRoom && selectedRoomId) {
    const matchedTrip = trips.find((t) => t.chatRoomId === selectedRoomId || `room-${t.id}` === selectedRoomId);
    if (matchedTrip) {
      activeRoom = {
        id: selectedRoomId,
        tripId: matchedTrip.id,
        name:
          matchedTrip.name.includes('Chat') || matchedTrip.name.includes('Group')
            ? matchedTrip.name
            : `${matchedTrip.name} Group Chat`,
        avatar: matchedTrip.coverImage || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=150&q=80',
        type: 'GROUP',
        latestMessage: 'System: Welcome to the group chat! Start planning together.',
        latestTime: 'Just Now',
        unreadCount: 0,
        badge: 'Member',
      };
    }
  }

  // --- SCREEN 1: WHATSAPP-STYLE INBOX LIST VIEW ---
  if (!selectedRoomId) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.inboxContainer}>
        {/* WhatsApp-Style Header */}
        <View style={styles.inboxHeader}>
          <Text style={styles.inboxHeaderTitle}>{t('chat.travelStarChats')}</Text>
          <View style={styles.inboxHeaderIcons}>
            <TouchableOpacity
              style={styles.headerIconTouch}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.contacts')}
            >
              <UsersIcon size={20} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconTouch}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.moreOptions')}
            >
              <MoreVertical size={20} color="#FFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search bar */}
        <View style={styles.searchBarWrapper}>
          <Input
            placeholder={t('chat.searchPlaceholder')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            icon={<Search size={16} color={C.textMuted} />}
          />
        </View>

        {/* Category filters */}
        <View style={styles.inboxFiltersRow}>
          {(
            [
              { key: 'ALL', labelKey: 'chat.filterAllChats' },
              { key: 'GROUPS', labelKey: 'chat.filterGroups' },
              { key: 'GUIDES', labelKey: 'chat.filterGuides' },
            ] as const
          ).map((filter) => {
            const isSelected = inboxFilter === filter.key;

            return (
              <TouchableOpacity
                key={filter.key}
                style={[styles.filterPill, isSelected && styles.filterPillSelected]}
                onPress={() => setInboxFilter(filter.key)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t(filter.labelKey)}
                accessibilityState={{ selected: isSelected }}
              >
                <Text style={[styles.filterPillText, isSelected && styles.filterPillTextSelected]}>{t(filter.labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* SOS Pulse Alerter if active globally. docs/REMEDIATION.md
        §9.3/§9.4 follow-up: this used to hardcode navigation into the fake
        Vrindavan seed room regardless of which real trip the alert
        actually belonged to — the real SOSAlert model (AppContext.tsx)
        carries no trip/room association at all, so there was never a real
        room to "join" here. Routes to the real map/locate flow instead,
        the same honest action the in-room SOS banner's "Locate" button
        already uses below. */}
        {activeSOS && (
          <TouchableOpacity
            style={styles.safetyTickerBanner}
            onPress={() => router.navigate('/map')}
            accessibilityRole="button"
            accessibilityLabel={t('chat.sosLocateHint', { name: activeSOS.userName })}
          >
            <AlertTriangle size={15} color="#FFF" style={styles.sosFlash} />
            <Text style={styles.safetyTickerText} numberOfLines={1}>
              {t('chat.sosLocateHint', { name: activeSOS.userName })}
            </Text>
          </TouchableOpacity>
        )}

        {/* Inbox Rooms Scroll List */}
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 110 }}
          scrollEventThrottle={16}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            const diff = y - lastScrollYRef.current;

            if (y <= 15) {
              if (navbarHiddenRef.current) {
                navbarHiddenRef.current = false;
                eventBus.emit('toggleNavbar', false);
              }
              lastScrollYRef.current = y;
              return;
            }

            if (diff > 0.01 && !navbarHiddenRef.current) {
              navbarHiddenRef.current = true;
              eventBus.emit('toggleNavbar', true);
            } else if (diff < -0.01 && navbarHiddenRef.current) {
              navbarHiddenRef.current = false;
              eventBus.emit('toggleNavbar', false);
            }

            lastScrollYRef.current = y;
          }}
        >
          {filteredRooms.map((room) => {
            const hasUnread = room.unreadCount > 0;

            return (
              <TouchableOpacity
                key={room.id}
                style={styles.roomItemTouch}
                onPress={() => {
                  setSelectedRoomId(room.id);
                  setSelectedTripId(room.tripId);
                }}
                onLongPress={() => setSelectedRoomForOptions(room)}
                delayLongPress={400}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={room.name}
                accessibilityHint={room.latestMessage}
              >
                {/* Avatar left */}
                <View style={styles.roomAvatarWrap}>
                  <Image source={{ uri: room.avatar }} style={styles.roomAvatarImg} />
                </View>

                {/* Info Center */}
                <View style={styles.roomMetaWrap}>
                  <View style={styles.roomNameRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                      <Text style={[styles.roomNameText, { flex: 1, marginRight: 4 }]} numberOfLines={1}>
                        {room.name}
                      </Text>
                      {pinnedRoomIds.has(room.id) && <Pin size={12} color={C.blueGlow} />}
                    </View>
                    <Text style={[styles.roomTimeText, hasUnread && { color: C.blueGlow }]}>{room.latestTime}</Text>
                  </View>

                  <View style={styles.roomSnippetRow}>
                    <Text
                      style={[styles.roomSnippetText, hasUnread && { color: '#FFF', fontWeight: '500' }]}
                      numberOfLines={1}
                    >
                      {room.latestMessage}
                    </Text>
                    <View style={styles.roomBadgeWrap}>
                      {room.badge && (
                        <View style={[styles.inboxTag, room.type === 'GUIDE' ? styles.tagPurple : styles.tagBlue]}>
                          <Text style={styles.inboxTagText}>{room.badge}</Text>
                        </View>
                      )}
                      {hasUnread && (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{room.unreadCount}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ─── CHAT ROOM LONG PRESS OPTIONS OVERLAY ─────────────── */}
        {selectedRoomForOptions && (
          <View style={styles.optionsModalOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setSelectedRoomForOptions(null)}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            />
            <View style={styles.optionsModalContent}>
              <View style={styles.optionsHeaderRow}>
                <Text style={styles.optionsHeaderTitle} numberOfLines={1}>
                  {t('chat.roomOptionsTitle', { name: selectedRoomForOptions.name })}
                </Text>
                <Text style={styles.optionsHeaderSubText} numberOfLines={1}>
                  {selectedRoomForOptions.type === 'GROUP' ? t('chat.groupChat') : t('chat.directMessage')} •{' '}
                  {selectedRoomForOptions.badge || t('chat.contact')}
                </Text>
              </View>

              <View style={styles.optionsDivider} />

              {/* PIN / UNPIN CHAT */}
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => {
                  const roomId = selectedRoomForOptions.id;
                  setPinnedRoomIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(roomId)) {
                      next.delete(roomId);
                    } else {
                      next.add(roomId);
                    }
                    return next;
                  });
                  setSelectedRoomForOptions(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={pinnedRoomIds.has(selectedRoomForOptions.id) ? t('chat.unpinChat') : t('chat.pinChatToTop')}
              >
                <Pin size={16} color="#94A3B8" style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>
                  {pinnedRoomIds.has(selectedRoomForOptions.id) ? t('chat.unpinChat') : t('chat.pinChatToTop')}
                </Text>
              </TouchableOpacity>

              {/* MARK AS READ / UNREAD */}
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => {
                  const roomId = selectedRoomForOptions.id;
                  setInboxRooms((prev) =>
                    prev.map((r) => {
                      if (r.id === roomId) {
                        return { ...r, unreadCount: r.unreadCount > 0 ? 0 : 3 };
                      }
                      return r;
                    }),
                  );
                  setSelectedRoomForOptions(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={selectedRoomForOptions.unreadCount > 0 ? t('chat.markAsRead') : t('chat.markAsUnread')}
              >
                <CheckCircle size={16} color="#94A3B8" style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>
                  {selectedRoomForOptions.unreadCount > 0 ? t('chat.markAsRead') : t('chat.markAsUnread')}
                </Text>
              </TouchableOpacity>

              {/* CLEAR CHAT HISTORY */}
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => {
                  const roomId = selectedRoomForOptions.id;
                  void (async () => {
                    const ok = await confirm({
                      title: t('chat.clearChatTitle'),
                      message: t('chat.clearChatMessage'),
                      confirmLabel: t('chat.clear'),
                      destructive: true,
                    });
                    if (ok) {
                          setTripMessages((prev) => ({
                            ...prev,
                            [roomId]: [],
                          }));
                          // Reset the room's latest message snippet
                          setInboxRooms((prev) =>
                            prev.map((r) => {
                              if (r.id === roomId) {
                                return { ...r, latestMessage: t('chat.noMessagesInChat') };
                              }
                              return r;
                            }),
                          );
                    }
                  })();
                  setSelectedRoomForOptions(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('chat.clearConversation')}
              >
                <Trash2 size={16} color="#EF4444" style={styles.optionsRowIcon} />
                <Text style={[styles.optionsRowText, { color: '#EF4444' }]}>{t('chat.clearConversation')}</Text>
              </TouchableOpacity>

              {/* LEAVE GROUP / DELETE CHAT */}
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => {
                  const roomId = selectedRoomForOptions.id;
                  const roomName = selectedRoomForOptions.name;
                  const isGroup = selectedRoomForOptions.type === 'GROUP';
                  void (async () => {
                    const ok = await confirm({
                      title: isGroup ? t('chat.leaveGroupTitle') : t('chat.deleteChatTitle'),
                      message: isGroup
                        ? t('chat.leaveGroupMessage', { name: roomName })
                        : t('chat.deleteChatMessage', { name: roomName }),
                      confirmLabel: isGroup ? t('chat.leave') : t('chat.delete'),
                      destructive: true,
                    });
                    if (ok) await handleLeaveRoom(roomId);
                  })();
                  setSelectedRoomForOptions(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={selectedRoomForOptions.type === 'GROUP' ? t('chat.leaveGroupTitle') : t('chat.deleteChatTitle')}
              >
                <X size={16} color="#EF4444" style={styles.optionsRowIcon} />
                <Text style={[styles.optionsRowText, { color: '#EF4444' }]}>
                  {selectedRoomForOptions.type === 'GROUP' ? t('chat.leaveGroupTitle') : t('chat.deleteChatTitle')}
                </Text>
              </TouchableOpacity>

              <View style={styles.optionsCancelDivider} />

              <TouchableOpacity
                style={styles.optionsCancelBtn}
                onPress={() => setSelectedRoomForOptions(null)}
                accessibilityRole="button"
                accessibilityLabel={t('common.cancel')}
              >
                <Text style={styles.optionsCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // --- SCREEN 2: CLEAN CONVERSATION DETAIL VIEW ---
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      {/* ─── CLEAN ROOM HEADER BAR ───────────────────────────── */}
      <View style={styles.roomHeaderBar}>
        <View style={styles.headerLeftMeta}>
          <TouchableOpacity
            style={styles.backBtnTouch}
            onPress={() => {
              setSelectedRoomId(null);
              setIsSettingsOpen(false);
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={t('chat.goBack')}
          >
            <ArrowLeft size={20} color="#FFF" />
          </TouchableOpacity>

          <Image source={{ uri: activeRoom?.avatar }} style={styles.roomHeaderAvatar} />

          <TouchableOpacity
            style={styles.roomHeaderTitles}
            onPress={() => setIsSettingsOpen(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={t('chat.openRoomSettings')}
          >
            <Text style={styles.roomHeaderNameText} numberOfLines={1}>
              {activeRoom?.name}
            </Text>
            <View style={styles.activityStatusRow}>
              <View style={styles.statusGreenDot} />
              <Text style={styles.roomHeaderStatusText}>
                {activeTrip ? t('chat.activeGroupLedgerWithMembers', { count: activeTrip.membersCount }) : t('chat.activeGroupLedger')}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.actionRoundBtn}
            onPress={() => router.navigate('/map')}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('chat.openMap')}
          >
            <MapPin size={17} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionRoundBtn}
            onPress={() => setIsSettingsOpen(true)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('chat.openRoomSettings')}
          >
            <Settings size={17} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ─── TAB SELECTION BAR ───────────────────────────────── */}
      {activeRoom?.type === 'GROUP' && (
        <View style={styles.tabBarWrapper}>
          <TouchableOpacity
            style={[styles.tabItemTouch, activeTab === 'chat' && styles.tabItemTouchActive]}
            onPress={() => setActiveTab('chat')}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityLabel={t('chat.tabChat')}
            accessibilityState={{ selected: activeTab === 'chat' }}
          >
            <MessageSquare size={17} color={activeTab === 'chat' ? '#C084FC' : '#7E8494'} />
            <Text style={[styles.tabItemLabel, activeTab === 'chat' && styles.tabItemLabelActive]}>{t('chat.tabChat')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItemTouch, activeTab === 'itinerary' && styles.tabItemTouchActive]}
            onPress={() => setActiveTab('itinerary')}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityLabel={t('chat.tabItinerary')}
            accessibilityState={{ selected: activeTab === 'itinerary' }}
          >
            <Calendar size={17} color={activeTab === 'itinerary' ? '#C084FC' : '#7E8494'} />
            <Text style={[styles.tabItemLabel, activeTab === 'itinerary' && styles.tabItemLabelActive]}>{t('chat.tabItinerary')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItemTouch, activeTab === 'members' && styles.tabItemTouchActive]}
            onPress={() => setActiveTab('members')}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityLabel={t('chat.tabMembers')}
            accessibilityState={{ selected: activeTab === 'members' }}
          >
            <UsersIcon size={17} color={activeTab === 'members' ? '#C084FC' : '#7E8494'} />
            <Text style={[styles.tabItemLabel, activeTab === 'members' && styles.tabItemLabelActive]}>{t('chat.tabMembers')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── SOS ACTIVE BANNER ─────────────────────────────────── */}
      {activeSOS && (
        <LinearGradient
          colors={['#7A0010', '#D32F2F']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.sosAlertBanner}
        >
          <View style={styles.sosBannerLeft}>
            <AlertTriangle size={18} color="#FFF" style={styles.sosPulse} />
            <Text style={styles.sosBannerText}>{t('chat.sosAlertNeedsHelp', { name: activeSOS.userName })}</Text>
          </View>
          <View style={styles.sosBannerRight}>
            <TouchableOpacity
              style={styles.sosBannerActionBtn}
              onPress={() => router.navigate('/map')}
              accessibilityRole="button"
              accessibilityLabel={t('chat.showOnMap')}
            >
              <Text style={styles.sosBannerBtnText}>{t('chat.locate')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sosBannerActionBtn, { backgroundColor: '#FFF' }]}
              onPress={handleResolveSOSEvent}
              accessibilityRole="button"
              accessibilityLabel={t('chat.markAsSafe')}
            >
              <Text style={[styles.sosBannerBtnText, { color: '#D32F2F' }]}>{t('chat.safe')}</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      )}

      {/* ─── WORKSPACE CONTENT AREA (CLEAN CONVERSATION FEED OR TABS) ───── */}
      {activeTab === 'chat' ? (
        <View style={{ flex: 1 }}>
          {/* docs/REMEDIATION.md §9.3/§9.4 follow-up: a "Pinned Group Update"
          banner used to live here — fully fabricated content (a fixed
          Leh-Ladakh acclimatization notice for `selectedTripId === 'trip-2'`,
          a generic placeholder otherwise) with no backing model, endpoint,
          or real pinned-message concept anywhere in this codebase. Removed
          rather than kept faked, per the same §0.2 rule 4 call already
          applied to this file's polls/expense-ledger/documents-vault
          (see the comments near INITIAL_TRIP_MESSAGES and the Docs tab). */}

          <FlatList
            ref={messageListRef}
            data={currentMessages}
            keyExtractor={messageKeyExtractor}
            renderItem={({ item, index }) => (
              <MessageBubble
                msg={item}
                previousSenderName={index > 0 ? currentMessages[index - 1].senderName : null}
                isTranslated={translatedMsgs.has(item.id)}
                onReply={setReplyingToMessage}
                onShowOptions={setSelectedMessageForOptions}
                onToggleTranslate={toggleTranslate}
                onPollVote={handlePollVote}
                onOpenMap={() => router.navigate('/map')}
                canResolveSOS={profile.role === 'ORGANIZER' || profile.role === 'GUIDE'}
                onResolveSOS={handleResolveSOSEvent}
              />
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            onContentSizeChange={() => scrollToBottom(false)}
            initialNumToRender={15}
            maxToRenderPerBatch={12}
            windowSize={11}
            removeClippedSubviews
            ListFooterComponent={
              <>
                {isTyping && (
                  <View style={styles.typingIndicatorRow}>
                    <View style={styles.typingDotWrap}>
                      <Text style={styles.typingText}>{t('chat.isTyping', { name: typerName })}</Text>
                      <ActivityIndicator size="small" color={C.textSec} style={{ marginLeft: 6 }} />
                    </View>
                  </View>
                )}

                {/* Scroll spacer dynamically adjusts with keyboard height to keep latest messages just above the input box */}
                <Animated.View style={{ height: Animated.add(selectedRoomId ? 110 : 170, keyboardOffset) }} />
              </>
            }
          />

          {/* Floating Attachments Drawer */}
          <Animated.View
            style={[
              styles.attachmentPanel,
              {
                height: attachMenuHeight,
                bottom: Animated.add(selectedRoomId ? Math.max(insets.bottom + 58, 74) : 140, keyboardOffset),
                borderWidth: isAttachmentOpen ? 1 : 0,
              },
            ]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.attachScrollInner}
            >
              {/* "Create Poll" and "Split Expense" removed here — polls had
                  no backend at all, and the expense form wrote to a
                  local-only ledger that contradicted the real one
                  (docs/REMEDIATION.md §8.7). The expense tracker is reachable
                  from this room's settings panel. */}

              <TouchableOpacity
                style={styles.attachBtn}
                onPress={() => setActiveModal('LOCATION')}
                accessibilityRole="button"
                accessibilityLabel={t('chat.sharePlace')}
              >
                <LinearGradient colors={['#64B5F6', '#2196F3']} style={styles.attachIconCircle}>
                  <MapPin size={18} color="#FFF" />
                </LinearGradient>
                <Text style={styles.attachLabel}>{t('chat.sharePlace')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.attachBtn}
                onPress={handleSendPhoto}
                disabled={photoUploading}
                accessibilityRole="button"
                accessibilityLabel={photoUploading ? t('chat.sendingPhoto') : t('chat.sendPhotoHint')}
                accessibilityState={{ disabled: photoUploading, busy: photoUploading }}
              >
                <LinearGradient colors={['#4DB6AC', '#009688']} style={styles.attachIconCircle}>
                  {photoUploading ? <ActivityIndicator size="small" color="#FFF" /> : <ImageIcon size={18} color="#FFF" />}
                </LinearGradient>
                <Text style={styles.attachLabel}>{photoUploading ? t('chat.sendingEllipsis') : t('chat.sendPhoto')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </Animated.View>

          {/* BOTTOM MESSAGE INPUT BAR — lifts with keyboard, dynamically positioned when tab bar is hidden, respecting system bottom inset */}
          <Animated.View
            style={[
              styles.bottomInputBarDetail,
              {
                bottom: keyboardOffset,
                paddingBottom: insets.bottom > 0 ? insets.bottom + 12 : 20,
              },
            ]}
          >
            {replyingToMessage && (
              <View style={styles.replyPreviewContainer}>
                <View style={styles.replyPreviewTextCol}>
                  <Text style={styles.replyPreviewSenderName}>
                    {replyingToMessage.isMe
                      ? t('chat.replyingToYourself')
                      : t('chat.replyingToName', { name: replyingToMessage.senderName })}
                  </Text>
                  <Text style={styles.replyPreviewContentText} numberOfLines={1}>
                    {replyingToMessage.content}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.replyPreviewCloseBtn}
                  onPress={() => setReplyingToMessage(null)}
                  hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.cancelReply')}
                >
                  <X size={14} color={C.textSec} />
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.inputRowContainer}>
              <TouchableOpacity
                style={[styles.plusCircle, isAttachmentOpen && styles.plusCircleOpen]}
                onPress={() => setIsAttachmentOpen(!isAttachmentOpen)}
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                accessibilityRole="button"
                accessibilityLabel={t('chat.attachmentOptions')}
                accessibilityState={{ expanded: isAttachmentOpen }}
              >
                <Plus size={18} color="#FFF" style={{ transform: [{ rotate: isAttachmentOpen ? '45deg' : '0deg' }] }} />
              </TouchableOpacity>

              <View style={styles.textInputWrapper}>
                <TextInput
                  placeholder={t('chat.messagePlaceholder')}
                  placeholderTextColor={C.textMuted}
                  style={styles.textInput}
                  value={inputText}
                  onChangeText={handleInputChange}
                  onSubmitEditing={handleSendText}
                  accessibilityLabel={t('chat.messagePlaceholder')}
                />
                <TouchableOpacity
                  style={styles.smileIcon}
                  hitSlop={{ top: 11, bottom: 11, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.emojiPicker')}
                >
                  <Smile size={18} color={C.textSec} />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  styles.sendIconCircle,
                  { backgroundColor: inputText.trim() === '' ? 'rgba(255, 255, 255, 0.08)' : C.blue },
                ]}
                onPress={handleSendText}
                disabled={inputText.trim() === ''}
                hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
                accessibilityRole="button"
                accessibilityLabel={t('chat.sendMessage')}
                accessibilityState={{ disabled: inputText.trim() === '' }}
              >
                <Send size={15} color={inputText.trim() === '' ? C.textMuted : '#FFF'} />
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      ) : activeTab === 'itinerary' ? (
        <ScrollView
          style={styles.tabScrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollViewContent}
        >
          {/* Summary / Stats Card */}
          <LinearGradient
            colors={['#181236', '#0F0D22']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.statsSummaryCard}
          >
            <View style={styles.statsHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Compass size={16} color="#C084FC" />
                <Text style={styles.statsTitle}>{t('chat.tripCommandCenter')}</Text>
              </View>
              <View style={styles.statsStatusBadge}>
                <Text style={styles.statsStatusText}>{t('chat.active')}</Text>
              </View>
            </View>

            {activeTrip ? (
              <View style={styles.statsGrid}>
                <View style={styles.statsCell}>
                  <Text style={styles.statsValLabel}>{t('chat.seatsLeft')}</Text>
                  <Text style={styles.statsValText}>{activeTrip.availableSeats}</Text>
                </View>
                <View style={styles.statsCell}>
                  <Text style={styles.statsValLabel}>{t('chat.budgetPerPerson')}</Text>
                  <Text style={[styles.statsValText, { color: C.greenText }]}>{formatINR(activeTrip.budget)}</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.statsFooter}>
              <Clock size={12} color="#C084FC" style={{ marginRight: 6 }} />
              <Text style={styles.statsFooterText}>
                {t('chat.assemblyPoint', { place: activeTrip?.meetingPoint ?? t('chat.notSet') })}
              </Text>
            </View>
          </LinearGradient>

          {/* Vertical Roadmap Timeline */}
          <View style={styles.timelineCard}>
            <View style={styles.timelineHeader}>
              <MapPin size={16} color="#0066FF" style={{ marginRight: 6 }} />
              <Text style={styles.timelineTitleText}>{t('chat.verticalItineraryRoadmap')}</Text>
            </View>

            <View style={styles.timelineList}>
              {chatItineraryLoading ? (
                <ActivityIndicator color={C.blueGlow} />
              ) : chatItinerary.length === 0 ? (
                <Text style={styles.verticalTimelineDesc}>{t('chat.noItineraryYet')}</Text>
              ) : (
                chatItinerary.map((day, idx) => {
                  const isLast = idx === chatItinerary.length - 1;
                  return (
                    <View key={day.id} style={styles.verticalTimelineStep}>
                      <View style={styles.verticalTimelineLeft}>
                        <View style={styles.verticalTimelineDot}>
                          <View style={styles.verticalTimelineInnerDot} />
                        </View>
                        {!isLast && <View style={styles.verticalTimelineLine} />}
                      </View>
                      <View style={styles.verticalTimelineCard}>
                        <View style={styles.verticalTimelineHeaderRow}>
                          <Text style={styles.verticalTimelineDayText}>{t('chat.dayNumber', { number: day.day })}</Text>
                          <Text style={styles.verticalTimelineNodeTitle}>{day.title}</Text>
                        </View>
                        <Text style={styles.verticalTimelineDesc}>{day.plan}</Text>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          style={styles.tabScrollView}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.tabScrollViewContent}
        >
          {/* The "Docs" tab and its Trip Documents Vault were removed, not
              rebuilt (docs/REMEDIATION.md §8.7 / §0.2 rule 4). Nothing about
              the vault was real: it was seeded with hardcoded documents keyed
              by the old seed trip ids — including a fabricated IRCTC PNR
              number — it had no file picker, no object storage and no backend
              model, and "uploading" was a setInterval that advanced a
              progress bar to 100% before adding a local row with status
              'Approved' and toasting "Document uploaded and verified
              successfully". Nothing was uploaded and nothing was verified.
              group-organizer.tsx's identical documents list (three fake
              filenames, no storage) was already removed for the same reason
              in the §8.6 follow-up; this is that call applied consistently.
              A real version is the §8.2/§8.4/§8.7 upload pipeline plus a
              TripDocument model, which is a feature rather than a fix. */}

          {/* Members Title Info */}
          <View style={styles.docsHeaderBlock}>
            <Text style={styles.docsHeaderTitleText}>{t('chat.groupDirectory')}</Text>
            <Text style={styles.docsHeaderDescText}>{t('chat.groupDirectoryDesc')}</Text>
          </View>

          {/* Members List Container */}
          <View style={styles.membersTabList}>
            {groupMembers.map((member) => (
              <TouchableOpacity
                key={member.name}
                style={styles.memberTabCard}
                onPress={() => handleMemberClick(member)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('chat.startPrivateChatWith', { name: member.name })}
              >
                <View style={styles.memberTabCardLeft}>
                  <Image source={{ uri: member.avatar }} style={styles.memberTabAvatar} />
                  <View style={styles.memberTabMeta}>
                    <Text style={styles.memberTabNameText}>{member.name}</Text>
                    <Text style={styles.memberTabRoleText}>
                      {SENDER_ROLE_LABEL_KEYS[member.role] ? t(SENDER_ROLE_LABEL_KEYS[member.role]) : member.role}
                    </Text>
                  </View>
                </View>

                <View style={styles.memberTabCardRight}>
                  <View
                    style={[
                      styles.memberRoleBadge,
                      member.role === 'Organizer'
                        ? styles.roleBadgeOrganizer
                        : member.role === 'Guide'
                          ? styles.roleBadgeGuide
                          : styles.roleBadgeTourist,
                    ]}
                  >
                    <Text
                      style={[
                        styles.memberRoleBadgeText,
                        member.role === 'Organizer'
                          ? { color: '#0066FF' }
                          : member.role === 'Guide'
                            ? { color: '#10B981' }
                            : { color: '#94A3B8' },
                      ]}
                    >
                      {(SENDER_ROLE_LABEL_KEYS[member.role] ? t(SENDER_ROLE_LABEL_KEYS[member.role]) : member.role).toUpperCase()}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.dmMemberBtn}
                    onPress={() => handleMemberClick(member)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 9, bottom: 9, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('chat.directMessageName', { name: member.name })}
                  >
                    <MessageSquare size={12} color="#FFF" style={{ marginRight: 3 }} />
                    <Text style={styles.dmMemberBtnText}>{t('chat.dm')}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      {/* ─── MESSAGE LONG PRESS OPTIONS OVERLAY ────────────────── */}
      {selectedMessageForOptions && (
        <View style={styles.optionsModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setSelectedMessageForOptions(null)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <View style={styles.optionsModalContent}>
            <View style={styles.optionsHeaderRow}>
              <Text style={styles.optionsHeaderTitle} numberOfLines={1}>
                {t('chat.messageOptions')}
              </Text>
              <Text style={styles.optionsHeaderSubText} numberOfLines={1}>
                &ldquo;{selectedMessageForOptions.content}&rdquo;
              </Text>
            </View>

            <View style={styles.optionsDivider} />

            {/* REPLY OPTION */}
            <TouchableOpacity
              style={styles.optionsRowBtn}
              onPress={() => {
                setReplyingToMessage(selectedMessageForOptions);
                setSelectedMessageForOptions(null);
              }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.replyToMessage')}
            >
              <CornerUpLeft size={16} color="#94A3B8" style={styles.optionsRowIcon} />
              <Text style={styles.optionsRowText}>{t('chat.replyToMessage')}</Text>
            </TouchableOpacity>

            {/* COPY OPTION */}
            <TouchableOpacity
              style={styles.optionsRowBtn}
              onPress={() => handleCopyMessage(selectedMessageForOptions.content)}
              accessibilityRole="button"
              accessibilityLabel={t('chat.copyText')}
            >
              <Copy size={16} color="#94A3B8" style={styles.optionsRowIcon} />
              <Text style={styles.optionsRowText}>{t('chat.copyText')}</Text>
            </TouchableOpacity>

            {/* TRANSLATE OPTION */}
            {selectedMessageForOptions.translations?.hindi && (
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => {
                  toggleTranslate(selectedMessageForOptions.id);
                  setSelectedMessageForOptions(null);
                }}
                accessibilityRole="button"
                accessibilityLabel={t('chat.translateMessage')}
              >
                <TranslateIcon size={16} color="#94A3B8" style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>{t('chat.translateMessage')}</Text>
              </TouchableOpacity>
            )}

            {/* DIRECT MESSAGE OPTION */}
            {!selectedMessageForOptions.isMe && activeRoom?.type === 'GROUP' && (
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() =>
                  handleStartDirectMessage(selectedMessageForOptions.senderName, selectedMessageForOptions.avatar)
                }
                accessibilityRole="button"
                accessibilityLabel={t('chat.directMessageName', { name: selectedMessageForOptions.senderName })}
              >
                <MessageSquare size={16} color="#94A3B8" style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>
                  {t('chat.directMessageName', { name: selectedMessageForOptions.senderName })}
                </Text>
              </TouchableOpacity>
            )}

            {/* DELETE OPTION */}
            {selectedMessageForOptions.isMe && (
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => handleDeleteMessage(selectedMessageForOptions.id)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.deleteMessage')}
              >
                <X size={16} color="#EF4444" style={styles.optionsRowIcon} />
                <Text style={[styles.optionsRowText, { color: '#EF4444' }]}>{t('chat.deleteMessage')}</Text>
              </TouchableOpacity>
            )}

            <View style={styles.optionsCancelDivider} />

            <TouchableOpacity
              style={styles.optionsCancelBtn}
              onPress={() => setSelectedMessageForOptions(null)}
              accessibilityRole="button"
              accessibilityLabel={t('common.cancel')}
            >
              <Text style={styles.optionsCancelText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── GROUP INFO & OPTIONS SETTINGS OVERLAY ───────────── */}
      {isSettingsOpen && (
        <View style={styles.settingsOverlay}>
          <SafeAreaView style={{ flex: 1 }}>
            {/* Floating Close Button */}
            <TouchableOpacity
              onPress={() => setIsSettingsOpen(false)}
              style={styles.settingsAbsoluteCloseBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.closeSettings')}
            >
              <ArrowLeft size={20} color="#FFF" />
            </TouchableOpacity>

            <ScrollView contentContainerStyle={styles.settingsScrollContent} showsVerticalScrollIndicator={false}>
              {/* Group Meta Display */}
              <View style={styles.settingsAvatarBlock}>
                <Image source={{ uri: activeRoom?.avatar }} style={styles.settingsAvatarImg} />
                <Text style={styles.settingsRoomName}>{activeRoom?.name}</Text>
                {activeTrip ? (
                  <Text style={styles.settingsTripDates}>
                    {formatDateRange(activeTrip.startDate, activeTrip.endDate)}
                  </Text>
                ) : null}
              </View>

              {/* ADVANCED TELEMETRY MONITOR CARD */}
              <TouchableOpacity
                onPress={() => setIsTripDetailsExpanded((prev) => !prev)}
                activeOpacity={0.85}
                style={{ marginBottom: 16 }}
                accessibilityRole="button"
                accessibilityLabel={
                  isTripDetailsExpanded ? t('chat.tapToCollapseSettings') : t('chat.tapToExpandSettings')
                }
                accessibilityState={{ expanded: isTripDetailsExpanded }}
              >
                <LinearGradient
                  colors={['#2E1065', '#120D26']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.telemetryCardGradient}
                >
                  <View style={styles.telemetryHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Compass size={15} color="#C084FC" />
                      <Text style={[styles.telemetryTitle, { color: '#E9D5FF' }]}>{t('chat.tripCommandCenter')}</Text>
                    </View>
                    <View
                      style={[
                        styles.telemetryStatusBadge,
                        { backgroundColor: 'rgba(192, 132, 252, 0.15)', borderColor: 'rgba(192, 132, 252, 0.3)' },
                      ]}
                    >
                      <Text style={[styles.telemetryStatusText, { color: '#F3E8FF' }]}>{t('chat.activeRun')}</Text>
                    </View>
                  </View>

                  <Text style={styles.telemetryLabel}>{t('chat.itinerarySyncProgress')}</Text>
                  <View style={styles.progressBarBg}>
                    <LinearGradient
                      colors={['#0066FF', '#8B5CF6']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={[styles.progressBarFill, { width: '45%' }]}
                    />
                  </View>

                  <View style={styles.telemetryMetaGrid}>
                    <View style={styles.telemetryMetaCell}>
                      <Text style={styles.telemetryMetaVal}>{activeTrip?.cities[1] ?? '—'}</Text>
                      <Text style={styles.telemetryMetaLbl}>{t('chat.lastNode')}</Text>
                    </View>
                    <View style={[styles.telemetryMetaCell, { alignItems: 'flex-end' }]}>
                      <Text style={styles.telemetryMetaVal}>
                        {activeTrip?.cities[activeTrip.cities.length - 1] ?? '—'}
                      </Text>
                      <Text style={styles.telemetryMetaLbl}>{t('chat.targetNode')}</Text>
                    </View>
                  </View>

                  <View style={styles.telemetryDivider} />

                  <View style={styles.telemetryFooter}>
                    <Text style={[styles.telemetryFooterText, { color: '#C084FC' }]}>
                      {isTripDetailsExpanded ? t('chat.tapToCollapseSettings') : t('chat.tapToExpandSettings')}
                    </Text>
                    {isTripDetailsExpanded ? (
                      <ChevronUp size={14} color="#C084FC" />
                    ) : (
                      <ChevronDown size={14} color="#C084FC" />
                    )}
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              {isTripDetailsExpanded && (
                <>
                  {/* 1. Trip Progress Timeline */}
                  <View style={styles.settingSectionCard}>
                    <View style={styles.sectionHeader}>
                      <MapPin size={16} color="#0066FF" style={{ marginRight: 6 }} />
                      <Text style={styles.sectionHeaderTitle}>{t('chat.itineraryTimeline')}</Text>
                    </View>
                    <View style={styles.timelineRow}>
                      {(activeTrip?.cities ?? []).map((city, idx) => {
                        const isLast = idx === (activeTrip?.cities.length ?? 0) - 1;
                        const isPassed = idx <= 1;
                        return (
                          <View key={city} style={styles.timelineStepWrap}>
                            <View style={styles.timelineDotContainer}>
                              <View
                                style={[
                                  styles.timelineDot,
                                  isPassed ? styles.timelineDotActive : styles.timelineDotInactive,
                                ]}
                              >
                                {isPassed && <Check size={8} color="#FFF" />}
                              </View>
                              {!isLast && (
                                <View
                                  style={[
                                    styles.timelineLine,
                                    isPassed ? styles.timelineLineActive : styles.timelineLineInactive,
                                  ]}
                                />
                              )}
                            </View>
                            <Text
                              style={[
                                styles.timelineCityText,
                                isPassed ? styles.timelineCityTextActive : styles.timelineCityTextInactive,
                              ]}
                              numberOfLines={1}
                            >
                              {city}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    <View style={styles.meetingPointPanel}>
                      <Clock size={14} color="#0066FF" style={{ marginRight: 6 }} />
                      <Text style={styles.meetingTitle}>{t('chat.assemblyPointLabel')}</Text>
                      <Text style={styles.meetingLocation} numberOfLines={1}>
                        {activeTrip?.meetingPoint ?? t('chat.notSet')}
                      </Text>
                    </View>
                  </View>

                  {/* 2. Group Expenses & Split */}
                  <View style={styles.settingSectionCard}>
                    <View style={styles.sectionHeader}>
                      <DollarSign size={16} color="#0066FF" style={{ marginRight: 6 }} />
                      <Text style={styles.sectionHeaderTitle}>{t('chat.groupBudgetSplits')}</Text>
                    </View>

                    <View style={styles.budgetOverviewRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.budgetLabel}>{t('chat.budgetPerPersonShort')}</Text>
                        <Text style={styles.budgetValue}>{formatINR(activeTrip?.budget)}</Text>
                      </View>
                    </View>

                    {/* Opens the real, persisted expense ledger (§8.12)
                        rather than the local-only one this panel used to
                        keep, which never agreed with it. */}
                    <TouchableOpacity
                      style={[styles.settingsOutlineBtn, { borderColor: C.blue }]}
                      onPress={() => {
                        setIsSettingsOpen(false);
                        router.push('/budget-tracker');
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={t('chat.openExpenseTracker')}
                    >
                      <DollarSign size={14} color={C.blue} style={{ marginRight: 4 }} />
                      <Text style={[styles.settingsOutlineBtnText, { color: C.blue }]}>{t('chat.openExpenseTracker')}</Text>
                    </TouchableOpacity>
                  </View>

                  {/* The "Group Polls" section was removed, not rebuilt
                      (docs/REMEDIATION.md §8.7) — see the note where
                      INITIAL_TRIP_POLLS used to be defined. */}

                  {/* The "Your Travel Guide" card was removed here — see the
                      note at activeGuide's former definition. */}

                  {/* 5. Safety Desk Controls & SOS Trigger */}
                  <View style={[styles.settingSectionCard, { borderColor: 'rgba(239,68,68,0.2)' }]}>
                    <View style={styles.sectionHeader}>
                      <ShieldAlert size={16} color="#0066FF" style={{ marginRight: 6 }} />
                      <Text style={styles.sectionHeaderTitle}>{t('chat.safetyCommandTitle')}</Text>
                    </View>

                    {/* docs/REMEDIATION.md §9.3/§9.4 follow-up: two more fake
                    status rows used to live here. "Live Location Pinging"
                    always showed "ACTIVE" with no background telemetry
                    feature anywhere in this codebase to back it. "Government
                    Aadhaar verification" always showed a green checkmark and
                    "Aadhaar status: verified" for every member regardless of
                    any real verification state — worse, Aadhaar/KYC was
                    already explicitly removed from this app for v1 per an
                    earlier decision (docs/REMEDIATION.md §12.1: "rip it out
                    for v1... no Aadhaar number / ID photo / face-verification
                    fields, models, or UI"), so this leftover badge directly
                    contradicted that. Both removed rather than kept faked. */}

                    {sosCountdown !== null ? (
                      <View style={styles.settingsArmedBox}>
                        <Text style={styles.armedLabel}>{t('chat.armingSosIn')}</Text>
                        <Text style={styles.armedTimer}>{sosCountdown}</Text>
                        <TouchableOpacity
                          style={styles.armedCancelTouch}
                          onPress={cancelSOS}
                          hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
                          accessibilityRole="button"
                          accessibilityLabel={t('chat.cancel')}
                        >
                          <Text style={styles.armedCancelText}>{t('chat.cancel')}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.settingsSOSBtn}
                        onPress={startSOSCountdown}
                        accessibilityRole="button"
                        accessibilityLabel={t('chat.triggerPanicSosAlert')}
                      >
                        <ShieldAlert size={18} color="#FFF" style={{ marginRight: 6 }} />
                        <Text style={styles.settingsSOSBtnText}>{t('chat.triggerPanicSosAlert')}</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              )}

              {/* 6. Group Members List (Core Info shown directly) */}
              {activeRoom?.type === 'GROUP' && (
                <View style={{ marginBottom: 14, paddingHorizontal: 4 }}>
                  <View style={styles.sectionHeader}>
                    <UsersIcon size={16} color="#0066FF" style={{ marginRight: 6 }} />
                    <Text style={styles.sectionHeaderTitle}>
                      {t('chat.groupMembersCount', { count: groupMembers.length })}
                    </Text>
                  </View>
                  <Text style={styles.settingsSubInfo}>{t('chat.tapMemberToStartChat')}</Text>
                  <View style={styles.membersListContainer}>
                    {groupMembers.map((member, idx) => {
                      const isLast = idx === groupMembers.length - 1;
                      return (
                        <TouchableOpacity
                          key={member.name}
                          style={[
                            styles.memberItemRow,
                            !isLast && { borderBottomWidth: 0.8, borderBottomColor: '#1E293B', paddingBottom: 12 },
                          ]}
                          onPress={() => handleMemberClick(member)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={t('chat.startPrivateChatWith', { name: member.name })}
                        >
                          <Image source={{ uri: member.avatar }} style={styles.memberAvatar} />
                          <View style={styles.memberMeta}>
                            <Text style={styles.memberName}>{member.name}</Text>
                            <Text style={styles.memberRoleText}>
                              {SENDER_ROLE_LABEL_KEYS[member.role] ? t(SENDER_ROLE_LABEL_KEYS[member.role]) : member.role}
                            </Text>
                          </View>

                          {/* Role Badge indicator */}
                          <View
                            style={[
                              styles.roleBadge,
                              member.role === 'Organizer'
                                ? styles.roleBadgeOrganizer
                                : member.role === 'Guide'
                                  ? styles.roleBadgeGuide
                                  : styles.roleBadgeTourist,
                            ]}
                          >
                            <Text
                              style={[
                                styles.roleBadgeText,
                                member.role === 'Organizer'
                                  ? { color: '#0066FF' }
                                  : member.role === 'Guide'
                                    ? { color: '#10B981' }
                                    : { color: '#94A3B8' },
                              ]}
                            >
                              {(SENDER_ROLE_LABEL_KEYS[member.role] ? t(SENDER_ROLE_LABEL_KEYS[member.role]) : member.role).toUpperCase()}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.dmMemberBtn}
                            onPress={() => handleMemberClick(member)}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={t('chat.directMessageName', { name: member.name })}
                          >
                            <MessageSquare size={12} color="#FFF" style={{ marginRight: 3 }} />
                            <Text style={styles.dmMemberBtnText}>{t('chat.dm')}</Text>
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
              {/* EXIT GROUP ACTION */}
              {activeRoom?.type === 'GROUP' && (
                <TouchableOpacity
                  style={styles.settingsExitBtn}
                  onPress={() => {
                    void (async () => {
                      const ok = await confirm({
                        title: t('chat.exitGroupTitle'),
                        message: t('chat.exitGroupMessage', { name: activeRoom?.name }),
                        confirmLabel: t('chat.exit'),
                        destructive: true,
                      });
                      if (!ok) return;
                      setIsSettingsOpen(false);
                      setSelectedRoomId(null);
                      if (activeRoom?.id) await handleLeaveRoom(activeRoom.id);
                    })();
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.exitGroupTitle')}
                >
                  <LogOut size={16} color="#EF4444" style={{ marginRight: 6 }} />
                  <Text style={styles.settingsExitBtnText}>{t('chat.exitGroupTitle')}</Text>
                </TouchableOpacity>
              )}

              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </View>
      )}

      {/* Forms Modals */}
      {activeModal !== 'NONE' && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            {activeModal === 'LOCATION' && (
              <View>
                <Text style={styles.modalHeading}>{t('chat.shareCustomLocation')}</Text>
                <Input
                  label={t('chat.locationNameLabel')}
                  placeholder={t('chat.locationNamePlaceholder')}
                  value={locationForm.label}
                  onChangeText={(val) => setLocationForm((p) => ({ ...p, label: val }))}
                />
                <View style={styles.rowInputs}>
                  <Input
                    label={t('chat.latitude')}
                    placeholder={t('chat.latitudePlaceholder')}
                    keyboardType="numeric"
                    value={locationForm.lat}
                    onChangeText={(val) => setLocationForm((p) => ({ ...p, lat: val }))}
                    containerStyle={{ flex: 1, marginRight: 8 }}
                  />
                  <Input
                    label={t('chat.longitude')}
                    placeholder={t('chat.longitudePlaceholder')}
                    keyboardType="numeric"
                    value={locationForm.lng}
                    onChangeText={(val) => setLocationForm((p) => ({ ...p, lng: val }))}
                    containerStyle={{ flex: 1 }}
                  />
                </View>

                <TouchableOpacity
                  style={styles.useMyLocationBtn}
                  onPress={handleUseMyLocation}
                  disabled={locatingSelf}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.useMyCurrentLocationLabel')}
                  accessibilityHint={t('chat.useMyCurrentLocationHint')}
                  accessibilityState={{ disabled: locatingSelf, busy: locatingSelf }}
                >
                  {locatingSelf ? (
                    <ActivityIndicator size="small" color={C.blueText} />
                  ) : (
                    <MapPin size={14} color={C.blueText} />
                  )}
                  <Text style={styles.useMyLocationText}>
                    {locatingSelf ? t('chat.readingLocation') : t('chat.useMyLocation')}
                  </Text>
                </TouchableOpacity>

                <View style={styles.modalActionButtons}>
                  <Button
                    label={t('common.cancel')}
                    variant="secondary"
                    size="sm"
                    onPress={() => setActiveModal('NONE')}
                  />
                  <Button
                    label={t('chat.share')}
                    size="sm"
                    onPress={handleShareLocationSubmit}
                    accessibilityLabel={t('chat.shareLocationWithGroup')}
                  />
                </View>
              </View>
            )}
          </View>
        </View>
      )}

    </SafeAreaView>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  useMyLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: C.blueText,
    marginTop: 4,
  },
  useMyLocationText: { color: C.blueText, fontSize: fontSize.sm, fontWeight: '600' },
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  dmMemberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.blue,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    marginLeft: 8,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  dmMemberBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // WhatsApp-style Inbox List View
  inboxContainer: {
    flex: 1,
    backgroundColor: C.bg,
  },
  inboxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#070913',
  },
  inboxHeaderTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  inboxHeaderIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerIconTouch: {
    padding: 4,
  },
  searchBarWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#070913',
  },
  inboxFiltersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  filterPill: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 0.5,
    borderColor: C.border,
  },
  filterPillSelected: {
    backgroundColor: 'rgba(0, 102, 255, 0.12)',
    borderColor: C.blue,
  },
  filterPillText: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '700',
  },
  filterPillTextSelected: {
    color: C.blueGlow,
  },
  safetyTickerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: C.red,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  sosFlash: {
    marginRight: 8,
  },
  safetyTickerText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // Room Item Rows
  roomItemTouch: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(37, 39, 64, 0.5)',
    alignItems: 'center',
  },
  roomAvatarWrap: {
    position: 'relative',
    marginRight: 14,
  },
  roomAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: C.border,
  },
  onlineBadgeGuide: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: C.green,
    borderWidth: 2,
    borderColor: C.bg,
  },
  roomMetaWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  roomNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  roomNameText: {
    color: '#FFF',
    fontSize: 14.5,
    fontWeight: '800',
    flex: 1,
    marginRight: 10,
  },
  roomTimeText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  roomSnippetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomSnippetText: {
    color: C.textSec,
    fontSize: 12.5,
    flex: 1,
    marginRight: 8,
  },
  roomBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inboxTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagBlue: {
    backgroundColor: 'rgba(0, 102, 255, 0.12)',
  },
  tagPurple: {
    backgroundColor: 'rgba(139, 92, 246, 0.12)',
  },
  inboxTagText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
  },
  unreadBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '900',
  },

  // Room Header Bar (Detail view)
  roomHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#070913',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerLeftMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backBtnTouch: {
    padding: 6,
    marginRight: 4,
  },
  roomHeaderAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 1,
    borderColor: C.border,
  },
  roomHeaderTitles: {
    flex: 1,
  },
  roomHeaderNameText: {
    color: '#FFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  roomHeaderStatusText: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '600',
  },
  activityStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 5,
  },
  statusGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.green,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  actionRoundBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // SOS Banner
  sosAlertBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  sosBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  sosPulse: {
    marginRight: 8,
  },
  sosBannerText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 12,
  },
  sosBannerRight: {
    flexDirection: 'row',
    gap: 8,
  },
  sosBannerActionBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  sosBannerBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // Collapsible Accordion Itinerary Settings Panel (Settings overlay)
  settingSectionCard: {
    backgroundColor: '#09090C',
    borderWidth: 1.2,
    borderColor: 'rgba(0, 102, 255, 0.25)',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 0.8,
    borderBottomColor: '#1E293B',
    paddingBottom: 6,
  },
  sectionHeaderTitle: {
    color: '#FFF',
    fontSize: 12.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Timeline Progress
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    marginBottom: 10,
  },
  timelineStepWrap: {
    alignItems: 'center',
    flex: 1,
  },
  timelineDotContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  timelineDotActive: {
    backgroundColor: C.green,
  },
  timelineDotInactive: {
    backgroundColor: C.border,
  },
  timelineLine: {
    height: 2,
    position: 'absolute',
    left: '50%',
    right: '-50%',
    top: 6,
    zIndex: 1,
  },
  timelineLineActive: {
    backgroundColor: C.green,
  },
  timelineLineInactive: {
    backgroundColor: C.border,
  },
  timelineCityText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
  },
  timelineCityTextActive: {
    color: '#FFF',
  },
  timelineCityTextInactive: {
    color: C.textMuted,
  },

  // Meeting Point Panel
  meetingPointPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.08)',
    borderWidth: 0.5,
    borderColor: 'rgba(251, 191, 36, 0.25)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  meetingTitle: {
    color: C.yellow,
    fontSize: 12,
    fontWeight: '800',
    marginRight: 4,
  },
  meetingLocation: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },

  // Budget details
  budgetOverviewRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  budgetLabel: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 2,
  },
  budgetValue: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '900',
  },

  // Settings Panel Outline BTN
  settingsOutlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  settingsOutlineBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },

  // Settings Poll MiniCard
  settingsPollMiniCard: {
    backgroundColor: C.cardAlt,
    borderWidth: 0.5,
    borderColor: C.border,
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
  },
  miniPollQuestion: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  miniPollSubText: {
    color: C.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  noActiveLabel: {
    color: C.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginVertical: 10,
  },

  // Settings Guide details
  settingsGuideCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 10,
  },
  guideSettingsAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 10,
    borderWidth: 1,
    borderColor: C.purple,
  },
  guideSettingsMeta: {
    flex: 1,
  },
  guideSettingsName: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  guideSettingsRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  guideSettingsRatingText: {
    color: C.yellow,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 3,
  },
  guideSettingsLangText: {
    color: C.textSec,
    fontSize: 12,
    marginLeft: 4,
  },
  guideSettingsExpertise: {
    color: C.textMuted,
    fontSize: 12,
    marginTop: 2,
  },

  // Safety Controls
  safetyControlRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.cardAlt,
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  controlInfo: {
    flex: 1,
  },
  controlTitle: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  controlDesc: {
    color: C.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  pingerActiveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.green,
  },
  settingsSOSBtn: {
    backgroundColor: C.red,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 6,
  },
  settingsSOSBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  settingsArmedBox: {
    backgroundColor: '#3F0E14',
    borderWidth: 1.5,
    borderColor: C.red,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  armedLabel: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },
  armedTimer: {
    color: C.red,
    fontSize: 32,
    fontWeight: '900',
    marginVertical: 4,
  },
  armedCancelTouch: {
    backgroundColor: C.red,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  armedCancelText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // Messages Scroll Feed
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  dateSeparator: {
    alignItems: 'center',
    marginVertical: 12,
  },
  dateText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 16,
    paddingVertical: 4,
  },
  sosMessageBg: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  avatarContainer: {
    marginRight: 10,
    position: 'relative',
  },
  messageAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.border,
  },
  roleOnlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: C.green,
    borderWidth: 1.5,
    borderColor: C.bg,
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
    fontWeight: '800',
    marginRight: 6,
  },
  rolePill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  rolePillOrganizer: {
    backgroundColor: 'rgba(0, 102, 255, 0.15)',
    borderWidth: 0.5,
    borderColor: C.blue,
  },
  rolePillGuide: {
    backgroundColor: 'rgba(139, 92, 246, 0.15)',
    borderWidth: 0.5,
    borderColor: C.purple,
  },
  rolePillTourist: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 0.5,
    borderColor: C.green,
  },
  rolePillText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
  },

  // Bubble
  bubble: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    maxWidth: '100%',
    alignSelf: 'flex-start',
  },
  instagramBubbleContainerMe: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
  },
  bubbleContainerOther: {
    alignSelf: 'flex-start',
    maxWidth: '92%',
  },
  instagramGradientBubble: {
    borderRadius: 18,
    borderBottomRightRadius: 3,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 70,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  bubbleTextMe: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '500',
  },
  timestampTextMe: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 12,
    alignSelf: 'flex-end',
    marginTop: 4,
  },
  bubbleMe: {
    backgroundColor: 'rgba(0, 102, 255, 0.22)',
    borderWidth: 1.2,
    borderColor: 'rgba(0, 242, 254, 0.35)',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
    shadowColor: C.blueGlow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  bubbleOther: {
    backgroundColor: C.card,
    borderWidth: 1.2,
    borderColor: 'rgba(37, 39, 64, 0.8)',
    borderTopLeftRadius: 2,
    borderTopRightRadius: 16,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  bubbleText: {
    color: '#F8FAFC',
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: '500',
  },
  translateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
  },
  translateText: {
    color: C.blueGlow,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 4,
  },
  timestampText: {
    color: C.textMuted,
    fontSize: 12,
    alignSelf: 'flex-end',
    marginTop: 4,
  },

  // Interactive Poll Card
  pollCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 12,
    maxWidth: '94%',
  },
  pollHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  pollQuestionText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
  },
  pollOptionTouch: {
    backgroundColor: C.cardAlt,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
    height: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  pollOptionVoted: {
    borderColor: C.orange,
  },
  pollProgressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(245, 158, 11, 0.18)',
  },
  pollOptionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    zIndex: 5,
  },
  pollOptionLabel: {
    color: '#D1D5DB',
    fontSize: 12.5,
    fontWeight: '600',
  },
  pollOptionPercent: {
    color: C.orange,
    fontSize: 12,
    fontWeight: '700',
  },
  pollFooter: {
    color: C.textMuted,
    fontSize: 12,
    alignSelf: 'flex-end',
    marginTop: 2,
  },

  // Expense Card
  expenseCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
    borderRadius: 14,
    padding: 12,
    maxWidth: '92%',
  },
  expenseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  expenseHeaderTitle: {
    color: C.green,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 4,
    textTransform: 'uppercase',
  },
  expenseBillDesc: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  expenseBillAmount: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: '900',
    marginTop: 4,
  },
  expenseDivider: {
    height: 0.5,
    backgroundColor: C.border,
    marginVertical: 8,
  },
  expenseFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  expenseShareText: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '600',
  },
  expenseCostHead: {
    color: C.green,
    fontSize: 12,
    fontWeight: '800',
  },

  // Location Card
  locationCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 12,
    maxWidth: '92%',
  },
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  locationCardTitle: {
    color: C.blueGlow,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
  },
  locationText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  miniMapPlaceholder: {
    height: 100,
    backgroundColor: '#0F111E',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: C.border,
    overflow: 'hidden',
    position: 'relative',
  },
  radarRing1: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.2)',
    position: 'absolute',
  },
  radarRing2: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.1)',
    position: 'absolute',
  },
  miniMapPin: {
    zIndex: 10,
  },
  coordsText: {
    color: C.textMuted,
    fontSize: 12,
    position: 'absolute',
    bottom: 6,
  },
  locationActionTouch: {
    backgroundColor: 'rgba(0, 102, 255, 0.12)',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 0.5,
    borderColor: C.blue,
  },
  locationActionText: {
    color: C.blueGlow,
    fontSize: 12,
    fontWeight: '800',
  },

  // Voice Note Card
  voiceNoteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '75%',
    alignSelf: 'flex-start',
  },
  playButtonCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  playArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderLeftColor: '#FFF',
    borderTopWidth: 5,
    borderTopColor: 'transparent',
    borderBottomWidth: 5,
    borderBottomColor: 'transparent',
    marginLeft: 2,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flex: 1,
  },
  waveBar: {
    width: 3,
    borderRadius: 1.5,
  },
  voiceDuration: {
    color: C.textSec,
    fontSize: 12,
    marginLeft: 10,
    fontWeight: '700',
  },

  // Image Card
  imageCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    overflow: 'hidden',
    maxWidth: '92%',
  },
  imageMedia: {
    width: 220,
    height: 140,
  },
  imageOverlayTextRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    backgroundColor: C.cardAlt,
  },
  imageCardDesc: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  imageDownloadBtn: {
    padding: 4,
  },

  // SOS Card Alert
  sosCardAlert: {
    backgroundColor: '#8B0000',
    borderWidth: 1.5,
    borderColor: C.red,
    borderRadius: 14,
    padding: 12,
    maxWidth: '95%',
  },
  sosAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sosAlertHeaderTitle: {
    color: '#FFF',
    fontWeight: '900',
    fontSize: 12,
    marginLeft: 6,
    letterSpacing: 0.5,
  },
  sosAlertDesc: {
    color: '#FFCDD2',
    fontSize: 12.5,
    fontWeight: '700',
    lineHeight: 18,
  },
  sosAlertCoords: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  sosAlertBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  sosAlertBtn: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosAlertBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // Typing Row
  typingIndicatorRow: {
    paddingLeft: 46,
    marginTop: 4,
  },
  typingDotWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  typingText: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },

  // Safety Panel (Drawer Settings content styles)
  safetyDashboard: {
    padding: 12,
  },
  safetyStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
  },
  safetyStatusMeta: {
    marginLeft: 12,
  },
  safetyStatusTitle: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
  safetyStatusDesc: {
    color: C.textSec,
    fontSize: 12,
    marginTop: 2,
  },
  safetySectionLabel: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  checklistCard: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    padding: 12,
    gap: 10,
    marginBottom: 20,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 8,
  },
  sosButtonContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  sosNotice: {
    color: C.textMuted,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    marginBottom: 20,
  },

  // Dynamic Floating Detail Input Bar sits at bottom: 82 to float perfectly above nav bar!
  bottomInputBarDetail: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: C.bg,
    zIndex: 90,
  },
  plusCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0, 102, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(0, 102, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  plusCircleOpen: {
    backgroundColor: C.red,
    borderColor: C.red,
  },
  textInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 20,
    paddingHorizontal: 12,
    height: 40,
  },
  textInput: {
    flex: 1,
    color: '#FFF',
    fontSize: 14.5,
    paddingVertical: 4,
  },
  smileIcon: {
    padding: 2,
  },
  sendIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10,
  },

  // Floating Attachments Panel
  attachmentPanel: {
    position: 'absolute',
    left: 10,
    right: 10,
    backgroundColor: '#070913F5',
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.border,
    zIndex: 91,
  },
  attachScrollInner: {
    paddingHorizontal: 16,
    alignItems: 'center',
    gap: 20,
    height: '100%',
  },
  attachBtn: {
    alignItems: 'center',
  },
  attachIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  attachLabel: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '700',
  },

  // Settings Overlay Card
  settingsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000000',
    zIndex: 200,
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: '#070913',
  },
  settingsBackBtn: {
    padding: 4,
  },
  settingsHeaderTitle: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
  },
  settingsScrollContent: {
    padding: 16,
  },
  settingsAvatarBlock: {
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1.2,
    borderBottomColor: '#1E293B',
  },
  settingsAvatarImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: C.blueGlow,
    marginBottom: 10,
  },
  settingsRoomName: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  settingsTripDates: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },

  // Custom Form Overlays
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContentCard: {
    backgroundColor: C.card,
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 18,
    padding: 20,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeading: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 14,
    textAlign: 'center',
  },
  rowInputs: {
    flexDirection: 'row',
    marginTop: 10,
  },
  modalInfoNotice: {
    color: C.textMuted,
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  modalActionButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 20,
  },

  // Swipe to Reply & Reply UI Styles
  inputRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  replyPreviewContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderLeftWidth: 3,
    borderLeftColor: C.blue,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    width: '100%',
  },
  replyPreviewTextCol: {
    flex: 1,
    marginRight: 10,
  },
  replyPreviewSenderName: {
    fontSize: 12,
    fontWeight: '800',
    color: C.blueGlow,
    marginBottom: 2,
  },
  replyPreviewContentText: {
    fontSize: 12,
    color: C.textMuted,
  },
  replyPreviewCloseBtn: {
    padding: 4,
  },
  bubbleReplyHeaderMe: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderLeftWidth: 3,
    borderLeftColor: '#FFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  bubbleReplySenderMe: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 1,
  },
  bubbleReplyContentMe: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
  },
  bubbleReplyHeaderOther: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderLeftWidth: 3,
    borderLeftColor: C.blue,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  bubbleReplySenderOther: {
    color: C.blueGlow,
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 1,
  },
  bubbleReplyContentOther: {
    color: C.textSec,
    fontSize: 12,
  },

  // Long Press Options Modal Styles
  optionsModalOverlay: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  optionsModalContent: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#1E293B',
    padding: 20,
    width: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 10,
  },
  optionsHeaderRow: {
    marginBottom: 12,
  },
  optionsHeaderTitle: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  optionsHeaderSubText: {
    color: C.textSec,
    fontSize: 12,
    fontStyle: 'italic',
  },
  optionsDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginBottom: 10,
  },
  optionsRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 10,
    gap: 12,
  },
  optionsRowIcon: {
    width: 20,
    textAlign: 'center',
  },
  optionsRowText: {
    color: '#E2E8F0',
    fontSize: 13.5,
    fontWeight: '500',
  },
  optionsCancelDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 12,
  },
  optionsCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 10,
  },
  optionsCancelText: {
    color: C.textSec,
    fontSize: 14,
    fontWeight: '700',
  },

  // Group Members Styles
  settingsSubInfo: {
    color: C.textMuted,
    fontSize: 12,
    marginBottom: 12,
  },
  membersListContainer: {
    marginTop: 4,
    gap: 8,
  },
  memberItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 12,
    padding: 10,
    gap: 12,
  },
  memberAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  memberMeta: {
    flex: 1,
  },
  memberName: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  memberRoleText: {
    color: C.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.8,
    marginRight: 4,
  },
  roleBadgeOrganizer: {
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
    borderColor: 'rgba(0, 102, 255, 0.3)',
  },
  roleBadgeGuide: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  roleBadgeTourist: {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    borderColor: 'rgba(148, 163, 184, 0.2)',
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Telemetry Monitor Styles
  telemetryCardGradient: {
    borderRadius: 16,
    padding: 16,
  },
  telemetryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  telemetryTitle: {
    color: C.purple,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  telemetryStatusBadge: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 0.8,
    borderColor: 'rgba(139, 92, 246, 0.45)',
  },
  telemetryStatusText: {
    color: C.purple,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  telemetryLabel: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#0F172A',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  telemetryMetaGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  telemetryMetaCell: {
    flex: 1,
  },
  telemetryMetaVal: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  telemetryMetaLbl: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  telemetryDivider: {
    height: 1,
    backgroundColor: '#1E293B',
    marginVertical: 12,
  },
  telemetryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  telemetryFooterText: {
    color: C.purple,
    fontSize: 12,
    fontWeight: '600',
  },
  settingsAbsoluteCloseBtn: {
    position: 'absolute',
    top: 45,
    left: 20,
    zIndex: 300,
  },
  settingsExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1.2,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 10,
    marginBottom: 20,
    gap: 8,
  },
  settingsExitBtnText: {
    color: C.red,
    fontSize: 13.5,
    fontWeight: '700',
  },

  // ─── TAB SELECTION BAR STYLES ─────────────────────────────────
  tabBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: C.border,
    marginHorizontal: 12,
    marginVertical: 10,
    elevation: 4,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  tabItemTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 8,
    borderRadius: 14,
    gap: 6,
  },
  tabItemTouchActive: {
    backgroundColor: 'rgba(139, 92, 246, 0.1)',
  },
  tabItemLabel: {
    color: C.textMuted,
    fontSize: 12.5,
    fontWeight: '600',
  },
  tabItemLabelActive: {
    color: '#C084FC',
    fontWeight: '700',
  },

  // ─── PINNED GROUP UPDATE STYLES ───────────────────────────────
  // ─── TAB CONTENT MAIN SCROLL VIEWS ────────────────────────────
  tabScrollView: {
    flex: 1,
  },
  tabScrollViewContent: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 40,
  },

  // ─── ITINERARY STATS SUMMARY CARD ─────────────────────────────
  statsSummaryCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.2,
    borderColor: 'rgba(139, 92, 246, 0.2)',
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statsTitle: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  statsStatusBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.3)',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statsStatusText: {
    color: C.greenText,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statsCell: {
    flex: 1,
  },
  statsValLabel: {
    color: C.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 3,
  },
  statsValText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
  },
  statsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 0.8,
    borderTopColor: '#1E293B',
    paddingTop: 10,
  },
  statsFooterText: {
    color: '#C084FC',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },

  // ─── ROADMAP TIMELINE STYLES ──────────────────────────────────
  timelineCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    borderWidth: 1.2,
    borderColor: C.border,
    padding: 16,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  timelineTitleText: {
    color: '#FFF',
    fontSize: 14.5,
    fontWeight: '700',
  },
  timelineList: {
    paddingLeft: 4,
  },
  verticalTimelineStep: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  verticalTimelineLeft: {
    alignItems: 'center',
    marginRight: 12,
    width: 20,
  },
  verticalTimelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(0, 102, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: C.blue,
    zIndex: 10,
  },
  verticalTimelineInnerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.blue,
  },
  verticalTimelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#1E293B',
    marginVertical: 4,
  },
  verticalTimelineCard: {
    flex: 1,
    backgroundColor: C.cardAlt,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1E293B',
    padding: 12,
  },
  verticalTimelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  verticalTimelineDayText: {
    color: C.blue,
    fontSize: 12,
    fontWeight: '800',
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  verticalTimelineNodeTitle: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '700',
    flex: 1,
  },
  verticalTimelineDesc: {
    color: C.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },

  // ─── DOCUMENTS VAULT STYLES ───────────────────────────────────
  docsHeaderBlock: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  docsHeaderTitleText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  docsHeaderDescText: {
    color: C.textMuted,
    fontSize: 12.5,
    lineHeight: 17,
  },
  uploadDocBtn: {
    marginBottom: 16,
    borderRadius: 16,
    overflow: 'hidden',
  },
  uploadDocGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  uploadDocBtnText: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  docsListContainer: {
    gap: 12,
  },
  noDocsText: {
    color: C.textMuted,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 30,
  },
  docItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: C.border,
    padding: 12,
  },
  docItemLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  docIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  docItemMeta: {
    flex: 1,
    paddingRight: 6,
  },
  docTitleText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 1,
  },
  docSubText: {
    color: C.textMuted,
    fontSize: 12,
    marginBottom: 2,
  },
  docDateText: {
    color: C.textMuted,
    fontSize: 12,
  },
  docItemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  docStatusBadge: {
    borderWidth: 0.8,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  docStatusText: {
    fontSize: 12,
    fontWeight: '800',
  },
  docDeleteBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },

  // ─── MEMBERS DIRECTORY STYLES ─────────────────────────────────
  membersTabList: {
    gap: 10,
  },
  memberTabCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: C.border,
    padding: 12,
  },
  memberTabCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  memberTabAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: C.border,
  },
  memberTabMeta: {
    justifyContent: 'center',
  },
  memberTabNameText: {
    color: '#FFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  memberTabRoleText: {
    color: C.textMuted,
    fontSize: 12,
    marginTop: 1,
  },
  memberTabCardRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  memberRoleBadge: {
    borderWidth: 0.8,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  memberRoleBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  memberChatIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 102, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  systemMessageContainer: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
    marginVertical: 8,
    maxWidth: '85%',
  },
  systemMessageText: {
    color: C.textSec,
    fontSize: 12,
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default memo(ChatScreen);

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <RouteErrorFallback {...props} label="Chat" />;
}
