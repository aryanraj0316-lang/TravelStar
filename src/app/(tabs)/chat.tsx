import { RouteErrorFallback } from '@/components/route-error-fallback';
import { Avatar, Button, Input, ScreenEmpty } from '@/components/ui';
import { recordConsent } from '@/lib/consent';
import { formatDateRange, formatMessageTimestamp, formatTime } from '@/lib/datetime';
import { getCurrentDeviceLocation, getEmergencyDeviceLocation } from '@/lib/device-location';
import { errorToastMessage, showAlert, showPrompt, toast, useConfirm } from '@/lib/feedback';
import { logger } from '@/lib/logger';
import { formatINR } from '@/lib/money';
import { uploadFileToUrl } from '@/lib/upload';
import { queryClient } from '@/lib/query-client';
import { chatsQueryOptions } from '@/lib/prefetch-launch';
import { apiService } from '@/services/api';
import { eventBus } from '@/services/event-bus';
import { socketService } from '@/services/socket';
import { useApp } from '@/store/AppContext';
import type { ChatRoomSummary, MessageAudienceEntry, MessageStatus } from '@/types/api';
import { C, MIN_TOUCH_TARGET, fontSize, radii } from '@/theme/tokens';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter, type ErrorBoundaryProps } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Bell from 'lucide-react-native/icons/bell';
import BellOff from 'lucide-react-native/icons/bell-off';
import Calendar from 'lucide-react-native/icons/calendar';
import BarChart2 from 'lucide-react-native/icons/chart-no-axes-column';
import Check from 'lucide-react-native/icons/check';
import CheckCheck from 'lucide-react-native/icons/check-check';
import AlertCircle from 'lucide-react-native/icons/circle-alert';
import CheckCircle from 'lucide-react-native/icons/circle-check-big';
import Clock from 'lucide-react-native/icons/clock';
import Compass from 'lucide-react-native/icons/compass';
import Copy from 'lucide-react-native/icons/copy';
import CornerUpLeft from 'lucide-react-native/icons/corner-up-left';
import DeleteIcon from 'lucide-react-native/icons/delete';
import DollarSign from 'lucide-react-native/icons/dollar-sign';
import TranslateIcon from 'lucide-react-native/icons/globe';
import ImageIcon from 'lucide-react-native/icons/image';
import LogOut from 'lucide-react-native/icons/log-out';
import MapPin from 'lucide-react-native/icons/map-pin';
import MessageSquare from 'lucide-react-native/icons/message-square';
import Pencil from 'lucide-react-native/icons/pencil';
import Pin from 'lucide-react-native/icons/pin';
import Plus from 'lucide-react-native/icons/plus';
import Search from 'lucide-react-native/icons/search';
import Send from 'lucide-react-native/icons/send';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Smile from 'lucide-react-native/icons/smile';
import Trash2 from 'lucide-react-native/icons/trash-2';
import AlertTriangle from 'lucide-react-native/icons/triangle-alert';
import UsersIcon from 'lucide-react-native/icons/users';
import X from 'lucide-react-native/icons/x';
import React, { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  FlatList,
  Image,
  Keyboard,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  UIManager,
  View
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

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

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
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
  createdAt?: string | Date;
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
  /** Sender's view only — null on other people's and system messages. */
  status?: MessageStatus | null;
  sosId?: string;
  resolved?: boolean;
  sosReason?: string;
  sosRequester?: string;
  isSystem?: boolean;
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

const STATUS_RANK: Record<MessageStatus, number> = { SENT: 0, DELIVERED: 1, SEEN: 2 };

// Status events can arrive out of order, so a SEEN bubble must never fall back.
function mergeStatus(current: MessageStatus | null | undefined, incoming: MessageStatus): MessageStatus {
  if (!current) return incoming;
  return STATUS_RANK[incoming] > STATUS_RANK[current] ? incoming : current;
}

function MessageTicks({ status }: { status: MessageStatus | null | undefined }) {
  if (!status) return null;
  if (status === 'SENT') {
    return <Check size={13} color={C.textSec} strokeWidth={2.4} style={styles.statusCheckIcon} />;
  }
  return (
    <CheckCheck
      size={13}
      color={status === 'SEEN' ? C.blueText : C.textSec}
      strokeWidth={2.4}
      style={styles.statusCheckIcon}
    />
  );
}

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
  type: 'GROUP' | 'GUIDE' | 'DM' | 'SAFETY';
  latestMessage: string;
  latestTime: string;
  unreadCount: number;
  badge?: string;
  myRole?: string; // 'Organizer' | 'Member' – current user's role in this room
  tripName?: string; // for DMs – the shared trip name
  lastMessageAt?: string;
  /** This user's own per-room notification mute — see POST /chats/:id/mute. */
  muted?: boolean;
  /** Non-null on pre-join enquiry threads — these belong in the organizer
   *  portal's Chats & Approvals tab and should not appear in the inbox. */
  inquiryTripId?: string | null;
  /** True only for the organizer's own side of that enquiry thread. */
  isMyOrganizerInquiry?: boolean;
}

function mapChatSummaries(res: ChatRoomSummary[]): ChatRoom[] {
  return res.map((r) => ({
    id: r.id,
    tripId: r.tripId ?? '',
    name: r.name,
    avatar: r.avatar,
    // Backend sends 'GUIDE' for all non-group rooms (guide sessions and
    // peer DMs alike). Map to 'DM' so member DMs appear under the DMs
    // tab. Actual guide session rooms can be explicitly typed 'GUIDE'
    // via socket events (key contains 'guide').
    type: r.type === 'GROUP' ? 'GROUP' : 'DM',
    latestMessage: r.latestMessage,
    latestTime: r.latestTime,
    unreadCount: r.unreadCount || 0,
    badge: r.badge || 'Member',
    myRole: r.badge === 'Organizer' || r.badge === 'Organizer Trip' ? 'Organizer' : 'Member',
    lastMessageAt: r.lastMessageAt || '1970-01-01T00:00:00.000Z',
    muted: !!r.muted,
    inquiryTripId: r.inquiryTripId ?? null,
    isMyOrganizerInquiry: !!r.isMyOrganizerInquiry,
  }));
}

function roomsFromChatCache(): ChatRoom[] {
  const cached = queryClient.getQueryData<ChatRoomSummary[]>(chatsQueryOptions().queryKey);
  return cached && cached.length > 0 ? mapChatSummaries(cached) : [];
}

const SENDER_ROLE_LABEL_KEYS: Record<string, string> = {
  Organizer: 'chat.roleOrganizer',
  Guide: 'chat.roleGuide',
  Tourist: 'chat.roleTourist',
  Family: 'chat.roleFamily',
  System: 'chat.roleSystem',
};

function findMemberAvatar(
  senderId: string | undefined,
  senderName: string | undefined,
  senderRole: string | undefined,
  members: { id?: string; name: string; avatar: string; role?: string }[],
): string {
  if (!members || members.length === 0) return '';

  const cleanName = (senderName || '').trim().toLowerCase();

  // 1. Match by senderId against member id
  if (senderId) {
    const byId = members.find((m) => m.id && m.id === senderId);
    if (byId?.avatar) return byId.avatar;
  }

  // 2. Match by exact clean name
  if (cleanName) {
    const byExactName = members.find((m) => m.name.trim().toLowerCase() === cleanName);
    if (byExactName?.avatar) return byExactName.avatar;

    // 3. Match by name stripping suffixes like "(Creator)", "(Organizer)", "(Guide)"
    const byStrippedName = members.find((m) => {
      const mClean = m.name.replace(/\s*\((Creator|Organizer|Guide|Member)\)\s*$/i, '').trim().toLowerCase();
      return mClean === cleanName;
    });
    if (byStrippedName?.avatar) return byStrippedName.avatar;

    // 4. Prefix or substring matching
    const byPrefix = members.find((m) => {
      const mClean = m.name.replace(/\s*\((Creator|Organizer|Guide|Member)\)\s*$/i, '').trim().toLowerCase();
      return mClean.length > 0 && (mClean.startsWith(cleanName) || cleanName.startsWith(mClean));
    });
    if (byPrefix?.avatar) return byPrefix.avatar;
  }

  // 5. If role is Organizer and there is an Organizer in members
  if (senderRole === 'Organizer' || senderRole === 'ORGANIZER') {
    const organizer = members.find(
      (m) => m.role === 'Organizer' || m.role === 'ORGANIZER' || m.name.toLowerCase().includes('creator'),
    );
    if (organizer?.avatar) return organizer.avatar;
  }

  return '';
}

function formatChatTime(rawTime: string | number | Date | null | undefined): string {
  if (!rawTime) return '';
  const str = String(rawTime).trim();
  if (str === 'Just Now' || str === 'Now') return str;

  // Format via datetime.ts formatTime using device's resolved local timezone
  const formatted = formatTime(rawTime);
  if (formatted && formatted !== '—') return formatted;

  // Fallback: If rawTime is already a pre-formatted time like "6:54 pm" or "18:54"
  if (str.includes(':')) {
    return str;
  }

  return str;
}

// One chat message. Extracted from an inline `.map()` so the message list can
// be virtualized (the FlatList below) and so the React Compiler
// (app.json > experiments.reactCompiler) can memoize bubbles independently —
// which is why there is no hand-written React.memo here. A busy trip group is
// the app's only truly unbounded list, and it previously mounted every message
// it had ever loaded, all at once (docs/REMEDIATION.md Phase 10).
function extractSosDetails(content: string, explicitReason?: string) {
  let issue = explicitReason?.trim() || '';
  let requester = '';
  const isStale = content.toLowerCase().includes('last known location');

  if (!issue) {
    const reasonMatch = content.match(/(?:Reason|Issue|Details):\s*([^\n\r]+)/i);
    if (reasonMatch && reasonMatch[1]) {
      issue = reasonMatch[1].trim();
    }
  }

  if (!issue) {
    const backendMatch = content.match(/Emergency alert\s*[—–-]\s*([^\.\n]+)\s+has requested assistance(?:[^\.\n]*\.)(?:\s*Showing their Last known location[^\.\n]*\.)?\s*(.*)$/i);
    if (backendMatch) {
      if (backendMatch[1]) requester = backendMatch[1].trim();
      if (backendMatch[2]) issue = backendMatch[2].trim();
    }
  }

  if (!requester) {
    const reqMatch = content.match(/(?:by|alert\s*[—–-])\s*([A-Za-z0-9 _]+?)(?:\s*has|\s*!|\s*needs|\s*has requested)/i);
    if (reqMatch && reqMatch[1]) {
      requester = reqMatch[1].trim();
    }
  }

  return {
    issue: issue || null,
    requester: requester || null,
    isStale,
  };
}

// One chat message. Extracted from an inline `.map()` so the message list can
// be virtualized (the FlatList below) and so the React Compiler
// (app.json > experiments.reactCompiler) can memoize bubbles independently —
// which is why there is no hand-written React.memo here. A busy trip group is
// the app's only truly unbounded list, and it previously mounted every message
// it had ever loaded, all at once (docs/REMEDIATION.md Phase 10).
function MessageBubble({
  msg,
  isConsecutive: isConsecutiveProp,
  isFirstMessage = false,
  previousSenderName,
  isTranslated,
  onReply,
  onShowOptions,
  onToggleTranslate,
  onPollVote,
  onOpenMap,
  onOpenExternalMaps,
  onOpenImage,
  canResolveSOS,
  onResolveSOS,
  members,
}: {
  msg: CustomMessage;
  isConsecutive?: boolean;
  isFirstMessage?: boolean;
  previousSenderName?: string | null;
  isTranslated: boolean;
  onReply: (msg: CustomMessage) => void;
  onShowOptions: (msg: CustomMessage) => void;
  onToggleTranslate: (id: string) => void;
  onPollVote: (msgId: string, optionIdx: number) => void;
  onOpenMap: (msg: CustomMessage) => void;
  onOpenExternalMaps: (msg: CustomMessage) => void;
  onOpenImage: (uri: string) => void;
  // Resolving an SOS is an organizer/guide action, and it clears the trip's
  // *active* alert rather than this message — hence no message argument.
  canResolveSOS: boolean;
  onResolveSOS: () => void;
  members?: { id?: string; name: string; avatar: string; role?: string }[];
}) {
  const { t } = useTranslation();
  const hasTranslation = isTranslated;
  const displayedContent = hasTranslation && msg.translations?.hindi ? msg.translations.hindi : msg.content;
  const isSOS =
    msg.type === 'sos' ||
    ((msg.isSystem || msg.locationCoords) &&
      (msg.content?.includes('Emergency alert') ||
       msg.content?.includes('Emergency assistance') ||
       msg.content?.includes('requested assistance') ||
       msg.content?.includes('SOS PANIC') ||
       msg.content?.includes('CRITICAL EMERGENCY')));
  const isSystem = msg.senderRole === 'SYSTEM' || msg.senderName === 'System';
  const senderAvatar = msg.avatar || findMemberAvatar(msg.senderId, msg.senderName, msg.senderRole, members || []);

  if (isSOS) {
    const { issue, requester, isStale } = extractSosDetails(msg.content, msg.sosReason);
    const displayName = requester || (msg.isMe ? t('chat.you', 'You') : msg.senderName) || t('common.traveller', 'Traveller');
    const lat = msg.locationCoords?.latitude;
    const lng = msg.locationCoords?.longitude;
    const hasCoords = lat != null && lng != null;

    return (
      <View style={styles.sosBroadcastRow}>
        <View style={styles.sosCardAlert}>
          {/* Header Badge & Alert Level */}
          <View style={styles.sosCardTopRow}>
            <View style={styles.sosBadgePill}>
              <ShieldAlert size={14} color="#EF4444" strokeWidth={2.4} />
              <Text style={styles.sosBadgePillText}>
                {t('chat.criticalSosDispatch', 'CRITICAL SOS ALERT')}
              </Text>
            </View>
            <Text style={styles.sosCardTimestamp}>
              {formatChatTime(msg.createdAt || msg.timestamp)}
            </Text>
          </View>

          {/* Requester Identity Row */}
          <View style={styles.sosRequesterRow}>
            <View style={styles.sosRequesterIconCircle}>
              <AlertTriangle size={18} color="#FFFFFF" strokeWidth={2.4} />
            </View>
            <View style={styles.sosRequesterMeta}>
              <Text style={styles.sosRequesterTitle} numberOfLines={1}>
                {displayName}
              </Text>
              <Text style={styles.sosRequesterSub}>
                {t('chat.sosAssistanceRequested', 'Emergency assistance requested')}
              </Text>
            </View>
          </View>

          {/* Reported Issue Box */}
          <View style={styles.sosIssueCard}>
            <View style={styles.sosIssueLabelRow}>
              <AlertCircle size={13} color="#F87171" strokeWidth={2.2} />
              <Text style={styles.sosIssueLabelText}>
                {t('chat.reportedIssueLabel', 'REPORTED ISSUE / REASON')}
              </Text>
            </View>
            <Text style={styles.sosIssueMainText}>
              {issue ? issue : t('chat.sosImmediateHelpNeeded', 'Immediate emergency assistance required at current position.')}
            </Text>
          </View>

          {/* Location and Telemetry Strip */}
          {hasCoords && (
            <View style={styles.sosLocationStrip}>
              <View style={styles.sosLocationCoordsRow}>
                <MapPin size={13} color="#FCA5A5" />
                <Text style={styles.sosLocationCoordsText}>
                  {lat.toFixed(4)}° N, {lng.toFixed(4)}° E
                </Text>
              </View>
              {isStale && (
                <View style={styles.sosStaleBadge}>
                  <Text style={styles.sosStaleBadgeText}>
                    {t('chat.lastKnownPosition', 'Last Known Position')}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Action Controls */}
          <View style={styles.sosAlertBtnRow}>
            {hasCoords && (
              <TouchableOpacity
                style={styles.sosPrimaryBtn}
                onPress={() => onOpenMap(msg)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.showOnMap', 'View on Map')}
              >
                <MapPin size={13} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.sosPrimaryBtnText}>{t('chat.showOnMap', 'View on Map')}</Text>
              </TouchableOpacity>
            )}

            {hasCoords && (
              <TouchableOpacity
                style={styles.sosSecondaryBtn}
                onPress={() => onOpenExternalMaps(msg)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.openInMaps', 'Navigate')}
              >
                <CornerUpLeft size={13} color="#E2E8F0" strokeWidth={2.4} />
                <Text style={styles.sosSecondaryBtnText}>{t('chat.navigate', 'Navigate')}</Text>
              </TouchableOpacity>
            )}

            {(canResolveSOS || msg.isMe) && (
              <TouchableOpacity
                style={styles.sosResolveBtn}
                onPress={onResolveSOS}
                accessibilityRole="button"
                accessibilityLabel={t('chat.markAsSafe', "I'm safe")}
              >
                <ShieldCheck size={13} color="#FFFFFF" strokeWidth={2.4} />
                <Text style={styles.sosResolveBtnText}>{t('chat.safe', "I'm safe")}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    );
  }

  if (isSystem) {
    return (
      <View style={styles.systemMessageContainer}>
        <Text style={styles.systemMessageText}>{displayedContent}</Text>
      </View>
    );
  }

  // Check if previous message was sent by the same sender
  const isConsecutive =
    isConsecutiveProp !== undefined
      ? isConsecutiveProp
      : previousSenderName === msg.senderName;

  return (
    <SwipeableMessageRow isMe={msg.isMe} onSwipeReply={() => onReply(msg)}>
      <View
        style={[
          styles.messageRow,
          msg.isMe && { justifyContent: 'flex-end' },
          isSOS && styles.sosMessageBg,
          isConsecutive
            ? styles.consecutiveMessageRow
            : isFirstMessage
              ? styles.consecutiveMessageRow
              : styles.differentSenderRow,
        ]}
      >
        {!msg.isMe && (
          <View style={styles.avatarContainer}>
            {!isConsecutive && (
              <Avatar uri={senderAvatar} name={msg.senderName} size={36} style={styles.messageAvatar} />
            )}
          </View>
        )}

        <View style={[styles.messageBody, msg.isMe ? { flex: 1, alignItems: 'flex-end' } : { flex: 1 }]}>
          {!isConsecutive && !msg.isMe && (
            <View style={styles.senderHeader}>
              <Text
                style={[
                  styles.senderNameText,
                  msg.senderRole === 'Organizer'
                    ? { color: C.blueText }
                    : msg.senderRole === 'Guide'
                      ? { color: C.purpleText }
                      : { color: C.text },
                ]}
              >
                {msg.senderName}
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
                  <Text
                    style={[
                      styles.rolePillText,
                      msg.senderRole === 'Organizer'
                        ? styles.rolePillTextOrganizer
                        : msg.senderRole === 'Guide'
                          ? styles.rolePillTextGuide
                          : styles.rolePillTextTourist,
                    ]}
                  >
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
                onPress={() => onOpenMap(msg)}
                hitSlop={{ top: 9, bottom: 9, left: 9, right: 9 }}
                accessibilityRole="button"
                accessibilityLabel={t('chat.openLiveNavigation')}
              >
                <Text style={styles.locationActionText}>{t('chat.openLiveNavigation')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.locationSecondaryTouch}
                onPress={() => onOpenExternalMaps(msg)}
                hitSlop={{ top: 9, bottom: 9, left: 9, right: 9 }}
                accessibilityRole="button"
                accessibilityLabel={t('chat.openInMaps')}
              >
                <Text style={styles.locationSecondaryText}>{t('chat.openInMaps')}</Text>
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
            <View style={[styles.imageCard, msg.isMe ? styles.imageCardMe : styles.imageCardOther]}>
              <Pressable
                style={styles.imageMediaWrapper}
                onPress={() => {
                  const uri = msg.mediaUrl || (msg.content && !msg.content.includes('📷') ? msg.content : undefined);
                  if (uri) onOpenImage(uri);
                }}
                accessibilityRole="imagebutton"
                accessibilityLabel={t('chat.viewImageLabel')}
              >
                <Image
                  source={{ uri: msg.mediaUrl || (msg.content && !msg.content.includes('📷') ? msg.content : undefined) }}
                  style={styles.imageMedia}
                  resizeMode="cover"
                />
                <View style={styles.imageTimeBadge}>
                  <Text style={styles.imageTimeText}>{formatChatTime(msg.createdAt || msg.timestamp)}</Text>
                </View>
              </Pressable>
              {msg.content &&
                msg.content !== '📷 Photo' &&
                !msg.content.includes('📷') &&
                msg.content !== 'Photo' &&
                msg.content.trim().length > 0 ? (
                <View style={styles.imageCaptionRow}>
                  <Text style={styles.imageCardDesc} numberOfLines={3}>
                    {msg.content}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={[msg.isMe ? styles.bubbleContainerMe : styles.bubbleContainerOther]}>
              {msg.isMe ? (
                <TouchableOpacity
                  activeOpacity={0.88}
                  onLongPress={() => onShowOptions(msg)}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.you')}
                  accessibilityHint={t('chat.messageOptionsHint')}
                  style={styles.modernBubbleMe}
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
                  <View style={styles.bubbleInnerMe}>
                    <Text style={styles.bubbleTextMe}>{displayedContent}</Text>
                    <View style={styles.bubbleMetaRowMe}>
                      <Text style={styles.timestampTextMe}>{formatChatTime(msg.createdAt || msg.timestamp)}</Text>
                      <MessageTicks status={msg.status} />
                    </View>
                  </View>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.88}
                  onLongPress={() => onShowOptions(msg)}
                  accessibilityRole="button"
                  accessibilityLabel={msg.senderName}
                  accessibilityHint={t('chat.messageOptionsHint')}
                  style={styles.modernBubbleOther}
                >
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
                  <View style={styles.bubbleInnerOther}>
                    <Text style={styles.bubbleTextOther}>{displayedContent}</Text>
                    {msg.translations && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => onToggleTranslate(msg.id)}
                        style={styles.translateRow}
                        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel={hasTranslation ? t('chat.showOriginal') : t('chat.translateToHindi')}
                      >
                        <TranslateIcon size={12} color={C.blue} />
                        <Text style={styles.translateTextOther}>
                          {hasTranslation ? t('chat.showOriginal') : t('chat.translateToHindi')}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <View style={styles.bubbleMetaRowOther}>
                      <Text style={styles.timestampTextOther}>{formatChatTime(msg.createdAt || msg.timestamp)}</Text>
                    </View>
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

interface EmojiCategory {
  id: string;
  name: string;
  icon: string;
  emojis: string[];
}

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    id: 'popular',
    name: 'Top',
    icon: '🔥',
    emojis: ['❤️', '😂', '🔥', '👍', '✈️', '🌴', '🙌', '🎉', '😍', '✨', '😎', '🥳', '🏖️', '🧳', '📍', '🍻', '☀️', '💯', '🤩', '🚀', '🍕', '☕', '🏕️', '📸', '💪', '🙏', '👏', '💃', '💖', '🥰', '🎈', '🌟'],
  },
  {
    id: 'travel',
    name: 'Travel',
    icon: '✈️',
    emojis: ['✈️', '🏖️', '🌴', '🧳', '🗺️', '📍', '🏕️', '⛰️', '🚗', '🚕', '🚂', '🛳️', '🌅', '🏨', '🎒', '🛂', '🎫', '🧭', '🗼', '🗽', '🏰', '🏝️', '🛵', '⛵', '🌊', '📸', '☀️', '🌍', '🏔️', '⛺', '⛽', '🚁'],
  },
  {
    id: 'smileys',
    name: 'Smileys',
    icon: '😀',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😋', '😜', '🤪', '😎', '🥳', '😏', '🤔', '🤫', '🤭', '😴', '🤤', '🤯', '😭', '😱', '🥺', '😳'],
  },
  {
    id: 'gestures',
    name: 'Gestures',
    icon: '👍',
    emojis: ['👍', '👎', '👌', '✌️', '🤞', '🤙', '👏', '🙌', '🤝', '🙏', '💪', '👋', '👊', '✊', '🤛', '🤜', '🫡', '👆', '👇', '👈', '👉', '🫶', '❤️', '🔥', '✨', '🤘', '🤟', '✋', '🤚', '✍️', '💅', '👀'],
  },
  {
    id: 'vibes',
    name: 'Vibes',
    icon: '🎉',
    emojis: ['🎉', '🎊', '🥳', '🍾', '🍻', '🥂', '🍹', '🍕', '🍔', '🌮', '🍩', '☕', '🎸', '🎵', '🎶', '🏖️', '🏕️', '🚀', '⭐', '🌟', '💫', '⚡', '🌈', '💯', '🎯', '🎲', '🏆', '🥇', '👑', '💎', '🍿', '🔥'],
  },
];

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
    onlineUserIds,
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
    checkUnreadChats,
    refreshTrips,
    isLoggedIn,
  } = useApp();

  // Active Trip selection (binds details drawer + polls + expenses)
  const [selectedTripId, setSelectedTripId] = useState<string>('');

  // Dynamic database members state
  const [dbMembers, setDbMembers] = useState<
    { name: string; avatar: string; role: string; id?: string; isPendingCompanion?: boolean }[]
  >([]);

  // Stateful Chat Data — starts empty; populated exclusively from
  // apiService.getChats()/getChatMessages() (loadInboxRooms below and the
  // message-history effect) and the real-time socket sync effect. See the
  // removed-INITIAL_TRIP_MESSAGES comment above the CustomMessage/ChatRoom
  // interfaces for why this used to be seeded with fake conversations.
  const [tripMessages, setTripMessages] = useState<Record<string, CustomMessage[]>>({});

  const chatsQuery = useQuery({
    ...chatsQueryOptions(),
    enabled: isLoggedIn,
  });

  // Inbox Rooms state - updates snippet text in real-time. Seeded from the
  // launch prefetch so the first paint already has rooms instead of an
  // empty list that flickers in after GET /chats.
  const [inboxRooms, setInboxRooms] = useState<ChatRoom[]>(roomsFromChatCache);

  const applyChatSummaries = useCallback((res: ChatRoomSummary[], openRoomId: string | null) => {
    const loadedRooms = mapChatSummaries(res);
    setInboxRooms((prevRooms) => {
      const merged = [...prevRooms];
      loadedRooms.forEach((lr) => {
        const idx = merged.findIndex((mr) => mr.id === lr.id);
        const isCurrentlyOpen =
          lr.id === openRoomId ||
          (!!openRoomId && (`room-${openRoomId}` === lr.id || openRoomId === `room-${lr.id}`));
        // GET /chats is the authoritative count (real MessageReadReceipt
        // rows, joinedAt-scoped, isSystem-excluded) — trusting it
        // outright, rather than Math.max against whatever this device
        // last believed, is what lets a read recorded on another device
        // actually clear the badge here instead of only ever growing.
        const finalUnread = isCurrentlyOpen ? 0 : (lr.unreadCount || 0);

        if (idx >= 0) {
          merged[idx] = { ...merged[idx], ...lr, unreadCount: finalUnread };
        } else {
          merged.push({ ...lr, unreadCount: finalUnread });
        }
      });
      return merged;
    });
  }, []);

  const loadInboxRooms = useCallback(async () => {
    if (!isLoggedIn) {
      setInboxRooms([]);
      return;
    }
    try {
      const res = await queryClient.fetchQuery(chatsQueryOptions());
      if (res && res.length > 0) {
        applyChatSummaries(res, activeRoomId);
      }
    } catch (e) {
      logger.warn('Failed to load chat rooms from backend:', e);
    }
  }, [isLoggedIn, applyChatSummaries, activeRoomId]);

  useLayoutEffect(() => {
    if (!isLoggedIn) return;
    if (chatsQuery.data && chatsQuery.data.length > 0) {
      applyChatSummaries(chatsQuery.data, activeRoomId);
    }
    // Hydrate from the launch cache as soon as it is available — do not
    // re-run on every room switch or socket-updated snippets get replaced.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, chatsQuery.data, applyChatSummaries]);

  useEffect(() => {
    if (!isLoggedIn) {
      setInboxRooms([]);
      setSelectedRoomId(null);
      return;
    }
    clearChatUnread();
    refreshTrips();
    // False positive: the linter traces into loadInboxRooms and sees it
    // eventually calls setInboxRooms, but that call happens after an
    // `await`, inside a resolved promise's continuation — not synchronously
    // within this effect's body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadInboxRooms();
  }, [isLoggedIn, clearChatUnread, refreshTrips, loadInboxRooms]);

  // Navigation States
  const selectedRoomId = activeRoomId;
  const setSelectedRoomId = setActiveRoomId;

  // Deep link into one thread: "Ask the organizer" on a trip and the
  // organizer's enquiry list both push here with a roomId. Without this the
  // push landed on the chat tab with whatever room happened to be open.
  const { roomId: roomIdParam } = useLocalSearchParams<{ roomId?: string }>();
  const openedRoomParamRef = useRef<string | null>(null);
  useEffect(() => {
    if (!roomIdParam || openedRoomParamRef.current === roomIdParam) return;
    openedRoomParamRef.current = roomIdParam;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedRoomId(roomIdParam);
  }, [roomIdParam, setSelectedRoomId]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [unreadSessionCount, setUnreadSessionCount] = useState<number>(0);
  const [isChatContentReady, setIsChatContentReady] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const initialScrollDoneRoomRef = useRef<string | null>(null);
  const lastProcessedSocketMsgIdRef = useRef<string | null>(null);
  const [isTripDetailsExpanded, setIsTripDetailsExpanded] = useState(true);

  // Tab Selection (Itinerary & Members only)
  const confirm = useConfirm();
  const [overlayTab, setOverlayTab] = useState<'itinerary' | 'members'>('itinerary');
  const [canEditItinerary, setCanEditItinerary] = useState(true);

  // Trip Editing State
  const [isEditTripModalOpen, setIsEditTripModalOpen] = useState(false);
  const [tripEditForm, setTripEditForm] = useState({ name: '', meetingPoint: '', budget: '' });
  const [isSavingTrip, setIsSavingTrip] = useState(false);

  // Itinerary Day Editing State
  const [itineraryModalMode, setItineraryModalMode] = useState<'NONE' | 'ADD' | 'EDIT'>('NONE');
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [itineraryDayForm, setItineraryDayForm] = useState({ title: '', plan: '' });
  const [isSavingDay, setIsSavingDay] = useState(false);

  // Load message history from DB
  useEffect(() => {
    if (selectedRoomId) {
      initialScrollDoneRoomRef.current = null;
      setIsChatContentReady(true);

      // Optimistically clear unread on current room immediately so badges disappear
      let noneUnreadLeft = false;
      setInboxRooms((prevRooms) => {
        const updated = prevRooms.map((room) =>
          room.id === selectedRoomId || `room-${room.id}` === selectedRoomId || room.id === `room-${selectedRoomId}`
            ? { ...room, unreadCount: 0 }
            : room,
        );
        if (!updated.some((r) => r.unreadCount > 0)) noneUnreadLeft = true;
        return updated;
      });
      if (noneUnreadLeft) clearChatUnread();

      apiService
        .markChatRead(selectedRoomId)
        .then(() => {
          checkUnreadChats();
        })
        .catch((e) => logger.warn('[Chat] Mark-read failed:', e));

      // Catch-up sweep: anything that landed while this device was offline is
      // only really "delivered" once the device has it.
      apiService
        .markChatDelivered(selectedRoomId)
        .catch((e) => logger.warn('[Chat] Mark-delivered sweep failed:', e));

      apiService
        .getChatMessages(selectedRoomId)
        .then((history) => {
          if (history && history.length > 0) {
            const mappedHistory: CustomMessage[] = history.map((m) => {
              const isMe = m.senderId === profile.id || !!(profile.name && m.senderName === profile.name);
              const messageAvatar = m.senderAvatar || m.avatar || findMemberAvatar(m.senderId, m.senderName, m.senderRole, dbMembers);
              const hasCoords = m.latitude != null && m.longitude != null;
              const isSos =
                (m.isSystem || m.mediaType === 'LOCATION') &&
                (m.content?.includes('Emergency alert') ||
                 m.content?.includes('Emergency assistance') ||
                 m.content?.includes('requested assistance') ||
                 m.content?.includes('SOS'));
              const type: CustomMessage['type'] =
                isSos
                  ? 'sos'
                  : m.mediaType === 'IMAGE'
                    ? 'image'
                    : m.mediaType === 'VOICE'
                      ? 'voice'
                      : m.mediaType === 'LOCATION' && hasCoords
                        ? 'location'
                        : 'text';
              return {
                id: m.id,
                senderId: m.senderId,
                senderName: m.senderName,
                senderRole: m.senderRole,
                avatar: isMe ? (profile.avatar || messageAvatar) : messageAvatar,
                content: m.content,
                timestamp: m.createdAt || m.timestamp,
                createdAt: m.createdAt || m.timestamp,
                isMe: isMe,
                type,
                mediaUrl: m.mediaUrl || undefined,
                status: isMe ? (m.status ?? null) : null,
                ...(type === 'location' ? { locationCoords: { latitude: m.latitude as number, longitude: m.longitude as number } } : {}),
              };
            });

            setTripMessages((prev) => ({
              ...prev,
              [selectedRoomId]: mappedHistory,
            }));

            // Inverted FlatList naturally displays latest message at offset 0
            setTimeout(() => {
              messageListRef.current?.scrollToOffset({ offset: 0, animated: false });
              setIsChatContentReady(true);
            }, 30);

            const lastMsg = history[history.length - 1];
            setInboxRooms((prevRooms) => {
              const nowIso = new Date().toISOString();
              const existingRoom = prevRooms.find((r) => r.id === selectedRoomId);
              const otherRooms = prevRooms.filter((r) => r.id !== selectedRoomId);

              if (existingRoom) {
                const isMe = lastMsg.senderName === profile.name;
                const senderLabel = isMe ? 'You' : lastMsg.senderName;
                const displayContent = lastMsg.mediaType === 'IMAGE'
                  ? (lastMsg.content && !lastMsg.content.includes('📷') ? lastMsg.content : 'Photo')
                  : lastMsg.content;
                const updatedRoom: ChatRoom = {
                  ...existingRoom,
                  latestMessage: `${senderLabel}: ${displayContent}`,
                  latestTime: lastMsg.createdAt || lastMsg.timestamp,
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
  }, [selectedRoomId, profile.avatar, profile.id, profile.name, checkUnreadChats]);

  // Tick updates for our own bubbles, batched per room by the server.
  useEffect(() => {
    const unsubscribe = socketService.onMessageStatus(({ roomId, messageIds, kind }) => {
      if (!messageIds || messageIds.length === 0) return;
      const ids = new Set(messageIds);
      setTripMessages((prev) => {
        const roomKey = [roomId, `room-${roomId}`, roomId.replace(/^room-/, '')].find((k) => prev[k]);
        if (!roomKey) return prev;
        let changed = false;
        const next = prev[roomKey].map((m) => {
          if (!m.isMe || !ids.has(m.id)) return m;
          const merged = mergeStatus(m.status, kind);
          if (merged === m.status) return m;
          changed = true;
          return { ...m, status: merged };
        });
        return changed ? { ...prev, [roomKey]: next } : prev;
      });
    });
    return unsubscribe;
  }, []);

  // A message was deleted (by its sender, possibly on another device) —
  // remove it here too, in every room whose key this device might use.
  useEffect(() => {
    const unsubscribe = socketService.onMessageDeleted(({ roomId, messageId }) => {
      setTripMessages((prev) => {
        const roomKey = [roomId, `room-${roomId}`, roomId.replace(/^room-/, '')].find((k) => prev[k]);
        if (!roomKey) return prev;
        const next = prev[roomKey].filter((m) => m.id !== messageId);
        if (next.length === prev[roomKey].length) return prev;
        return { ...prev, [roomKey]: next };
      });
    });
    return unsubscribe;
  }, []);

  // Reset tab to chat when activeRoomId/selectedRoomId changes. react.dev's
  // documented pattern for this (compare against a ref during render, adjust
  // state if it changed) isn't compatible with the React Compiler running on
  // this codebase — it flags ref reads/writes during render as impure
  // (react-hooks/refs) — so this stays a plain effect. The cascading-render
  // cost the set-state-in-effect rule warns about is one extra render on
  // room switch, not a correctness issue.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOverlayTab('itinerary');
  }, [activeRoomId]);

  // Sync real-time socket messages from context to component's map state.
  // dbMembers/tripMessages/inboxRooms are each hydrated from their own REST
  // call elsewhere in this file too, so this can't be replaced with a pure
  // derivation of `messages` alone — it incrementally merges each arriving
  // socket message into whatever those calls already loaded.
  useEffect(() => {
    if (messages.length > 0) {
      const latestMsg = messages[messages.length - 1];
      if (!latestMsg || !latestMsg.id) return;
      if (lastProcessedSocketMsgIdRef.current === latestMsg.id) return;
      lastProcessedSocketMsgIdRef.current = latestMsg.id;

      const key = latestMsg.roomId || activeRoomId || 'unknown-room';
      // AppContext's Message type predates LOCATION messages; the real-time
      // socket payload carries mediaType 'LOCATION' plus latitude/longitude
      // when the backend sends one, so read those through a narrow cast.
      const latestMsgLoc = latestMsg as unknown as {
        mediaType?: 'NONE' | 'IMAGE' | 'VOICE' | 'LOCATION';
        latitude?: number | null;
        longitude?: number | null;
      };
      const latestMsgHasCoords = latestMsgLoc.latitude != null && latestMsgLoc.longitude != null;

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
              avatar: latestMsg.senderAvatar || latestMsg.avatar || '',
              role: 'Tourist',
            },
          ];
        });
      }

      // Someone else's message has now really reached this device.
      const isMineArriving =
        latestMsg.senderId === profile.id || !!(profile.name && latestMsg.senderName === profile.name);
      if (!isMineArriving && !isSystemMsg && latestMsg.id) {
        socketService.markDelivered(key, [latestMsg.id]);
      }

      setTripMessages((prev) => {
        const roomMsgs = prev[key] || [];
        if (roomMsgs.some((m) => m.id === latestMsg.id)) {
          return prev;
        }

        const isMe = latestMsg.senderId === profile.id || !!(profile.name && latestMsg.senderName === profile.name);
        const dupIdx = isMe
          ? roomMsgs.findIndex(
            (m) =>
              m.isMe &&
              (m.content === latestMsg.content || (m.type === 'image' && latestMsg.mediaType === 'IMAGE')) &&
              m.id.startsWith('msg-'),
          )
          : -1;

        if (dupIdx >= 0) {
          const updatedMsgs = [...roomMsgs];
          updatedMsgs[dupIdx] = {
            ...updatedMsgs[dupIdx],
            id: latestMsg.id,
            timestamp: latestMsg.createdAt || latestMsg.timestamp || updatedMsgs[dupIdx].timestamp,
            createdAt: latestMsg.createdAt || updatedMsgs[dupIdx].createdAt,
            mediaUrl: latestMsg.mediaUrl || updatedMsgs[dupIdx].mediaUrl,
          };
          return {
            ...prev,
            [key]: updatedMsgs,
          };
        }

        const memberMatch = dbMembers.find(
          (mb) => (latestMsg.senderId && mb.id === latestMsg.senderId) || mb.name === latestMsg.senderName,
        );
        const incomingAvatar = latestMsg.senderAvatar || latestMsg.avatar || memberMatch?.avatar || '';

        const isSos =
          (latestMsg.isSystem || latestMsg.mediaType === 'LOCATION') &&
          (latestMsg.content?.includes('Emergency alert') ||
           latestMsg.content?.includes('Emergency assistance') ||
           latestMsg.content?.includes('requested assistance') ||
           latestMsg.content?.includes('SOS'));

        const newMsgType: CustomMessage['type'] =
          isSos
            ? 'sos'
            : latestMsg.mediaType === 'IMAGE'
              ? 'image'
              : latestMsg.mediaType === 'VOICE'
                ? 'voice'
                : latestMsgLoc.mediaType === 'LOCATION' && latestMsgHasCoords
                  ? 'location'
                  : 'text';

        const newMsg: CustomMessage = {
          id: latestMsg.id,
          senderId: latestMsg.senderId,
          senderName: latestMsg.senderName,
          senderRole: latestMsg.senderRole,
          avatar: isMe ? (profile.avatar || incomingAvatar) : incomingAvatar,
          content: latestMsg.content,
          timestamp: latestMsg.createdAt || latestMsg.timestamp || new Date().toISOString(),
          createdAt: latestMsg.createdAt || latestMsg.timestamp || new Date().toISOString(),
          isMe: isMe,
          type: newMsgType,
          mediaUrl: latestMsg.mediaUrl,
          status: isMe && !isSystemMsg ? 'SENT' : null,
          ...(newMsgType === 'location'
            ? { locationCoords: { latitude: latestMsgLoc.latitude as number, longitude: latestMsgLoc.longitude as number } }
            : {}),
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
        const displayContent = latestMsg.mediaType === 'IMAGE'
          ? (latestMsg.content && !latestMsg.content.includes('📷') ? latestMsg.content : 'Photo')
          : latestMsg.content;
        const snippetText = `${senderLabel}: ${displayContent}`;

        const existingRoom = prevRooms.find((room) => room.id === key);
        const otherRooms = prevRooms.filter((room) => room.id !== key);

        const isCurrentRoom =
          Boolean(selectedRoomId && (key === selectedRoomId || key === `room-${selectedRoomId}` || selectedRoomId === `room-${key}`));
        const shouldMarkUnread = !isCurrentRoom && !isMe && !latestMsg.isSystem;

        if (existingRoom) {
          const updatedRoom: ChatRoom = {
            ...existingRoom,
            latestMessage: snippetText,
            latestTime: latestMsg.createdAt || latestMsg.timestamp || nowIso,
            unreadCount: isCurrentRoom ? 0 : (shouldMarkUnread ? (existingRoom.unreadCount || 0) + 1 : (existingRoom.unreadCount || 0)),
            lastMessageAt: nowIso,
          };
          return [updatedRoom, ...otherRooms];
        } else {
          // A brand-new pre-join enquiry thread's first-ever message — the
          // room can't be in inboxRooms yet since GET /chats has never seen
          // it. Synthesizing a placeholder here would flash it into the
          // organizer's Chat tab list for the moment before loadInboxRooms'
          // refetch filters it back out via isMyOrganizerInquiry. The
          // socket payload carries who the enquiry's organizer is, so this
          // can be recognized and skipped up front instead.
          const isMyNewOrganizerInquiry =
            !!latestMsg.inquiryTripId && !!profile.id && latestMsg.inquiryOrganizerId === profile.id;
          if (isMyNewOrganizerInquiry) {
            void loadInboxRooms();
            return prevRooms;
          }

          const roomType = key.includes('guide') ? 'GUIDE' : key.includes('dm') ? 'DM' : 'GROUP';
          const memberMatch = dbMembers.find(
            (mb) => (latestMsg.senderId && mb.id === latestMsg.senderId) || mb.name === latestMsg.senderName,
          );
          const roomAvatar = isMe
            ? (latestMsg.senderAvatar || latestMsg.avatar || profile.avatar)
            : (latestMsg.senderAvatar || latestMsg.avatar || memberMatch?.avatar || profile.avatar);
          const newRoom: ChatRoom = {
            id: key,
            tripId: selectedTripId,
            name: key.includes('group') ? 'New Group Chat' : latestMsg.senderName || 'New Chat',
            avatar: roomAvatar,
            type: roomType,
            latestMessage: snippetText,
            latestTime: latestMsg.createdAt || latestMsg.timestamp || nowIso,
            unreadCount: isCurrentRoom ? 0 : (shouldMarkUnread ? 1 : 0),
            badge: roomType === 'GUIDE' ? 'Guide' : roomType === 'DM' ? 'Direct' : 'Group Chat',
            lastMessageAt: nowIso,
          };
          if (!existingRoom) {
            void loadInboxRooms();
          }
          return [newRoom, ...otherRooms];
        }
      });
    }
  }, [messages, activeRoomId, profile.avatar, profile.id, profile.name, selectedTripId, dbMembers, loadInboxRooms]);

  // Filters for the Inbox List view
  const [inboxFilter, setInboxFilter] = useState<'ALL' | 'GROUPS' | 'GUIDES' | 'DMS'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Load trip members from database dynamically when selectedTripId or selectedRoomId changes
  useEffect(() => {
    if (selectedTripId) {
      apiService
        .getTripMembers(selectedTripId)
        .then((membersData) => {
          if (membersData && Array.isArray(membersData)) {
            const mapped = membersData.map((m) => ({
              // A pending companion has no account, so no id to match a
              // message sender against.
              id: m.userId ?? undefined,
              name: (m.name || '').replace(/\s*\((Creator|Organizer)\)\s*$/i, '').trim(),
              avatar: m.avatar || '',
              role: m.isCreator ? 'Organizer' : 'Tourist',
              isPendingCompanion: !!m.isPendingCompanion,
            }));
            setDbMembers(mapped);

            setTripMessages((prev) => {
              let changed = false;
              const updated: Record<string, CustomMessage[]> = {};
              Object.keys(prev).forEach((roomId) => {
                updated[roomId] = prev[roomId].map((msg) => {
                  if (!msg.avatar) {
                    const resolved = findMemberAvatar(msg.senderId, msg.senderName, msg.senderRole, mapped);
                    if (resolved) {
                      changed = true;
                      return { ...msg, avatar: resolved };
                    }
                  }
                  return msg;
                });
              });
              return changed ? updated : prev;
            });
          } else {
            setDbMembers([]);
          }
        })
        .catch((err) => {
          logger.warn('Failed to fetch trip members:', err);
          setDbMembers([]);
        });
    } else if (selectedRoomId) {
      apiService
        .getChatDetails(selectedRoomId)
        .then((roomDetails: any) => {
          if (roomDetails && Array.isArray(roomDetails.members)) {
            const mapped = roomDetails.members.map((m: any) => ({
              id: m.id,
              name: m.name,
              avatar: m.avatar || '',
              role: m.role || 'Tourist',
            }));
            setDbMembers(mapped);

            setTripMessages((prev) => {
              let changed = false;
              const updated: Record<string, CustomMessage[]> = {};
              Object.keys(prev).forEach((roomId) => {
                updated[roomId] = prev[roomId].map((msg) => {
                  if (!msg.avatar) {
                    const resolved = findMemberAvatar(msg.senderId, msg.senderName, msg.senderRole, mapped);
                    if (resolved) {
                      changed = true;
                      return { ...msg, avatar: resolved };
                    }
                  }
                  return msg;
                });
              });
              return changed ? updated : prev;
            });

            if (roomDetails && roomDetails.name) {
              setInboxRooms((prev) => {
                if (prev.some((r) => r.id === roomDetails.id)) return prev;
                const newRoom: ChatRoom = {
                  id: roomDetails.id,
                  tripId: roomDetails.tripId ?? '',
                  name: roomDetails.name,
                  avatar: roomDetails.avatar,
                  type: roomDetails.type === 'GROUP' ? 'GROUP' : 'DM',
                  latestMessage: '',
                  latestTime: new Date().toISOString(),
                  unreadCount: 0,
                  badge: roomDetails.type === 'GROUP' ? 'Group Chat' : 'Direct',
                  lastMessageAt: new Date().toISOString(),
                  // Carried through, or this endpoint becomes a side door
                  // that files an enquiry thread in the chat inbox as a
                  // plain DM — the inbox filter has nothing to go on
                  // otherwise.
                  inquiryTripId: roomDetails.inquiryTripId ?? null,
                  isMyOrganizerInquiry: !!roomDetails.isMyOrganizerInquiry,
                };
                return [newRoom, ...prev];
              });
            }
          }
        })
        .catch((err) => {
          logger.warn('Failed to fetch room details for members:', err);
        });
    }
  }, [selectedTripId, selectedRoomId]);

  // Bottom attachments overlay
  const [isAttachmentOpen, setIsAttachmentOpen] = useState(false);
  const attachPanelHeight = useState(() => new Animated.Value(0))[0];

  // Emoji picker drawer state
  const [isEmojiPickerOpen, setIsEmojiPickerOpen] = useState(false);
  const [selectedEmojiCategory, setSelectedEmojiCategory] = useState('popular');
  useEffect(() => {
    setIsEmojiPickerOpen(false);
  }, [selectedRoomId]);

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
    if (!isLoggedIn) {
      setInboxRooms([]);
      return;
    }
    // Only synchronize trips where the user is actually confirmed or creator
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInboxRooms((prevRooms) => {
      const myTrips = trips.filter((t) => t.isMyTrip || (profile.id && t.creatorId === profile.id));
      const missingTrips = myTrips.filter((t) => !prevRooms.some((r) => r.tripId === t.id));
      if (missingTrips.length === 0) return prevRooms;

      const newRooms: ChatRoom[] = missingTrips.map((t) => ({
        id: t.chatRoomId || `room-${t.id}`,
        tripId: t.id,
        name: t.name.includes('Chat') || t.name.includes('Group') ? t.name : `${t.name} Group Chat`,
        avatar: t.coverImage || 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=150&q=80',
        type: 'GROUP',
        // A room nobody has posted in has no latest message — saying
        // "System: Welcome to the group chat!" put words in a System
        // sender's mouth for a message that was never sent.
        latestMessage: '',
        latestTime: (t as any).lastMessageAt || (t as any).createdAt || '',
        unreadCount: 0,
        badge: t.creatorId === profile.id ? 'Organizer Trip' : 'Member',
        myRole: t.creatorId === profile.id ? 'Organizer' : 'Member',
        // Use the trip's real last-activity time so we don't bump it to the
        // top just because the trips list refreshed. Fall back to createdAt,
        // and ultimately to epoch so the room sorts below any room that has
        // real messages.
        lastMessageAt: (t as any).lastMessageAt || (t as any).createdAt || '1970-01-01T00:00:00.000Z',
      }));

      return [...prevRooms, ...newRooms];
    });
  }, [isLoggedIn, trips, profile.id]);

  // Input states
  const [inputText, setInputText] = useState('');

  const handleSelectEmoji = useCallback((emoji: string) => {
    setInputText((prev) => prev + emoji);
  }, []);

  const handleEmojiBackspace = useCallback(() => {
    setInputText((prev) => {
      if (!prev) return '';
      const chars = Array.from(prev);
      chars.pop();
      return chars.join('');
    });
  }, []);
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
  const [messageInfoOpen, setMessageInfoOpen] = useState(false);
  const [messageInfoRows, setMessageInfoRows] = useState<MessageAudienceEntry[] | null>(null);
  const [messageInfoLoading, setMessageInfoLoading] = useState(false);
  const [messageInfoError, setMessageInfoError] = useState<string | null>(null);
  const [selectedRoomForOptions, setSelectedRoomForOptions] = useState<ChatRoom | null>(null);
  const [viewerImageUri, setViewerImageUri] = useState<string | null>(null);
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
    messageListRef.current?.scrollToOffset({ offset: 0, animated });
  }, []);

  // Hardware/System Back Button Handler:
  // When inside a particular chat, pressing the system back button directs back to the chat list screen
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        // 1. Close full-screen image viewer if open
        if (viewerImageUri) {
          setViewerImageUri(null);
          return true;
        }

        // 2. Close message options overlay if open
        if (selectedMessageForOptions) {
          setSelectedMessageForOptions(null);
          return true;
        }

        // 3. Close room options modal if open
        if (selectedRoomForOptions) {
          setSelectedRoomForOptions(null);
          return true;
        }

        // 4. Close keyboard drawers / reply preview
        if (isEmojiPickerOpen) {
          setIsEmojiPickerOpen(false);
          return true;
        }
        if (isAttachmentOpen) {
          setIsAttachmentOpen(false);
          return true;
        }
        if (replyingToMessage) {
          setReplyingToMessage(null);
          return true;
        }

        // 5. Close settings drawer if open
        if (isSettingsOpen) {
          setIsSettingsOpen(false);
          return true;
        }

        // 6. Close itinerary / trip modals if open
        if (itineraryModalMode !== 'NONE') {
          setItineraryModalMode('NONE');
          return true;
        }
        if (isEditTripModalOpen) {
          setIsEditTripModalOpen(false);
          return true;
        }

        // 7. If inside a particular chat screen, return to the chat list screen
        if (selectedRoomId) {
          const leavingRoomId = selectedRoomId;
          let noneUnreadLeft = false;
          setInboxRooms((prev) => {
            const updated = prev.map((r) =>
              r.id === leavingRoomId || `room-${r.id}` === leavingRoomId || r.id === `room-${leavingRoomId}`
                ? { ...r, unreadCount: 0 }
                : r,
            );
            if (!updated.some((r) => r.unreadCount > 0)) noneUnreadLeft = true;
            return updated;
          });
          if (noneUnreadLeft) clearChatUnread();
          setSelectedRoomId(null);
          setUnreadSessionCount(0);
          return true;
        }

        // Otherwise on the chat list screen, let default system back handler proceed
        return false;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [
      viewerImageUri,
      selectedMessageForOptions,
      selectedRoomForOptions,
      isEmojiPickerOpen,
      isAttachmentOpen,
      replyingToMessage,
      isSettingsOpen,
      itineraryModalMode,
      isEditTripModalOpen,
      selectedRoomId,
      setSelectedRoomId,
    ])
  );

  // Fetch current active trip data
  // The real trip for the open room, or null. This used to fall back to a
  // hardcoded "Ranchi to Vrindavan" trip — invented cities, dates, meeting
  // point and a ₹8,500 budget — which every panel below then rendered as
  // this room's actual trip details (docs/REMEDIATION.md §0.2 rule 4).
  const activeTrip = trips.find((t) => t.id === selectedTripId) ?? null;

  // People actually in this group, which is not the same as seats taken.
  // The header used to prefer `activeTrip.membersCount`, which the server
  // derives as totalSeats - availableSeats — so a Family Connect booking for
  // three consumed three seats and the header claimed five members when only
  // three people were here. The unjoined companions of a party booking are
  // listed separately, and are not counted as present.
  const joinedMembers = useMemo(
    () => dbMembers.filter((m) => !m.isPendingCompanion),
    [dbMembers],
  );
  const pendingCompanions = useMemo(
    () => dbMembers.filter((m) => m.isPendingCompanion),
    [dbMembers],
  );
  const joinedMemberCount = joinedMembers.length || activeTrip?.membersCount || 1;

  // Of those people, the ones with a live connection right now. Always at
  // least 1, since the person reading this is by definition connected.
  const onlineMemberCount = useMemo(() => {
    const online = joinedMembers.filter((m) => m.id && onlineUserIds.has(m.id)).length;
    return Math.max(1, online);
  }, [joinedMembers, onlineUserIds]);

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
      .then((res) => {
        setChatItinerary(res?.days ?? []);
        if (typeof res?.canEdit === 'boolean') {
          setCanEditItinerary(res.canEdit);
        }
      })
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
  const currentMessages = useMemo(() => {
    const rawMsgs = tripMessages[selectedRoomId || selectedTripId] || [];
    return rawMsgs.map((msg) => {
      const resolved = msg.isMe
        ? (profile.avatar || msg.avatar || findMemberAvatar(msg.senderId, msg.senderName, msg.senderRole, dbMembers))
        : (msg.avatar || findMemberAvatar(msg.senderId, msg.senderName, msg.senderRole, dbMembers));
      return resolved && resolved !== msg.avatar ? { ...msg, avatar: resolved } : msg;
    });
  }, [tripMessages, selectedRoomId, selectedTripId, dbMembers, profile.avatar]);

  const reversedMessages = useMemo(() => {
    return [...currentMessages].reverse();
  }, [currentMessages]);

  // Dynamically extract group members from message history in this room/trip
  const groupMembers = useMemo(() => {
    const membersMap = new Map<
      string,
      { name: string; avatar: string; role: string; id?: string; isMe?: boolean; isPendingCompanion?: boolean }
    >();

    // Add database/real-time members
    if (dbMembers && dbMembers.length > 0) {
      dbMembers.forEach((m) => {
        if (m.role === "SYSTEM" || m.name?.trim().toLowerCase() === "system" || m.id === "system") return;
        // Normalize role name
        let roleName = m.role || 'Tourist';
        if (roleName === 'TOURIST' || roleName === 'MEMBER') roleName = 'Tourist';
        if (roleName === 'ORGANIZER') roleName = 'Organizer';
        if (roleName === 'GUIDE') roleName = 'Guide';

        const cleanName = (m.name || '').replace(/\s*\((Creator|Organizer)\)\s*$/i, '').trim();
        const isMe =
          (m.id && profile.id && m.id === profile.id) ||
          (profile.name && cleanName.toLowerCase() === profile.name.trim().toLowerCase());

        membersMap.set(cleanName, {
          name: cleanName,
          avatar: isMe ? profile.avatar || m.avatar : m.avatar,
          role: roleName,
          id: m.id,
          isMe: !!isMe,
          isPendingCompanion: !!m.isPendingCompanion,
        });
      });
    }

    // Add other senders from the current active messages
    currentMessages.forEach((msg) => {
      const isSystem = msg.senderRole === "SYSTEM" || msg.senderName === "System" || msg.senderId === "system";
      if (isSystem) return;
      if (msg.senderName && !msg.isMe) {
        const cleanSender = (msg.senderName || '').replace(/\s*\((Creator|Organizer)\)\s*$/i, '').trim();
        if (cleanSender.toLowerCase() === "system") return;
        // Only add if not already present to avoid overriding database entries
        if (!membersMap.has(cleanSender)) {
          membersMap.set(cleanSender, {
            name: cleanSender,
            avatar: msg.avatar || '',
            role: msg.senderRole || 'Tourist',
            id: msg.senderId,
            isMe: false,
          });
        }
      }
    });

    // No fallback static member list here. A group with no database
    // members yet and no message history genuinely has nobody else in it
    // — the member/settings UI below renders that as a real "just you"
    // state rather than four fabricated tourists (Neha Sharma, Vikram
    // Singh, Suman Gupta, Aditya Sen) that used to appear in every empty
    // group regardless of who was actually in it.

    return Array.from(membersMap.values()).filter((m) => m.role !== "SYSTEM" && m.name.toLowerCase() !== "system" && m.id !== "system");
  }, [currentMessages, dbMembers, profile.id, profile.name, profile.avatar]);

  // The other side of a DM/guide room — for the non-group Settings panel's
  // contact card. Reuses groupMembers (already populated from the room's
  // real member data) rather than refetching anything.
  const otherParticipant = useMemo(() => groupMembers.find((m) => !m.isMe) ?? null, [groupMembers]);

  // Click a member to direct message
  const handleMemberClick = (member: { name: string; avatar: string; id?: string }) => {
    setIsSettingsOpen(false); // Close settings panel
    handleStartDirectMessage(member.id, member.name);
  };

  // Trip Editing Handlers
  const handleOpenEditTrip = () => {
    if (activeTrip) {
      setTripEditForm({
        name: activeTrip.name,
        meetingPoint: activeTrip.meetingPoint || '',
        budget: String(activeTrip.budget || ''),
      });
      setIsEditTripModalOpen(true);
    }
  };

  const handleSaveTrip = async () => {
    if (!activeTrip) return;
    if (!tripEditForm.name.trim()) {
      toast('Please enter a trip name', 'error');
      return;
    }
    setIsSavingTrip(true);
    try {
      const budgetNum = parseFloat(tripEditForm.budget);
      const res = await apiService.updateTrip(activeTrip.id, {
        name: tripEditForm.name.trim(),
        meetingPoint: tripEditForm.meetingPoint.trim() || undefined,
        budget: isNaN(budgetNum) ? undefined : budgetNum,
      });
      if (res) {
        toast('Trip details updated successfully!', 'success');
        refreshTrips();
        setIsEditTripModalOpen(false);
      }
    } catch (e) {
      logger.warn('[Chat] Failed to update trip:', e);
      toast('Failed to save trip updates', 'error');
    } finally {
      setIsSavingTrip(false);
    }
  };

  // Itinerary Day Editing Handlers
  const handleOpenAddDay = () => {
    setEditingDayId(null);
    setItineraryDayForm({ title: '', plan: '' });
    setItineraryModalMode('ADD');
  };

  const handleOpenEditDay = (day: { id: string; title: string; plan: string }) => {
    setEditingDayId(day.id);
    setItineraryDayForm({ title: day.title, plan: day.plan });
    setItineraryModalMode('EDIT');
  };

  const handleSaveDay = async () => {
    if (!selectedTripId) return;
    if (!itineraryDayForm.title.trim()) {
      toast('Please provide a day heading', 'error');
      return;
    }
    setIsSavingDay(true);
    try {
      if (itineraryModalMode === 'ADD') {
        const res = await apiService.addTripItineraryDay(selectedTripId, {
          title: itineraryDayForm.title.trim(),
          plan: itineraryDayForm.plan.trim(),
        });
        if (res) {
          toast('Itinerary day added!', 'success');
          const updated = await apiService.getTripItinerary(selectedTripId);
          setChatItinerary(updated?.days ?? []);
          setItineraryModalMode('NONE');
        }
      } else if (itineraryModalMode === 'EDIT' && editingDayId) {
        const res = await apiService.updateTripItineraryDay(selectedTripId, editingDayId, {
          title: itineraryDayForm.title.trim(),
          plan: itineraryDayForm.plan.trim(),
        });
        if (res) {
          toast('Itinerary day updated!', 'success');
          const updated = await apiService.getTripItinerary(selectedTripId);
          setChatItinerary(updated?.days ?? []);
          setItineraryModalMode('NONE');
        }
      }
    } catch (e) {
      logger.warn('[Chat] Failed to save itinerary day:', e);
      toast('Could not save itinerary day', 'error');
    } finally {
      setIsSavingDay(false);
    }
  };

  const handleDeleteDay = async (dayId: string) => {
    if (!selectedTripId) return;
    const ok = await confirm({
      title: 'Delete Itinerary Day',
      message: 'Are you sure you want to remove this day from the itinerary?',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    try {
      await apiService.deleteTripItineraryDay(selectedTripId, dayId);
      toast('Itinerary day removed', 'success');
      const updated = await apiService.getTripItinerary(selectedTripId);
      setChatItinerary(updated?.days ?? []);
    } catch (e) {
      logger.warn('[Chat] Failed to delete itinerary day:', e);
      toast('Failed to delete day', 'error');
    }
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


  const scrollToInitialFocus = useCallback(() => {
    if (!selectedRoomId) return;

    // Inverted FlatList shows latest messages at offset 0 by default
    messageListRef.current?.scrollToOffset({ offset: 0, animated: false });
    setIsChatContentReady(true);
    initialScrollDoneRoomRef.current = selectedRoomId;
  }, [selectedRoomId]);

  useEffect(() => {
    if (selectedRoomId) {
      scrollToInitialFocus();
    }
  }, [selectedRoomId, scrollToInitialFocus]);

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

  // Focuses the live map on a message's real coordinates (shared location or
  // SOS pin) instead of just opening the map with nothing centered.
  const handleOpenMapForMessage = (msg: CustomMessage) => {
    const coords = msg.locationCoords;
    if (coords) {
      router.push({
        pathname: '/map',
        params: { focusLat: String(coords.latitude), focusLng: String(coords.longitude), focusLabel: msg.content },
      });
    } else {
      router.navigate('/map');
    }
  };

  // Hands the pin to the device's real navigation app. The universal Google
  // Maps link resolves to the native app on both platforms when it is present.
  const handleOpenInExternalMaps = async (msg: CustomMessage) => {
    const coords = msg.locationCoords;
    if (!coords) {
      toast(t('chat.noCoordinatesToOpen'), 'error');
      return;
    }
    const url = `https://www.google.com/maps/search/?api=1&query=${coords.latitude},${coords.longitude}`;
    try {
      await Linking.openURL(url);
    } catch (e) {
      logger.warn('[Chat] Opening external maps failed:', e);
      toast(t('chat.couldNotOpenMapsApp'), 'error');
    }
  };

  // Sender-only audience view, so two grey ticks on a group message stay legible.
  const handleShowMessageInfo = async (msg: CustomMessage) => {
    const roomId = selectedRoomId;
    if (!roomId) return;
    setSelectedMessageForOptions(null);
    setMessageInfoOpen(true);
    setMessageInfoLoading(true);
    setMessageInfoRows(null);
    setMessageInfoError(null);
    try {
      const rows = await apiService.getMessageInfo(roomId, msg.id);
      setMessageInfoRows(rows ?? []);
    } catch (e) {
      logger.warn('[Chat] Message info failed:', e);
      setMessageInfoError(errorToastMessage(e, t('chat.messageInfoFailed')));
    } finally {
      setMessageInfoLoading(false);
    }
  };

  // Core send message handler
  const sendNewMessage = (msgData: Partial<CustomMessage>) => {
    const key = selectedRoomId || selectedTripId;
    const mediaType =
      msgData.type === 'image'
        ? 'IMAGE'
        : msgData.type === 'voice'
          ? 'VOICE'
          : msgData.type === 'location'
            ? 'LOCATION'
            : 'NONE';
    const coords = msgData.type === 'location' && msgData.locationCoords ? msgData.locationCoords : null;

    // Call global websocket sender with mediaUrl (and coords for LOCATION messages)
    sendMessage(msgData.content || '', mediaType, msgData.mediaUrl, coords);

    const nowIso = new Date().toISOString();
    const newMsg: CustomMessage = {
      id: `msg-${Date.now()}`,
      senderId: profile.id,
      senderName: profile.name,
      senderRole: profile.role === 'TOURIST' ? 'Tourist' : 'Organizer',
      avatar: profile.avatar,
      content: msgData.content || '',
      timestamp: nowIso,
      createdAt: nowIso,
      isMe: true,
      mediaUrl: msgData.mediaUrl,
      status: 'SENT',
      ...msgData,
    };

    // Update messages map
    setTripMessages((prev) => ({
      ...prev,
      [key]: [...(prev[key] || []), newMsg],
    }));

    // Update the WhatsApp Inbox snippet text dynamically and move room to index 0 (TOP)!
    setInboxRooms((prevRooms) => {
      const existingRoom = prevRooms.find((r) => r.id === selectedRoomId);
      const otherRooms = prevRooms.filter((r) => r.id !== selectedRoomId);

      if (existingRoom) {
        const displaySnippet = msgData.type === 'image'
          ? (msgData.content && !msgData.content.includes('📷') ? msgData.content : 'Photo')
          : (msgData.content || 'Attachment shared');
        const updatedRoom: ChatRoom = {
          ...existingRoom,
          latestMessage: `You: ${displaySnippet}`,
          latestTime: nowIso,
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
      setTripMessages((prev) => {
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
      if (activeRoomId === roomId || selectedRoomId === roomId) {
        setActiveRoomId(null);
        setSelectedRoomId(null);
        setSelectedTripId('');
      }
      toast(t("chat.leftGroupSuccess", "Left the group successfully"), "success");
    } catch (e) {
      logger.warn("[Chat] Leave room failed:", e);
      setInboxRooms((prev) => prev.filter((r) => r.id !== roomId));
      toast(errorToastMessage(e, "Could not leave the group. Please try again."), "error");
    }
  };

  const handleDeleteChatRoom = async (roomId: string) => {
    try {
      await apiService.deleteChatRoom(roomId);
      setInboxRooms((prev) => prev.filter((r) => r.id !== roomId));
      setTripMessages((prev) => {
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
      if (activeRoomId === roomId || selectedRoomId === roomId) {
        setActiveRoomId(null);
        setSelectedRoomId(null);
        setSelectedTripId('');
      }
      toast(t("chat.chatDeletedSuccess", "Chat deleted successfully"), "success");
    } catch (e) {
      logger.warn("[Chat] Delete chat failed:", e);
      setInboxRooms((prev) => prev.filter((r) => r.id !== roomId));
      toast(errorToastMessage(e, "Could not delete chat. Please try again."), "error");
    }
  };

  // Per-user, per-room notification mute (POST /chats/:id/mute). Optimistic
  // toggle with rollback on failure, matching this file's other API-backed
  // toggles (e.g. markChatRead above).
  const handleToggleRoomMuted = (roomId: string, nextMuted: boolean) => {
    setInboxRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, muted: nextMuted } : r)));
    apiService.setChatRoomMuted(roomId, nextMuted).catch((e) => {
      logger.warn('[Chat] Set muted failed:', e);
      setInboxRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, muted: !nextMuted } : r)));
      toast(errorToastMessage(e, 'Could not update notification settings. Please try again.'), 'error');
    });
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
    const roomId = selectedRoomId;
    setSelectedMessageForOptions(null);

    let removed: CustomMessage | undefined;
    let removedIndex = -1;
    setTripMessages((prev) => {
      const list = prev[key] || [];
      removedIndex = list.findIndex((m) => m.id === msgId);
      removed = list[removedIndex];
      return {
        ...prev,
        [key]: list.filter((m) => m.id !== msgId),
      };
    });

    if (!roomId) return; // No real room to tell the server about — nothing was ever sent.

    // The optimistic removal above is rolled back on failure, the same rule
    // every other delete/create in this app follows — a message that is
    // still on the server (and still visible to everyone else) must not
    // silently disappear from just this one screen.
    void apiService.deleteMessage(roomId, msgId).catch((e) => {
      logger.warn('[Chat] Delete message failed, restoring it:', e);
      if (removed) {
        const restoredMsg = removed;
        setTripMessages((prev) => {
          const list = prev[key] || [];
          const next = [...list];
          next.splice(Math.min(removedIndex, next.length), 0, restoredMsg);
          return { ...prev, [key]: next };
        });
      }
      toast(errorToastMessage(e, "Couldn't delete this message. Please try again."), 'error');
    });
  };

  // Start (or reopen) a real 1:1 DM thread with a group member, backed by
  // POST /chats/dm — the server returns the same room on a repeat tap
  // instead of spawning duplicates.
  const handleStartDirectMessage = async (senderId: string | undefined, senderName: string) => {
    setSelectedMessageForOptions(null);
    if (!senderId || senderId === profile.id) return;
    try {
      const thread = await apiService.openDirectMessage(senderId);
      if (!thread) throw new Error('No thread returned');
      await loadInboxRooms();
      setSelectedRoomId(thread.chatRoomId);
    } catch (e) {
      toast(errorToastMessage(e, t('chat.directMessageUnavailable')), 'error');
    }
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
      recordConsent('PHOTOS', !!permissionResult?.granted);
      if (!permissionResult?.granted) {
        await showAlert('Permission required', 'Allow photo access to send a picture to this group.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.7,
        base64: true,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      if (!asset) return;

      const contentType =
        asset.mimeType === 'image/png' || asset.mimeType === 'image/webp' ? asset.mimeType : 'image/jpeg';

      setPhotoUploading(true);
      let mediaUrl = asset.uri;

      try {
        const { uploadUrl, publicUrl } = await apiService.getChatMediaUploadUrl(contentType);
        await uploadFileToUrl(asset.uri, uploadUrl, contentType);
        if (publicUrl) mediaUrl = publicUrl;
      } catch (uploadErr) {
        logger.warn('[Chat] Remote storage upload not available; using data/local photo:', uploadErr);
        if (asset.base64) {
          mediaUrl = `data:${contentType};base64,${asset.base64}`;
        } else {
          mediaUrl = asset.uri;
        }
      }

      sendNewMessage({
        content: '',
        type: 'image',
        mediaUrl,
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
    const location = await getEmergencyDeviceLocation();
    if (!location.ok) {
      const message =
        location.reason === 'PERMISSION_DENIED'
          ? 'Location permission is required to send an accurate SOS. Please enable it and try again, or call 112 directly.'
          : 'Could not get your current location. Please try again, or call 112 directly.';
      toast(message, 'error');
      return;
    }
    const { latitude: lat, longitude: lng } = location;

    // A bare "needs help" tells responders nothing. Optional on purpose:
    // dismissing this still sends the alert, because an emergency must not
    // hinge on someone completing a dialog.
    const detail = await showPrompt({
      title: t('sos.whatsWrongTitle', "What's wrong?"),
      message: t('sos.whatsWrongMessage', 'This shows in the alert everyone receives. You can skip it.'),
      placeholder: t('sos.whatsWrongPlaceholder', 'e.g. Injured, need help near the ridge'),
      confirmLabel: t('sos.sendAlert', 'Send alert'),
    });

    triggerSOS(lat, lng, {
      accuracyMeters: location.accuracyMeters ?? null,
      capturedAt: location.capturedAt,
      isStale: location.isStale ?? false,
      message: detail?.trim() || undefined,
    });
    if (location.isStale) {
      toast(t('chat.sosSentWithLastKnown'), 'info');
    }

    const issueText = detail?.trim();
    const sosMessage: CustomMessage = {
      id: `sos-gen-${Date.now()}`,
      type: 'sos',
      content: issueText
        ? `Emergency assistance requested by ${profile.name}. Reason: ${issueText}`
        : `Emergency assistance requested by ${profile.name}. Immediate assistance required.`,
      sosReason: issueText || undefined,
      locationCoords: { latitude: lat, longitude: lng },
      resolved: false,
      senderId: profile.id,
      senderName: profile.name,
      senderRole: 'Tourist',
      avatar: profile.avatar,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
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
            latestMessage: issueText
              ? `Emergency SOS: ${profile.name} — ${issueText}`
              : `Emergency SOS: ${profile.name}`,
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

  // A pre-join enquiry thread belongs solely in the organizer portal's
  // Chats & Approvals tab (group-organizer.tsx) when *this* user is the
  // trip's organizer being asked — it must never reach the Chat tab. The
  // traveller on the other end of that same thread still sees it here like
  // any other DM, since for them it is just a chat.
  //
  // Two independent signals, because either one alone has a blind spot:
  // the server's own `isMyOrganizerInquiry` is absent on a room this client
  // learned about before that field existed (or from an older server), and
  // the trips lookup misses a trip the list has not loaded yet. A room only
  // has to trip one of them to be kept out.
  const isOrganizerEnquiryRoom = useCallback(
    (room: Pick<ChatRoom, 'isMyOrganizerInquiry' | 'inquiryTripId'>) => {
      if (room.isMyOrganizerInquiry) return true;
      if (!room.inquiryTripId || !profile.id) return false;
      return trips.some((t) => t.id === room.inquiryTripId && t.creatorId === profile.id);
    },
    [trips, profile.id],
  );

  // Filtered and sorted rooms listing (pins at the top!)
  const filteredRooms = useMemo(() => {
    return inboxRooms
      .filter((room) => {
        if (isOrganizerEnquiryRoom(room)) return false;

        const matchesSearch =
          room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          room.latestMessage.toLowerCase().includes(searchQuery.toLowerCase());

        if (!matchesSearch) return false;

        if (inboxFilter === 'ALL') return true;
        if (inboxFilter === 'GROUPS') return room.type === 'GROUP';
        if (inboxFilter === 'GUIDES') return room.type === 'GUIDE';
        if (inboxFilter === 'DMS') return room.type === 'DM';

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
  }, [inboxRooms, searchQuery, inboxFilter, pinnedRoomIds, isOrganizerEnquiryRoom]);

  // Find Room info of the selected room
  let activeRoom = inboxRooms.find((r) => r.id === selectedRoomId);
  if (!activeRoom && selectedRoomId) {
    if (!isLoggedIn) {
      setSelectedRoomId(null);
    } else {
      const matchedTrip = trips.find(
        (t) =>
          (t.isMyTrip || t.creatorId === profile.id) &&
          (t.chatRoomId === selectedRoomId || `room-${t.id}` === selectedRoomId),
      );
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
          latestMessage: '',
          latestTime: (matchedTrip as any).lastMessageAt || (matchedTrip as any).createdAt || '',
          unreadCount: 0,
          badge: 'Member',
        };
      }
    }
  }

  // Fixed alias so the Settings overlay JSX/closures below narrow on a
  // `const` rather than the reassignable `activeRoom` above.
  const settingsRoom = activeRoom;

  const isDM = !!activeRoom && activeRoom.type !== 'GROUP';
  const dmTrip =
    isDM
      ? trips.find((t) => t.id === activeRoom?.tripId) ||
      trips.find((t) => t.id === selectedTripId) ||
      trips.find((t) => t.creator?.trim().toLowerCase() === activeRoom?.name?.trim().toLowerCase()) ||
      null
      : null;

  const handleOpenTripGroup = () => {
    if (!dmTrip) return;
    const existingGroup = inboxRooms.find((r) => r.tripId === dmTrip.id && r.type === 'GROUP');
    const targetRoomId = existingGroup ? existingGroup.id : dmTrip.chatRoomId || `room-${dmTrip.id}`;
    setSelectedTripId(dmTrip.id);
    setSelectedRoomId(targetRoomId);
    setActiveRoomId(targetRoomId);
    setIsSettingsOpen(false);
  };

  // --- SCREEN 0: GUEST SIGN-IN REQUIRED VIEW ---
  if (!isLoggedIn) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.inboxContainer}>
        {/* WhatsApp-Style Header */}
        <View style={styles.inboxHeader}>
          <Text style={styles.inboxHeaderTitle}>{t('chat.travelStarChats')}</Text>
        </View>

        <ScreenEmpty
          title={t('chat.signInToChat', 'Sign in to access your chats')}
          message={t('chat.signInToChatMessage', 'Connect with your travel buddies and local guides once you sign in.')}
          actionLabel={t('chat.signIn', 'Sign In')}
          onAction={() => router.push('/auth')}
        />
      </SafeAreaView>
    );
  }

  // --- SCREEN 1: WHATSAPP-STYLE INBOX LIST VIEW ---
  if (!selectedRoomId) {
    return (
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.inboxContainer}>
        {/* WhatsApp-Style Header */}
        <View style={styles.inboxHeader}>
          <Text style={styles.inboxHeaderTitle}>{t('chat.travelStarChats')}</Text>
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
              { key: 'DMS', labelKey: 'chat.filterDMs' },
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
            accessibilityLabel={
              activeSOS.message
                ? `${activeSOS.userName}: ${activeSOS.message}`
                : t('chat.sosLocateHint', { name: activeSOS.userName })
            }
          >
            <View style={styles.safetyTickerLeft}>
              <View style={styles.safetyTickerIconCircle}>
                <AlertTriangle size={15} color="#FFF" />
              </View>
              <View style={styles.safetyTickerTextWrap}>
                <View style={styles.safetyTickerHeaderRow}>
                  <Text style={styles.safetyTickerBadgeText}>
                    {t('chat.criticalSosAlert', 'CRITICAL SOS ALERT')}
                  </Text>
                  <Text style={styles.safetyTickerUserText} numberOfLines={1}>
                    • {activeSOS.userName}
                  </Text>
                </View>
                {activeSOS.message ? (
                  <Text style={styles.safetyTickerReasonText} numberOfLines={1}>
                    {t('chat.issueLabel', 'Issue')}: {activeSOS.message}
                  </Text>
                ) : (
                  <Text style={styles.safetyTickerReasonText} numberOfLines={1}>
                    {t('chat.sosLocateHint', { name: activeSOS.userName })}
                  </Text>
                )}
              </View>
            </View>
            {((activeSOS.userId && profile.id && activeSOS.userId === profile.id) ||
              (!activeSOS.userId && profile.name && activeSOS.userName === profile.name) ||
              activeSOS.userName === profile.name) && (
              <TouchableOpacity
                style={styles.safetyTickerSafeBtn}
                onPress={handleResolveSOSEvent}
                accessibilityRole="button"
                accessibilityLabel={t('chat.markAsSafe', "I'm safe")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <ShieldCheck size={13} color="#065F46" strokeWidth={2.6} />
                <Text style={styles.safetyTickerSafeText}>{t('chat.safe', "I'm safe")}</Text>
              </TouchableOpacity>
            )}
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
          {filteredRooms.length > 0 ? (
            filteredRooms.map((room) => {
              const hasUnread = room.unreadCount > 0;

              return (
                <TouchableOpacity
                  key={room.id}
                  style={[styles.roomItemTouch, room.type === 'GROUP' && styles.roomItemTouchGroup]}
                  onPress={() => {
                    setUnreadSessionCount(room.unreadCount || 0);
                    setIsChatContentReady(true);
                    initialScrollDoneRoomRef.current = null;
                    let noneUnreadLeft = false;
                    setInboxRooms((prev) => {
                      const updated = prev.map((r) =>
                        r.id === room.id || `room-${r.id}` === room.id || r.id === `room-${room.id}` || (room.tripId && r.tripId === room.tripId)
                          ? { ...r, unreadCount: 0 }
                          : r,
                      );
                      if (!updated.some((r) => r.unreadCount > 0)) noneUnreadLeft = true;
                      return updated;
                    });
                    if (noneUnreadLeft) clearChatUnread();
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
                    <Avatar
                      uri={room.avatar || findMemberAvatar(undefined, room.name, undefined, dbMembers)}
                      name={room.name}
                      size={48}
                      style={[styles.roomAvatarImg, room.type === 'GROUP' && styles.roomAvatarImgGroup]}
                    />
                    {room.type === 'GROUP' && (
                      <View style={styles.groupBadgeMini}>
                        <UsersIcon size={10} color="#FFFFFF" />
                      </View>
                    )}
                  </View>

                  {/* Info Center */}
                  <View style={styles.roomMetaWrap}>
                    {/* Derive role live from trips so it's always accurate */}
                    {(() => {
                      const tripForRoom = room.type === 'GROUP'
                        ? trips.find((t) => t.id === room.tripId)
                        : null;
                      const liveRole = tripForRoom
                        ? (tripForRoom.creatorId === profile.id ? 'Organizer' : 'Member')
                        : (room.myRole || null);

                      return (
                        <>
                          {/* Row 1: name (+ role pill hugging it) | spacer | time */}
                          <View style={styles.roomNameRow}>
                            {/* Left: name + pill — pill hugs name, does NOT stretch */}
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 4, overflow: 'hidden', marginRight: 8 }}>
                              <Text style={[styles.roomNameText, { flex: 0, flexShrink: 1 }]} numberOfLines={1}>
                                {room.name}
                              </Text>
                              {/* GROUP: role pill right beside the name */}
                              {room.type === 'GROUP' && liveRole && (
                                <View style={[
                                  styles.inboxTag,
                                  liveRole === 'Organizer' ? styles.tagBlueSolid : styles.tagGrey,
                                ]}>
                                  <Text style={[
                                    styles.inboxTagText,
                                    liveRole === 'Organizer' ? styles.tagBlueSolidText : styles.tagGreyText,
                                  ]}>
                                    {liveRole}
                                  </Text>
                                </View>
                              )}
                              {pinnedRoomIds.has(room.id) && <Pin size={12} color={C.blue} />}
                            </View>
                            {/* Right: time — stays at far right */}
                            <Text style={[styles.roomTimeText, hasUnread && { color: C.blue, fontWeight: '700' }]}>
                              {formatChatTime(room.latestTime)}
                            </Text>
                          </View>

                          {/* Row 2: snippet | DM trip chip + unread badge */}
                          <View style={styles.roomSnippetRow}>
                            <Text
                              style={[styles.roomSnippetText, hasUnread && { color: C.text, fontWeight: '600' }]}
                              numberOfLines={1}
                            >
                              {room.latestMessage || t('chat.noMessagesInChat')}
                            </Text>
                            <View style={styles.roomBadgeWrap}>
                              {/* DM: show shared trip name at bottom-right */}
                              {room.type !== 'GROUP' && room.tripId && (() => {
                                const sharedTrip = trips.find((t) => t.id === room.tripId);
                                return sharedTrip ? (
                                  <View style={styles.dmTripChip}>
                                    <Text style={styles.dmTripChipText} numberOfLines={1}>
                                      {sharedTrip.name}
                                    </Text>
                                  </View>
                                ) : null;
                              })()}
                              {hasUnread && (
                                <View style={styles.unreadBadge}>
                                  <Text style={styles.unreadBadgeText}>{room.unreadCount}</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </>
                      );
                    })()}
                  </View>

                </TouchableOpacity>
              );
            })
          ) : (
            <View style={styles.emptyInboxContainer}>
              <View style={styles.emptyInboxIconWrap}>
                <MessageSquare size={28} color={C.blue} />
              </View>
              <Text style={styles.emptyInboxTitle}>
                {searchQuery.trim() ? t('chat.noMessagesInChat') : t('chat.noChatsTitle')}
              </Text>
              <Text style={styles.emptyInboxSubtitle}>
                {searchQuery.trim()
                  ? t('search.noResultsMessage', { defaultValue: 'Try searching for a different name or keyword.' })
                  : t('chat.noChatsDesc', { defaultValue: 'Group trip chats and guide discussions will appear here.' })}
              </Text>
            </View>
          )}
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
                <Pin size={16} color="#64748B" style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>
                  {pinnedRoomIds.has(selectedRoomForOptions.id) ? t('chat.unpinChat') : t('chat.pinChatToTop')}
                </Text>
              </TouchableOpacity>

              {/* MARK AS READ — there is no real backend "mark as unread"
              endpoint, so unlike before this row no longer offers a fake
              toggle (hardcoded unreadCount: 3, no server call) when a room
              is already read. It only appears, and only does something
              real, when the room actually has unread messages. */}
              {selectedRoomForOptions.unreadCount > 0 && (
                <TouchableOpacity
                  style={styles.optionsRowBtn}
                  onPress={() => {
                    const roomId = selectedRoomForOptions.id;
                    apiService
                      .markChatRead(roomId)
                      .then(() => {
                        setInboxRooms((prev) =>
                          prev.map((r) => (r.id === roomId ? { ...r, unreadCount: 0 } : r)),
                        );
                        checkUnreadChats();
                      })
                      .catch((e) => {
                        logger.warn('[Chat] Mark-read failed:', e);
                        toast(errorToastMessage(e, 'Could not mark as read. Please try again.'), 'error');
                      });
                    setSelectedRoomForOptions(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.markAsRead')}
                >
                  <CheckCircle size={16} color="#64748B" style={styles.optionsRowIcon} />
                  <Text style={styles.optionsRowText}>{t('chat.markAsRead')}</Text>
                </TouchableOpacity>
              )}

              {/* "Clear conversation" removed: it only wiped the local cache — messages stayed on the server for everyone else and came back on reload. */}

              {/* LEAVE GROUP / DELETE CHAT */}
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => {
                  const targetRoom = selectedRoomForOptions;
                  setSelectedRoomForOptions(null);
                  if (!targetRoom) return;
                  const isGroup = targetRoom.type === "GROUP";
                  setTimeout(async () => {
                    const ok = await confirm({
                      title: isGroup ? t("chat.leaveGroupTitle") : t("chat.deleteChatTitle"),
                      message: isGroup
                        ? t("chat.leaveGroupMessage", { name: targetRoom.name })
                        : t("chat.deleteChatMessage", { name: targetRoom.name }),
                      confirmLabel: isGroup ? t("chat.leave") : t("chat.delete"),
                      destructive: true,
                    });
                    if (ok) {
                      if (isGroup) {
                        await handleLeaveRoom(targetRoom.id);
                      } else {
                        await handleDeleteChatRoom(targetRoom.id);
                      }
                    }
                  }, 200);
                }}
                accessibilityRole="button"
                accessibilityLabel={selectedRoomForOptions?.type === "GROUP" ? t("chat.leaveGroupTitle") : t("chat.deleteChatTitle")}
              >
                <X size={16} color="#EF4444" style={styles.optionsRowIcon} />
                <Text style={[styles.optionsRowText, { color: "#EF4444" }]}>
                  {selectedRoomForOptions?.type === "GROUP" ? t("chat.leaveGroupTitle") : t("chat.deleteChatTitle")}
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
              if (selectedRoomId) {
                const leavingRoomId = selectedRoomId;
                let noneUnreadLeft = false;
                setInboxRooms((prev) => {
                  const updated = prev.map((r) =>
                    r.id === leavingRoomId || `room-${r.id}` === leavingRoomId || r.id === `room-${leavingRoomId}`
                      ? { ...r, unreadCount: 0 }
                      : r,
                  );
                  if (!updated.some((r) => r.unreadCount > 0)) noneUnreadLeft = true;
                  return updated;
                });
                if (noneUnreadLeft) clearChatUnread();
              }
              setSelectedRoomId(null);
              setIsSettingsOpen(false);
              setUnreadSessionCount(0);
            }}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={t('chat.goBack')}
          >
            <ArrowLeft size={20} color={C.text} />
          </TouchableOpacity>

          <Avatar uri={activeRoom?.avatar || findMemberAvatar(undefined, activeRoom?.name, undefined, dbMembers)} name={activeRoom?.name || 'Chat'} size={40} style={styles.roomHeaderAvatar} />

          <View style={styles.roomHeaderTitles}>
            <View style={styles.roomHeaderNameRow}>
              <TouchableOpacity
                onPress={() => setIsSettingsOpen(true)}
                activeOpacity={0.7}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={t('chat.openRoomSettings')}
              >
                <Text style={styles.roomHeaderNameText} numberOfLines={1}>
                  {activeRoom?.name}
                </Text>
              </TouchableOpacity>



            </View>

            <TouchableOpacity
              onPress={() => setIsSettingsOpen(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <View style={styles.activityStatusRow}>
                <View style={styles.statusGreenDot} />
                <Text style={styles.roomHeaderStatusText} numberOfLines={1}>
                  {isDM
                    ? t('chat.directMessage', 'Direct Message')
                    : t('chat.membersOnline', {
                        online: onlineMemberCount,
                        total: joinedMemberCount,
                        defaultValue: '{{online}} of {{total}} online',
                      })}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            style={styles.actionRoundBtn}
            onPress={() => {
              // Carry the room's trip through, or the map opens generically
              // with no route to draw — which is why this button showed the
              // plain search map instead of the group's itinerary.
              const roomTripId = activeRoom?.tripId || selectedTripId;
              if (roomTripId) {
                router.push({ pathname: '/map', params: { tripId: roomTripId } });
              } else {
                router.navigate('/map');
              }
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('chat.openMap')}
          >
            <MapPin size={17} color={C.text} />
          </TouchableOpacity>

          {/* The settings gear is gone from the header. The same drawer is
              still reachable by tapping the room's name/member line above,
              which already opens it. */}
        </View>
      </View>

      {/* ─── SOS ACTIVE BANNER (explicit in-room banner removed per user specification) ───── */}

      {/* ─── WORKSPACE CONTENT AREA (CLEAN CONVERSATION FEED) ───── */}
      <View style={{ flex: 1 }}>
        <FlatList
          ref={messageListRef}
          data={reversedMessages}
          inverted
          keyExtractor={messageKeyExtractor}
          renderItem={({ item, index }) => {
            const prevMsg = index < reversedMessages.length - 1 ? reversedMessages[index + 1] : null;
            const isConsecutive =
              !!prevMsg &&
              prevMsg.senderRole?.toUpperCase() !== 'SYSTEM' &&
              prevMsg.senderName !== 'System' &&
              (item.isMe
                ? prevMsg.isMe
                : !prevMsg.isMe &&
                  (prevMsg.senderId && item.senderId
                    ? prevMsg.senderId === item.senderId
                    : prevMsg.senderName === item.senderName));

            const firstUnreadIndex =
              unreadSessionCount > 0
                ? unreadSessionCount - 1
                : -1;
            const isFirstUnread = unreadSessionCount > 0 && index === firstUnreadIndex;

            return (
              <React.Fragment key={item.id}>
                <MessageBubble
                  msg={item}
                  isConsecutive={isConsecutive}
                  isFirstMessage={index === reversedMessages.length - 1}
                  previousSenderName={prevMsg ? prevMsg.senderName : null}
                  isTranslated={translatedMsgs.has(item.id)}
                  onReply={setReplyingToMessage}
                  onShowOptions={setSelectedMessageForOptions}
                  onToggleTranslate={toggleTranslate}
                  onPollVote={handlePollVote}
                  onOpenMap={handleOpenMapForMessage}
                  onOpenExternalMaps={handleOpenInExternalMaps}
                  onOpenImage={setViewerImageUri}
                  canResolveSOS={profile.role === 'ORGANIZER' || profile.role === 'GUIDE'}
                  onResolveSOS={handleResolveSOSEvent}
                  members={dbMembers}
                />
                {isFirstUnread && (
                  <View style={styles.unreadDividerContainer}>
                    <View style={styles.unreadDividerLine} />
                    <View style={styles.unreadDividerPill}>
                      <Text style={styles.unreadDividerText}>
                        {unreadSessionCount} UNREAD MESSAGE{unreadSessionCount > 1 ? 'S' : ''}
                      </Text>
                    </View>
                    <View style={styles.unreadDividerLine} />
                  </View>
                )}
              </React.Fragment>
            );
          }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          onScroll={(e) => {
            const { contentOffset } = e.nativeEvent;
            setIsScrolledUp(contentOffset.y > 150);
          }}
          scrollEventThrottle={100}
          onTouchStart={() => {
            if (isEmojiPickerOpen) setIsEmojiPickerOpen(false);
          }}
          initialNumToRender={20}
          maxToRenderPerBatch={15}
          windowSize={11}
          ListHeaderComponent={
            <>
              {/* Scroll spacer dynamically adjusts with keyboard height to keep latest messages clearly visible above the input box */}
              <Animated.View
                style={{
                  height: Animated.add(
                    selectedRoomId
                      ? (isEmojiPickerOpen ? 340 : 120)
                      : (isEmojiPickerOpen ? 400 : 170),
                    keyboardOffset,
                  ),
                }}
              />
              {isTyping && (
                <View style={styles.typingIndicatorRow}>
                  <View style={styles.typingDotWrap}>
                    <Text style={styles.typingText}>{t('chat.isTyping', { name: typerName })}</Text>
                    <ActivityIndicator size="small" color={C.textSec} style={{ marginLeft: 6 }} />
                  </View>
                </View>
              )}
            </>
          }
        />

                {/* Floating Jump to Bottom Button when scrolled up (e.g. reading unread messages) */}
        {isScrolledUp && (
          <TouchableOpacity
            style={styles.floatingScrollBottomBtn}
            onPress={() => scrollToBottom(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Jump to latest message"
          >
            <ArrowLeft size={18} color="#2563EB" style={{ transform: [{ rotate: '-90deg' }] }} />
            {unreadSessionCount > 0 && (
              <View style={styles.floatingUnreadBadge}>
                <Text style={styles.floatingUnreadBadgeText}>{unreadSessionCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}

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
              onPress={() => {
                if (!isAttachmentOpen && isEmojiPickerOpen) {
                  setIsEmojiPickerOpen(false);
                }
                setIsAttachmentOpen(!isAttachmentOpen);
              }}
              hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.attachmentOptions')}
              accessibilityState={{ expanded: isAttachmentOpen }}
            >
              {isAttachmentOpen ? (
                <X size={18} color="#FFFFFF" />
              ) : (
                <Plus size={20} color={C.blue} />
              )}
            </TouchableOpacity>

            <View style={styles.textInputWrapper}>
              <TextInput
                placeholder={t('chat.messagePlaceholder')}
                placeholderTextColor={C.textMuted}
                style={styles.textInput}
                value={inputText}
                onChangeText={handleInputChange}
                onSubmitEditing={handleSendText}
                multiline={true}
                blurOnSubmit={false}
                onKeyPress={(e) => {
                  if (Platform.OS === 'web' && (e.nativeEvent as any).key === 'Enter' && !(e.nativeEvent as any).shiftKey) {
                    (e as any).preventDefault?.();
                    handleSendText();
                  }
                }}
                onFocus={() => {
                  if (isEmojiPickerOpen) {
                    setIsEmojiPickerOpen(false);
                  }
                }}
                accessibilityLabel={t('chat.messagePlaceholder')}
              />
              <TouchableOpacity
                style={[styles.smileIcon, isEmojiPickerOpen && styles.smileIconActive]}
                hitSlop={{ top: 11, bottom: 11, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('chat.emojiPicker')}
                onPress={() => {
                  if (isEmojiPickerOpen) {
                    setIsEmojiPickerOpen(false);
                  } else {
                    Keyboard.dismiss();
                    setIsAttachmentOpen(false);
                    setIsEmojiPickerOpen(true);
                    scrollToBottom();
                  }
                }}
              >
                <Smile size={18} color={isEmojiPickerOpen ? C.blue : C.textSec} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.sendIconCircle,
                inputText.trim() === '' ? styles.sendIconCircleDisabled : styles.sendIconCircleActive,
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

          {/* EMOJI PICKER DRAWER */}
          {isEmojiPickerOpen && (
            <View style={styles.emojiPickerContainer}>
              <View style={styles.emojiTopBar}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.emojiCategoryRow}
                >
                  {EMOJI_CATEGORIES.map((cat) => {
                    const isActive = selectedEmojiCategory === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.emojiCategoryPill, isActive && styles.emojiCategoryPillActive]}
                        onPress={() => setSelectedEmojiCategory(cat.id)}
                        accessibilityRole="button"
                        accessibilityLabel={cat.name}
                      >
                        <Text style={[styles.emojiCategoryPillText, isActive && styles.emojiCategoryPillTextActive]}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity
                  style={styles.emojiBackspaceBtn}
                  onPress={handleEmojiBackspace}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={t('chat.deleteLastCharacter', 'Delete last character')}
                >
                  <DeleteIcon size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.emojiGridScroll}
                contentContainerStyle={styles.emojiGridContainer}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {(EMOJI_CATEGORIES.find((c) => c.id === selectedEmojiCategory)?.emojis ?? []).map((emoji, idx) => (
                  <TouchableOpacity
                    key={`${emoji}-${idx}`}
                    style={styles.emojiCellTouch}
                    onPress={() => handleSelectEmoji(emoji)}
                    activeOpacity={0.6}
                    accessibilityRole="button"
                    accessibilityLabel={emoji}
                  >
                    <Text style={styles.emojiCellText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}
        </Animated.View>
      </View>


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
                  handleStartDirectMessage(selectedMessageForOptions.senderId, selectedMessageForOptions.senderName)
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

            {/* MESSAGE INFO — sender-only, and only useful in a group */}
            {selectedMessageForOptions.isMe && activeRoom?.type === 'GROUP' && (
              <TouchableOpacity
                style={styles.optionsRowBtn}
                onPress={() => handleShowMessageInfo(selectedMessageForOptions)}
                accessibilityRole="button"
                accessibilityLabel={t('chat.messageInfo')}
              >
                <CheckCheck size={16} color="#94A3B8" style={styles.optionsRowIcon} />
                <Text style={styles.optionsRowText}>{t('chat.messageInfo')}</Text>
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

      {/* ─── MESSAGE INFO (DELIVERED / READ AUDIENCE) ─────────── */}
      {messageInfoOpen && (
        <View style={styles.optionsModalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setMessageInfoOpen(false)}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
          />
          <View style={styles.optionsModalContent}>
            <View style={styles.optionsHeaderRow}>
              <Text style={styles.optionsHeaderTitle}>{t('chat.messageInfo')}</Text>
            </View>
            <View style={styles.optionsDivider} />

            {messageInfoLoading ? (
              <ActivityIndicator size="small" color={C.blueText} style={{ paddingVertical: 22 }} />
            ) : messageInfoError ? (
              <Text style={styles.infoSheetStateText}>{messageInfoError}</Text>
            ) : !messageInfoRows || messageInfoRows.length === 0 ? (
              <Text style={styles.infoSheetStateText}>{t('chat.messageInfoEmpty')}</Text>
            ) : (
              <ScrollView style={styles.infoSheetScroll} showsVerticalScrollIndicator={false}>
                {([
                  { key: 'readBy', label: t('chat.readBy'), rows: messageInfoRows.filter((r) => r.readAt) },
                  {
                    key: 'deliveredTo',
                    label: t('chat.deliveredTo'),
                    rows: messageInfoRows.filter((r) => !r.readAt && r.deliveredAt),
                  },
                  {
                    key: 'sentTo',
                    label: t('chat.sentTo'),
                    rows: messageInfoRows.filter((r) => !r.readAt && !r.deliveredAt),
                  },
                ] as const)
                  .filter((group) => group.rows.length > 0)
                  .map((group) => (
                    <View key={group.key}>
                      <Text style={styles.infoSheetGroupTitle}>{group.label}</Text>
                      {group.rows.map((row) => (
                        <View key={row.userId} style={styles.infoSheetRow}>
                          <Avatar uri={row.avatar || undefined} name={row.name} size={32} />
                          <View style={styles.infoSheetRowBody}>
                            <Text style={styles.infoSheetRowName} numberOfLines={1}>
                              {row.name}
                            </Text>
                            {row.readAt ? (
                              <Text style={styles.infoSheetRowTime}>
                                {t('chat.readAtTime', { time: formatMessageTimestamp(row.readAt) })}
                              </Text>
                            ) : row.deliveredAt ? (
                              <Text style={styles.infoSheetRowTime}>
                                {t('chat.deliveredAtTime', { time: formatMessageTimestamp(row.deliveredAt) })}
                              </Text>
                            ) : (
                              <Text style={styles.infoSheetRowTime}>{t('chat.notDeliveredYet')}</Text>
                            )}
                          </View>
                        </View>
                      ))}
                    </View>
                  ))}
              </ScrollView>
            )}

            <View style={styles.optionsCancelDivider} />
            <TouchableOpacity
              style={styles.optionsCancelBtn}
              onPress={() => setMessageInfoOpen(false)}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Text style={styles.optionsCancelText}>{t('common.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── GROUP INFO & OPTIONS SETTINGS OVERLAY ───────────── */}
      {isSettingsOpen && (
        <View style={styles.settingsOverlay}>
          <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
            {/* Floating Close Button */}
            <TouchableOpacity
              onPress={() => setIsSettingsOpen(false)}
              style={styles.settingsAbsoluteCloseBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t('chat.closeSettings')}
            >
              <ArrowLeft size={18} color={C.text} />
            </TouchableOpacity>

            <ScrollView contentContainerStyle={styles.settingsScrollContent} showsVerticalScrollIndicator={false}>
              {/* Group Meta Display */}
              <View style={styles.settingsAvatarBlock}>
                <Avatar uri={activeRoom?.avatar} name={activeRoom?.name || 'Chat'} size={72} style={styles.settingsAvatarImg} />
                <Text style={styles.settingsRoomName}>{activeRoom?.name}</Text>
                {activeTrip ? (
                  <Text style={styles.settingsTripDates}>
                    {formatDateRange(activeTrip.startDate, activeTrip.endDate)}
                  </Text>
                ) : null}
              </View>

              {/* HORIZONTAL EXPANDED TABS (OPTIONS SECTION) */}
              {activeRoom?.type === 'GROUP' && (
                <View style={styles.tabBarWrapper}>
                  <TouchableOpacity
                    style={[styles.tabItemTouch, overlayTab === 'itinerary' && styles.tabItemTouchActive]}
                    onPress={() => setOverlayTab('itinerary')}
                    activeOpacity={0.8}
                    accessibilityRole="tab"
                    accessibilityLabel={t('chat.tabItinerary')}
                    accessibilityState={{ selected: overlayTab === 'itinerary' }}
                  >
                    <Calendar size={16} color={overlayTab === 'itinerary' ? C.blue : C.textSec} />
                    <Text style={[styles.tabItemLabel, overlayTab === 'itinerary' && styles.tabItemLabelActive]}>
                      {t('chat.tabItinerary')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.tabItemTouch, overlayTab === 'members' && styles.tabItemTouchActive]}
                    onPress={() => setOverlayTab('members')}
                    activeOpacity={0.8}
                    accessibilityRole="tab"
                    accessibilityLabel={t('chat.tabMembers')}
                    accessibilityState={{ selected: overlayTab === 'members' }}
                  >
                    <UsersIcon size={16} color={overlayTab === 'members' ? C.blue : C.textSec} />
                    <Text style={[styles.tabItemLabel, overlayTab === 'members' && styles.tabItemLabelActive]}>
                      {t('chat.tabMembers')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* CONSOLIDATED TAB 1: ITINERARY & TRIP DETAILS */}
              {overlayTab === 'itinerary' && settingsRoom?.type === 'GROUP' && (
                <>
                  {/* TRIP OVERVIEW & METRICS CARD */}
                  <LinearGradient
                    colors={['#EEF2FF', '#F8FAFC']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.statsSummaryCard}
                  >
                    <View style={styles.statsHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <Compass size={16} color="#4F46E5" />
                        <Text style={styles.statsTitle} numberOfLines={1}>
                          {activeTrip?.name ? activeTrip.name.toUpperCase() : t('chat.tripCommandCenter')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.editTripHeaderBtn}
                        onPress={handleOpenEditTrip}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Edit Trip Details"
                      >
                        <Pencil size={12} color="#2563EB" />
                        <Text style={styles.editTripHeaderBtnText}>Edit Trip</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Progress Bar */}
                    <Text style={styles.telemetryLabel}>{t('chat.itinerarySyncProgress')}</Text>
                    <View style={styles.progressBarBg}>
                      <LinearGradient
                        colors={['#2563EB', '#6366F1']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={[styles.progressBarFill, { width: '50%' }]}
                      />
                    </View>

                    {/* Node Endpoints */}
                    <View style={styles.telemetryMetaGrid}>
                      <View style={styles.telemetryMetaCell}>
                        <Text style={styles.telemetryMetaVal}>
                          {activeTrip?.cities?.[0] ?? 'Departure'}
                        </Text>
                        <Text style={styles.telemetryMetaLbl}>{t('chat.lastNode')}</Text>
                      </View>
                      <View style={[styles.telemetryMetaCell, { alignItems: 'flex-end' }]}>
                        <Text style={styles.telemetryMetaVal}>
                          {activeTrip?.cities?.[activeTrip.cities.length - 1] ?? 'Destination'}
                        </Text>
                        <Text style={styles.telemetryMetaLbl}>{t('chat.targetNode')}</Text>
                      </View>
                    </View>

                    {/* Key Stats Grid */}
                    {activeTrip ? (
                      <View style={styles.statsGrid}>
                        <View style={styles.statsCell}>
                          <Text style={styles.statsValLabel}>{t('chat.seatsLeft')}</Text>
                          <Text style={styles.statsValText}>{activeTrip.availableSeats}</Text>
                        </View>
                        <View style={styles.statsCell}>
                          <Text style={styles.statsValLabel}>{t('chat.budgetPerPerson')}</Text>
                          <Text style={[styles.statsValText, { color: C.greenText }]}>
                            {formatINR(activeTrip.budget)}
                          </Text>
                        </View>
                      </View>
                    ) : null}

                    {/* Assembly Point */}
                    <View style={styles.statsFooter}>
                      <Clock size={12} color="#4F46E5" style={{ marginRight: 6 }} />
                      <Text style={styles.statsFooterText}>
                        {t('chat.assemblyPoint', { place: activeTrip?.meetingPoint ?? t('chat.notSet') })}
                      </Text>
                    </View>

                    {/* Quick Management Actions */}
                    <View style={styles.tripActionsRow}>
                      <TouchableOpacity
                        style={styles.tripActionBtn}
                        onPress={() => {
                          setIsSettingsOpen(false);
                          router.push('/budget-tracker');
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={t('chat.openExpenseTracker')}
                      >
                        <DollarSign size={14} color="#2563EB" />
                        <Text style={styles.tripActionBtnText}>{t('chat.groupBudgetSplits')}</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[styles.tripActionBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
                        onPress={startSOSCountdown}
                        accessibilityRole="button"
                        accessibilityLabel={t('chat.triggerPanicSosAlert')}
                      >
                        <ShieldAlert size={14} color="#EF4444" />
                        <Text style={[styles.tripActionBtnText, { color: '#DC2626' }]}>Emergency SOS</Text>
                      </TouchableOpacity>
                    </View>
                  </LinearGradient>

                  {/* DAY-BY-DAY ITINERARY ROADMAP CARD */}
                  <View style={styles.timelineCard}>
                    <View style={styles.timelineHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                        <MapPin size={16} color="#0066FF" />
                        <Text style={styles.timelineTitleText}>{t('chat.verticalItineraryRoadmap')}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.addDayHeaderBtn}
                        onPress={handleOpenAddDay}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel="Add Itinerary Day"
                      >
                        <Plus size={13} color="#FFFFFF" />
                        <Text style={styles.addDayHeaderBtnText}>Add Day</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.timelineList}>
                      {chatItineraryLoading ? (
                        <ActivityIndicator color={C.blueGlow} />
                      ) : chatItinerary.length === 0 ? (
                        <View style={styles.emptyItineraryWrap}>
                          <Text style={styles.emptyItineraryText}>{t('chat.noItineraryYet')}</Text>
                          <TouchableOpacity
                            style={styles.emptyAddDayBtn}
                            onPress={handleOpenAddDay}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel="Add First Day"
                          >
                            <Plus size={14} color="#FFFFFF" />
                            <Text style={styles.emptyAddDayBtnText}>Add First Day</Text>
                          </TouchableOpacity>
                        </View>
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
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                    <Text style={styles.verticalTimelineDayText}>
                                      {t('chat.dayNumber', { number: day.day })}
                                    </Text>
                                    <Text style={styles.verticalTimelineNodeTitle} numberOfLines={1}>
                                      {day.title}
                                    </Text>
                                  </View>
                                  <View style={styles.dayActionsRow}>
                                    <TouchableOpacity
                                      onPress={() => handleOpenEditDay(day)}
                                      style={styles.dayActionIconBtn}
                                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                      accessibilityRole="button"
                                      accessibilityLabel="Edit Day"
                                    >
                                      <Pencil size={12} color="#2563EB" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      onPress={() => handleDeleteDay(day.id)}
                                      style={styles.dayActionIconBtn}
                                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                      accessibilityRole="button"
                                      accessibilityLabel="Delete Day"
                                    >
                                      <Trash2 size={12} color="#EF4444" />
                                    </TouchableOpacity>
                                  </View>
                                </View>
                                <Text style={styles.verticalTimelineDesc}>{day.plan}</Text>
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </View>
                </>
              )}

              {/* NON-GROUP SETTINGS: real contact info + a real mute toggle,
              replacing the group itinerary/budget content that used to
              render here unconditionally regardless of room type. */}
              {overlayTab === 'itinerary' && settingsRoom && settingsRoom.type !== 'GROUP' && (
                <View style={{ marginBottom: 14 }}>
                  <View style={styles.sectionHeader}>
                    <UsersIcon size={16} color={C.blue} style={{ marginRight: 6 }} />
                    <Text style={styles.sectionHeaderTitle}>{t('chat.contactDetails')}</Text>
                  </View>
                  <View style={styles.membersListContainer}>
                    <View style={styles.memberItemRow}>
                      <Avatar
                        uri={otherParticipant?.avatar || settingsRoom.avatar}
                        name={otherParticipant?.name || settingsRoom.name}
                        size={40}
                        style={styles.memberAvatar}
                      />
                      <View style={styles.memberMeta}>
                        <Text style={styles.memberName}>{otherParticipant?.name || settingsRoom.name}</Text>
                        <Text style={styles.memberRoleText}>
                          {otherParticipant?.role
                            ? (SENDER_ROLE_LABEL_KEYS[otherParticipant.role]
                              ? t(SENDER_ROLE_LABEL_KEYS[otherParticipant.role])
                              : otherParticipant.role)
                            : (settingsRoom.type === 'GUIDE' ? t('chat.roleGuide') : t('chat.contact'))}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={[styles.sectionHeader, { marginTop: 18 }]}>
                    {settingsRoom.muted ? (
                      <BellOff size={16} color={C.blue} style={{ marginRight: 6 }} />
                    ) : (
                      <Bell size={16} color={C.blue} style={{ marginRight: 6 }} />
                    )}
                    <Text style={styles.sectionHeaderTitle}>{t('chat.notifications')}</Text>
                  </View>
                  <View style={styles.membersListContainer}>
                    <View style={styles.muteRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.memberName}>{t('chat.muteNotifications')}</Text>
                        <Text style={styles.muteRowDesc}>{t('chat.muteNotificationsDesc')}</Text>
                      </View>
                      <Switch
                        value={!!settingsRoom.muted}
                        onValueChange={(val) => handleToggleRoomMuted(settingsRoom.id, val)}
                        trackColor={{ false: '#E2E8F0', true: C.blue }}
                        thumbColor="#FFFFFF"
                        accessibilityLabel={t('chat.muteNotifications')}
                        accessibilityState={{ checked: !!settingsRoom.muted }}
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* TAB 2: MEMBERS */}
              {overlayTab === 'members' && (
                <View style={{ marginBottom: 14 }}>
                  <View style={styles.sectionHeader}>
                    <UsersIcon size={16} color={C.blue} style={{ marginRight: 6 }} />
                    <Text style={styles.sectionHeaderTitle}>
                      {t('chat.groupMembersCount', {
                        count: groupMembers.filter((m) => !m.isPendingCompanion).length,
                      })}
                    </Text>
                  </View>
                  <Text style={styles.settingsSubInfo}>{t('chat.tapMemberToStartChat')}</Text>
                  <View style={styles.membersListContainer}>
                    {groupMembers.map((member, idx) => {
                      const isLast = idx === groupMembers.length - 1;
                      const isMe =
                        member.isMe ||
                        (profile.name && member.name.trim().toLowerCase() === profile.name.trim().toLowerCase()) ||
                        (member.id && profile.id && member.id === profile.id);

                      return (
                        <View
                          key={member.name}
                          style={[
                            styles.memberItemRow,
                            !isLast && { borderBottomWidth: 0.8, borderBottomColor: '#F1F5F9', paddingBottom: 12 },
                          ]}
                        >
                          <Avatar uri={member.avatar} name={member.name} size={40} style={styles.memberAvatar} />
                          <View style={styles.memberMeta}>
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                              <Text style={styles.memberName}>
                                {member.name.replace(/\s*\((Creator|Organizer)\)\s*$/i, '').trim()}
                              </Text>
                              {isMe && <Text style={styles.memberYouTag}> ({t('chat.you')})</Text>}
                            </View>
                            {member.isPendingCompanion ? (
                              // An extra seat from a party booking: paid for
                              // and expected, but nobody has joined on it yet.
                              <View style={styles.memberPendingBadge}>
                                <Text style={styles.memberPendingText}>
                                  {t('chat.yetToJoin', 'Yet to join')}
                                </Text>
                              </View>
                            ) : member.role === 'Organizer' ? (
                              <View style={styles.memberRoleOrganizerBadge}>
                                <Text style={styles.memberRoleOrganizerText}>
                                  {SENDER_ROLE_LABEL_KEYS[member.role] ? t(SENDER_ROLE_LABEL_KEYS[member.role]) : member.role}
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.memberRoleText}>
                                {SENDER_ROLE_LABEL_KEYS[member.role] ? t(SENDER_ROLE_LABEL_KEYS[member.role]) : member.role}
                              </Text>
                            )}
                          </View>



                          {!isMe && !member.isPendingCompanion && (
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
                          )}
                        </View>
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

      {/* Edit Trip Modal */}
      {isEditTripModalOpen && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <Text style={styles.modalHeading}>Edit Trip Details</Text>

            <Input
              label="Trip Name"
              placeholder="e.g. Goa Beach Tour"
              value={tripEditForm.name}
              onChangeText={(val) => setTripEditForm((p) => ({ ...p, name: val }))}
              containerStyle={{ marginBottom: 12 }}
            />

            <Input
              label="Meeting / Assembly Point"
              placeholder="e.g. Airport Gate 4, Terminal 2"
              value={tripEditForm.meetingPoint}
              onChangeText={(val) => setTripEditForm((p) => ({ ...p, meetingPoint: val }))}
              containerStyle={{ marginBottom: 12 }}
            />

            <Input
              label="Budget Per Person (₹)"
              placeholder="e.g. 8500"
              keyboardType="numeric"
              value={tripEditForm.budget}
              onChangeText={(val) => setTripEditForm((p) => ({ ...p, budget: val }))}
              containerStyle={{ marginBottom: 16 }}
            />

            <View style={styles.modalActionButtons}>
              <Button
                label={t('common.cancel')}
                variant="secondary"
                size="sm"
                onPress={() => setIsEditTripModalOpen(false)}
              />
              <Button
                label={isSavingTrip ? 'Saving...' : 'Save Changes'}
                size="sm"
                disabled={isSavingTrip}
                onPress={handleSaveTrip}
              />
            </View>
          </View>
        </View>
      )}

      {/* Add / Edit Itinerary Day Modal */}
      {itineraryModalMode !== 'NONE' && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentCard}>
            <Text style={styles.modalHeading}>
              {itineraryModalMode === 'ADD' ? 'Add Itinerary Day' : 'Edit Itinerary Day'}
            </Text>

            <Input
              label="Day Title"
              placeholder="e.g. Coastal Hike & Sunset Point"
              value={itineraryDayForm.title}
              onChangeText={(val) => setItineraryDayForm((p) => ({ ...p, title: val }))}
              containerStyle={{ marginBottom: 12 }}
            />

            <Input
              label="Day Plan / Activities"
              placeholder="e.g. Morning assembly at 9 AM, guided trek, beach lunch, and evening sunset watch."
              value={itineraryDayForm.plan}
              onChangeText={(val) => setItineraryDayForm((p) => ({ ...p, plan: val }))}
              multiline
              numberOfLines={3}
              containerStyle={{ marginBottom: 16 }}
            />

            <View style={styles.modalActionButtons}>
              <Button
                label={t('common.cancel')}
                variant="secondary"
                size="sm"
                onPress={() => setItineraryModalMode('NONE')}
              />
              <Button
                label={isSavingDay ? 'Saving...' : 'Save Day'}
                size="sm"
                disabled={isSavingDay}
                onPress={handleSaveDay}
              />
            </View>
          </View>
        </View>
      )}

      {/* Full-screen Image Viewer */}
      <Modal
        visible={!!viewerImageUri}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerImageUri(null)}
      >
        <Pressable style={styles.imageViewerBackdrop} onPress={() => setViewerImageUri(null)}>
          {viewerImageUri ? (
            <Image source={{ uri: viewerImageUri }} style={styles.imageViewerImage} resizeMode="contain" />
          ) : null}
          <TouchableOpacity
            style={styles.imageViewerCloseBtn}
            onPress={() => setViewerImageUri(null)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('chat.imageViewerCloseLabel')}
          >
            <X size={22} color="#FFF" />
          </TouchableOpacity>
        </Pressable>
      </Modal>

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
    backgroundColor: '#F8FAFC',
  },
  inboxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  inboxHeaderTitle: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  inboxHeaderIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconTouch: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBarWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  inboxFiltersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  filterPill: {
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  filterPillText: {
    color: '#64748B',
    fontSize: 13,
    fontWeight: '600',
  },
  filterPillTextSelected: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  safetyTickerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 52,
    backgroundColor: '#B91C1C',
    borderBottomWidth: 1,
    borderBottomColor: '#EF4444',
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  safetyTickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
    gap: 10,
  },
  safetyTickerIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  safetyTickerTextWrap: {
    flex: 1,
  },
  safetyTickerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  safetyTickerBadgeText: {
    color: '#FEE2E2',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  safetyTickerUserText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    flexShrink: 1,
  },
  safetyTickerReasonText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  safetyTickerSafeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  safetyTickerSafeText: {
    color: '#065F46',
    fontSize: 11.5,
    fontWeight: '800',
  },

  // Room Item Rows
  roomItemTouch: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  roomItemTouchGroup: {
    backgroundColor: '#F0F6FE',
    borderBottomColor: '#E0EDFE',
    borderLeftWidth: 3.5,
    borderLeftColor: C.blue,
  },
  roomAvatarWrap: {
    position: 'relative',
    marginRight: 14,
  },
  roomAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
  roomAvatarImgGroup: {
    borderColor: '#BFDBFE',
    borderWidth: 2,
  },
  groupBadgeMini: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: C.blue,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  onlineBadgeGuide: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
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
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 10,
  },
  roomTimeText: {
    color: '#64748B',
    fontSize: 12,
    fontWeight: '500',
  },
  roomSnippetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  roomSnippetText: {
    color: '#64748B',
    fontSize: 13,
    flex: 1,
    marginRight: 8,
  },
  roomBadgeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inboxTag: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagBlue: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  tagBlueSolid: {
    backgroundColor: '#2563EB',
    borderWidth: 0,
  },
  tagBlueSolidText: {
    color: '#FFFFFF',
  },
  tagPurple: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#EDE9FE',
  },
  tagBlueText: {
    color: '#1D4ED8',
  },
  tagPurpleText: {
    color: '#6D28D9',
  },
  inboxTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  tagGreen: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  tagGreenText: {
    color: '#065F46',
  },
  tagGrey: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  tagGreyText: {
    color: '#475569',
  },
  dmTripChip: {
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
    maxWidth: 110,
  },
  dmTripChipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#0369A1',
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  emptyInboxContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyInboxIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  emptyInboxTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyInboxSubtitle: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 280,
  },

  // Room Header Bar (Detail view)
  roomHeaderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
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
  roomHeaderNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
  },
  roomHeaderNameText: {
    color: '#0F172A',
    fontSize: 14.5,
    fontWeight: '800',
    maxWidth: 140,
  },
  headerDmTripTouch: {
    marginLeft: 6,
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    maxWidth: 160,
  },
  headerDmTripText: {
    color: C.blue,
    fontSize: 12,
    fontWeight: '700',
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 6,
  },
  sectionHeaderTitle: {
    color: '#0F172A',
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
    backgroundColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  timelineDotActive: {
    backgroundColor: C.green,
  },
  timelineDotInactive: {
    backgroundColor: '#CBD5E1',
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
    backgroundColor: '#E2E8F0',
  },
  timelineCityText: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
  },
  timelineCityTextActive: {
    color: '#0F172A',
  },
  timelineCityTextInactive: {
    color: '#94A3B8',
  },

  // Meeting Point Panel
  meetingPointPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEFCE8',
    borderWidth: 1,
    borderColor: '#FEF08A',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  meetingTitle: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '800',
    marginRight: 4,
  },
  meetingLocation: {
    color: '#0F172A',
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
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '900',
  },

  // Settings Panel Outline BTN
  settingsOutlineBtn: {
    borderWidth: 1,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  settingsOutlineBtnText: {
    fontSize: 12.5,
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
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginTop: 6,
  },
  armedLabel: {
    color: '#991B1B',
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
    paddingBottom: 12,
  },
  unreadDividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    paddingHorizontal: 16,
  },
  unreadDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#CBD5E1',
  },
  unreadDividerPill: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginHorizontal: 10,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  unreadDividerText: {
    color: '#2563EB',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  floatingScrollBottomBtn: {
    position: 'absolute',
    right: 16,
    bottom: 60,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
    zIndex: 50,
  },
  floatingUnreadBadge: {
    position: 'absolute',
    top: -6,
    right: -4,
    backgroundColor: '#2563EB',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  floatingUnreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
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
    marginBottom: -10,
    paddingVertical: 4,
  },
  consecutiveMessageRow: {
    marginTop: 2,
  },
  differentSenderRow: {
    marginTop: 12,
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
    gap: 6,
  },
  senderNameText: {
    fontSize: 13,
    fontWeight: '700',
    color: C.text,
  },
  rolePill: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rolePillOrganizer: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  rolePillGuide: {
    backgroundColor: '#F5F3FF',
    borderColor: '#DDD6FE',
  },
  rolePillTourist: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  rolePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  rolePillTextOrganizer: {
    color: '#1D4ED8',
  },
  rolePillTextGuide: {
    color: '#6D28D9',
  },
  rolePillTextTourist: {
    color: '#64748B',
  },

  // Bubble
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '100%',
    alignSelf: 'flex-start',
  },
  bubbleContainerMe: {
    alignSelf: 'flex-end',
    maxWidth: '78%',
    marginVertical: 2.5,
  },
  instagramBubbleContainerMe: {
    alignSelf: 'flex-end',
    maxWidth: '82%',
    marginVertical: 2.5,
  },
  bubbleContainerOther: {
    alignSelf: 'flex-start',
    maxWidth: '78%',
    marginVertical: 2.5,
  },
  modernBubbleMe: {
    backgroundColor: '#E8EDFD',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 13,
    paddingTop: 8,
    paddingBottom: 6,
    minWidth: 64,
  },
  modernBubbleOther: {
    backgroundColor: '#F1F3F8',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 13,
    paddingTop: 8,
    paddingBottom: 6,
    minWidth: 64,
  },
  bubbleInnerMe: {
    flexDirection: 'column',
  },
  bubbleInnerOther: {
    flexDirection: 'column',
  },
  bubbleTextMe: {
    color: '#0F172A',
    fontSize: 14.5,
    fontWeight: '400',
    lineHeight: 20.5,
    letterSpacing: 0.1,
  },
  bubbleTextOther: {
    color: '#0F172A',
    fontSize: 14.5,
    fontWeight: '400',
    lineHeight: 20.5,
    letterSpacing: 0.1,
  },
  bubbleMetaRowMe: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  bubbleMetaRowOther: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
    marginTop: 2,
  },
  timestampTextMe: {
    color: '#64748B',
    fontSize: 10.5,
    fontWeight: '400',
  },
  timestampTextOther: {
    color: '#8C9AA8',
    fontSize: 10.5,
    fontWeight: '400',
  },
  statusCheckIcon: {
    marginLeft: 3,
  },
  translateTextOther: {
    color: C.blue,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
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
  instagramGradientBubbleOther: {
    borderRadius: 18,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 70,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
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
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  bubbleText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 20,
    letterSpacing: 0.1,
  },
  translateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(255, 255, 255, 0.25)',
  },
  translateText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  timestampText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 11,
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
    color: C.text,
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
    color: C.text,
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
    color: C.text,
    fontSize: 13,
    fontWeight: '700',
  },
  expenseBillAmount: {
    color: C.text,
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
    color: C.blueText,
    fontSize: 12,
    fontWeight: '800',
    marginLeft: 6,
  },
  locationText: {
    color: C.text,
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
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  locationActionText: {
    color: C.blueText,
    fontSize: 12,
    fontWeight: '800',
  },
  locationSecondaryTouch: {
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
    marginTop: 6,
    borderWidth: 1,
    borderColor: C.border,
  },
  locationSecondaryText: {
    color: C.textSec,
    fontSize: 12,
    fontWeight: '700',
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
    borderRadius: 18,
    overflow: 'hidden',
    maxWidth: '85%',
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  imageCardMe: {
    alignSelf: 'flex-end',
    borderColor: 'rgba(59, 130, 246, 0.35)',
  },
  imageCardOther: {
    alignSelf: 'flex-start',
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  imageMediaWrapper: {
    position: 'relative',
    width: 240,
    height: 180,
    backgroundColor: '#0F172A',
    borderRadius: 16,
    overflow: 'hidden',
  },
  imageMedia: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  imageTimeBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  imageTimeText: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  imageCaptionRow: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  imageCardDesc: {
    color: '#F1F5F9',
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },

  // Full-screen Image Viewer
  imageViewerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageViewerImage: {
    width: '100%',
    height: '85%',
  },
  imageViewerCloseBtn: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // SOS Card Alert - Professional Emergency Dispatch Standard
  sosBroadcastRow: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 10,
    paddingHorizontal: 6,
  },
  sosCardAlert: {
    width: '100%',
    backgroundColor: '#1C0B0E',
    borderWidth: 1.5,
    borderColor: '#EF4444',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 5,
  },
  sosCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sosBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
  },
  sosBadgePillText: {
    color: '#F87171',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sosCardTimestamp: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  sosRequesterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  sosRequesterIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosRequesterMeta: {
    flex: 1,
  },
  sosRequesterTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  sosRequesterSub: {
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 1,
  },
  sosIssueCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  sosIssueLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  sosIssueLabelText: {
    color: '#F87171',
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sosIssueMainText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '600',
    lineHeight: 19,
  },
  sosLocationStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  sosLocationCoordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sosLocationCoordsText: {
    color: '#F1F5F9',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  sosStaleBadge: {
    backgroundColor: '#78350F',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sosStaleBadgeText: {
    color: '#FDE68A',
    fontSize: 10,
    fontWeight: '700',
  },
  sosAlertBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sosPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#DC2626',
  },
  sosPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  sosSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
  },
  sosSecondaryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  sosResolveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#059669',
  },
  sosResolveBtnText: {
    color: '#FFFFFF',
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
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    zIndex: 90,
  },
  plusCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.2,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    marginBottom: 1,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  plusCircleOpen: {
    backgroundColor: C.blue,
    borderColor: C.blue,
    shadowColor: C.blue,
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  textInputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 6 : 2,
    minHeight: 42,
    maxHeight: 120,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  textInput: {
    flex: 1,
    color: C.text,
    fontSize: 14.5,
    paddingVertical: Platform.OS === 'ios' ? 4 : 4,
    paddingTop: Platform.OS === 'android' ? 6 : 4,
    paddingBottom: Platform.OS === 'android' ? 6 : 4,
    minHeight: 28,
    maxHeight: 100,
  },
  smileIcon: {
    padding: 4,
    marginLeft: 6,
    borderRadius: 12,
  },
  smileIconActive: {
    backgroundColor: '#EFF6FF',
  },
  emojiPickerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    marginTop: 10,
    paddingTop: 8,
    paddingBottom: 6,
    height: 230,
    borderRadius: 12,
  },
  emojiTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  emojiCategoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emojiCategoryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    marginRight: 6,
  },
  emojiCategoryPillActive: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  emojiCategoryIcon: {
    fontSize: 13,
  },
  emojiCategoryPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginLeft: 4,
  },
  emojiCategoryPillTextActive: {
    color: C.blue,
    fontWeight: '700',
  },
  emojiBackspaceBtn: {
    padding: 7,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginLeft: 8,
  },
  emojiGridScroll: {
    flex: 1,
  },
  emojiGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  emojiCellTouch: {
    width: '12.5%',
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emojiCellText: {
    fontSize: 24,
  },
  sendIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    marginBottom: 1,
  },
  sendIconCircleActive: {
    backgroundColor: C.blue,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  sendIconCircleDisabled: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  // Floating Attachments Panel
  attachmentPanel: {
    position: 'absolute',
    left: 10,
    right: 10,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 8,
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
    backgroundColor: C.bg,
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
    backgroundColor: '#FFFFFF',
  },
  settingsBackBtn: {
    padding: 4,
  },
  settingsHeaderTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  settingsScrollContent: {
    padding: 16,
    paddingTop: 56,
  },
  settingsAvatarBlock: {
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1.2,
    borderBottomColor: '#E2E8F0',
  },
  settingsAvatarImg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: C.blue,
    marginBottom: 10,
  },
  settingsRoomName: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  settingsTripDates: {
    color: C.textSec,
    fontSize: 13,
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
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
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
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  modalHeading: {
    color: '#0F172A',
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
    alignItems: 'flex-end',
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
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#2563EB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  bubbleReplySenderMe: {
    color: '#1D4ED8',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 1,
  },
  bubbleReplyContentMe: {
    color: '#475569',
    fontSize: 12,
  },
  bubbleReplyHeaderOther: {
    backgroundColor: 'rgba(100, 116, 139, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: '#64748B',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  bubbleReplySenderOther: {
    color: '#334155',
    fontWeight: '700',
    fontSize: 12,
    marginBottom: 1,
  },
  bubbleReplyContentOther: {
    color: '#64748B',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 20,
    width: '85%',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  optionsHeaderRow: {
    marginBottom: 12,
  },
  optionsHeaderTitle: {
    color: '#0F172A',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  optionsHeaderSubText: {
    color: '#64748B',
    fontSize: 12,
  },
  optionsDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
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
    color: '#1E293B',
    fontSize: 13.5,
    fontWeight: '600',
  },
  optionsCancelDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 12,
  },
  infoSheetScroll: {
    maxHeight: 360,
  },
  infoSheetGroupTitle: {
    color: C.textSec,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: 14,
    marginBottom: 6,
  },
  infoSheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 10,
  },
  infoSheetRowBody: {
    flex: 1,
  },
  infoSheetRowName: {
    color: '#1E293B',
    fontSize: 13.5,
    fontWeight: '700',
  },
  infoSheetRowTime: {
    color: C.textSec,
    fontSize: 11.5,
    marginTop: 2,
  },
  infoSheetStateText: {
    color: C.textSec,
    fontSize: 13,
    paddingVertical: 18,
    textAlign: 'center',
  },
  optionsCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
  },
  optionsCancelText: {
    color: '#475569',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginTop: 4,
    gap: 8,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
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
    color: '#0F172A',
    fontSize: 13.5,
    fontWeight: '700',
  },
  memberYouTag: {
    color: C.blue,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 4,
  },
  memberRoleText: {
    color: C.textSec,
    fontSize: 12,
    marginTop: 1,
  },
  muteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    gap: 12,
  },
  muteRowDesc: {
    color: C.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  memberPendingBadge: {
    alignSelf: 'flex-start',
    marginTop: 3,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  memberPendingText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#C2410C',
  },
  memberRoleOrganizerBadge: {
    alignSelf: 'flex-start',
    marginTop: 3,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  memberRoleOrganizerText: {
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '700',
  },
  roleBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 0.8,
    marginRight: 4,
  },
  roleBadgeOrganizer: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  roleBadgeGuide: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  roleBadgeTourist: {
    backgroundColor: '#F1F5F9',
    borderColor: '#CBD5E1',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },

  // Telemetry Monitor Styles
  telemetryCardGradient: {
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  telemetryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  telemetryTitle: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  telemetryStatusBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 0.8,
    borderColor: '#C7D2FE',
  },
  telemetryStatusText: {
    color: '#4338CA',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  telemetryLabel: {
    color: '#1E293B',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#E2E8F0',
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
    color: '#0F172A',
    fontSize: 12.5,
    fontWeight: '700',
  },
  telemetryMetaLbl: {
    color: '#64748B',
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 2,
  },
  telemetryDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 12,
  },
  telemetryFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  telemetryFooterText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '600',
  },
  settingsAbsoluteCloseBtn: {
    position: 'absolute',
    top: 14,
    left: 16,
    zIndex: 300,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  settingsExitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.2,
    borderColor: '#FECACA',
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 10,
    marginBottom: 20,
    gap: 8,
  },
  settingsExitBtnText: {
    color: '#DC2626',
    fontSize: 13.5,
    fontWeight: '700',
  },

  // ─── TAB SELECTION BAR STYLES (TRIP DETAILS OVERLAY) ──────────
  tabBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  tabItemTouch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH_TARGET,
    paddingVertical: 8,
    borderRadius: 12,
    gap: 6,
  },
  tabItemTouchActive: {
    backgroundColor: '#EFF6FF',
  },
  tabItemLabel: {
    color: '#64748B',
    fontSize: 12.5,
    fontWeight: '600',
  },
  tabItemLabelActive: {
    color: '#2563EB',
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
    borderWidth: 1,
    borderColor: '#E0E7FF',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  editTripHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editTripHeaderBtnText: {
    color: '#2563EB',
    fontSize: 11.5,
    fontWeight: '700',
  },
  statsTitle: {
    color: '#312E81',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  statsStatusBadge: {
    backgroundColor: '#EEF2FF',
    borderColor: '#C7D2FE',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statsStatusText: {
    color: '#4338CA',
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
    color: '#64748B',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 3,
  },
  statsValText: {
    color: '#0F172A',
    fontSize: 18,
    fontWeight: '800',
  },
  statsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 0.8,
    borderTopColor: '#E2E8F0',
    paddingTop: 10,
  },
  statsFooterText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  tripActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  tripActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 8,
  },
  tripActionBtnText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
  },

  // ─── ROADMAP TIMELINE STYLES ──────────────────────────────────
  timelineCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 8,
  },
  timelineTitleText: {
    color: '#0F172A',
    fontSize: 14.5,
    fontWeight: '700',
  },
  addDayHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#2563EB',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  addDayHeaderBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  timelineList: {
    paddingLeft: 4,
  },
  emptyItineraryWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  emptyItineraryText: {
    color: '#64748B',
    fontSize: 13,
  },
  emptyAddDayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  emptyAddDayBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
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
    backgroundColor: '#CBD5E1',
    marginVertical: 4,
  },
  verticalTimelineCard: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  verticalTimelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    gap: 8,
  },
  dayActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dayActionIconBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#0F172A',
    fontSize: 13.5,
    fontWeight: '700',
    flex: 1,
  },
  verticalTimelineDesc: {
    color: '#64748B',
    fontSize: 12,
    lineHeight: 16,
  },

  // ─── DOCUMENTS VAULT STYLES ───────────────────────────────────
  docsHeaderBlock: {
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  docsHeaderTitleText: {
    color: '#0F172A',
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
    color: '#0F172A',
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
    color: '#0F172A',
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
