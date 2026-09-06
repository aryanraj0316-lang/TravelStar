import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { logger } from '@/lib/logger';
import { formatRelative } from '@/lib/datetime';
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
  StatusBar,
  TextInput,
  Image,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useApp } from '@/store/AppContext';
import { apiService } from '@/services/api';
import type { IncomingJoinRequest, TripMemberRow } from '@/types/api';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Users from 'lucide-react-native/icons/users';
import MessageSquare from 'lucide-react-native/icons/message-square';
import DollarSign from 'lucide-react-native/icons/dollar-sign';
import Calendar from 'lucide-react-native/icons/calendar';
import TrendingUp from 'lucide-react-native/icons/trending-up';
import Plus from 'lucide-react-native/icons/plus';
import Clock from 'lucide-react-native/icons/clock';
import Car from 'lucide-react-native/icons/car';
import Hotel from 'lucide-react-native/icons/hotel';
import ExternalLink from 'lucide-react-native/icons/external-link';
import Activity from 'lucide-react-native/icons/activity';
import CheckCircle from 'lucide-react-native/icons/circle-check-big';
import X from 'lucide-react-native/icons/x';
import Check from 'lucide-react-native/icons/check';
import Send from 'lucide-react-native/icons/send';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { showPrompt, toast, useConfirm } from '@/lib/feedback';
import { Button, Input, Sheet } from '@/components/ui';

const { width: SCREEN_WIDTH } = Dimensions.get('window');


// â”€â”€â”€ Data Interfaces â”€â”€â”€
interface ActiveTour {
  id: string;
  groupName: string;
  destination: string;
  durationDays: number;
  maxSize: number;
  currentSize: number;
  price: number;
  status: 'OPEN' | 'FULL' | 'COMPLETED';
  coverImage?: string;
}

interface GroupMember {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  role: 'LEADER' | 'GUIDE' | 'MEMBER';
  // docs/REMEDIATION.md §8.6 — these three are real, persisted TripMember
  // fields (GET /trips/:id/members), not client-only state. null on the
  // organizer's own row (they have no TripMember row to hold them).
  checkedIn: boolean | null;
  roomAllocated: string | null;
  seatAllocated: string | null;
}

interface JoinRequest {
  id: string;
  tourId: string;
  userName: string;
  userAvatar: string;
}

const ROLE_LABEL_KEYS: Record<GroupMember['role'], string> = {
  LEADER: 'groupOrganizer.roleLeader',
  GUIDE: 'groupOrganizer.roleGuide',
  MEMBER: 'groupOrganizer.roleMember',
};

const STATUS_LABEL_KEYS: Record<ActiveTour['status'], string> = {
  OPEN: 'groupOrganizer.statusOpen',
  FULL: 'groupOrganizer.statusFull',
  COMPLETED: 'groupOrganizer.statusCompleted',
};

export default function GroupOrganizerScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { profile, addTrip, trips } = useApp();
  const confirm = useConfirm();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'trips' | 'logistics' | 'chat'>('dashboard');

  // ────────────────────────────────────────────────────────
  // STATE: TOURS & CHATS
  // ────────────────────────────────────────────────────────
  // docs/REMEDIATION.md §8.6: this used to seed a single hardcoded
  // "Sikkim Highlanders Club" tour, and — because the sync effect below
  // only ever overwrote it when the organizer had at least one real trip
  // — an organizer with zero real trips saw that fake tour forever, with
  // every tab (roster, logistics, chat) operating on it. Starts empty; the
  // render below shows a real empty state until a real trip exists.
  const [tours, setTours] = useState<ActiveTour[]>([]);

  const [selectedTourIdx, setSelectedTourIdx] = useState(0);
  const currentTour: ActiveTour | undefined = tours[selectedTourIdx] || tours[0];

  // Join Requests state
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);

  // Members list (dynamic for currently selected tour)
  const [members, setMembers] = useState<GroupMember[]>([]);

  // Derived properties from AppContext
  const myTrips = trips.filter((t) => t.creatorId === profile?.id);

  // Sync tours list from AppContext's trips, adjusted during render rather
  // than in an effect (react-hooks/set-state-in-effect) — tours isn't a
  // pure derived value (handleCreateTour below also appends to it directly
  // for an instant optimistic add), so it stays real state, just no longer
  // set from inside a useEffect body.
  const [prevToursSyncKey, setPrevToursSyncKey] = useState<{ trips: typeof trips; profileId?: string }>({
    trips,
    profileId: profile?.id,
  });
  if (trips !== prevToursSyncKey.trips || profile?.id !== prevToursSyncKey.profileId) {
    setPrevToursSyncKey({ trips, profileId: profile?.id });
    const mappedTours: ActiveTour[] = myTrips.map((t) => ({
      id: t.id,
      groupName: t.name,
      destination: t.cities?.join(' ➔ ') || 'Custom Route',
      durationDays: 5,
      maxSize: t.totalSeats || 10,
      currentSize: (t.totalSeats || 10) - (t.availableSeats || 0),
      price: t.budget || 5000,
      status: (t.availableSeats || 0) <= 0 ? 'FULL' : ('OPEN' as const),
      coverImage: t.coverImage,
    }));
    setTours(mappedTours);
  }

  // .then()-chain style (rather than async/await) and useCallback-wrapped —
  // calling an async/await function directly from a useEffect body still
  // trips react-hooks/set-state-in-effect even when memoized, because the
  // compiler's check doesn't see the setState after `await` as deferred the
  // way it recognizes a nested `.then(cb)` callback. Matches the pattern
  // AppContext.tsx's reload*/checkUnread* helpers already use successfully.
  const fetchIncoming = useCallback(() => {
    apiService
      .getIncomingRequests()
      .then((data) => {
        if (!data) return;
        const pending = data
          .filter((r: IncomingJoinRequest) => r.status === 'PENDING')
          .map((r) => ({
            id: r.id,
            tourId: r.tripId,
            userName: r.applicantName,
            // The real avatar the server sends, not a fixed stock photo.
            userAvatar: r.applicantAvatar,
          }));
        setJoinRequests(pending);
      })
      .catch((e) => logger.warn('Failed to fetch incoming requests:', e));
  }, []);

  const fetchTourMembers = useCallback((tripId: string) => {
    apiService
      .getTripMembers(tripId)
      .then((data) => {
        if (!data) return;
        // docs/REMEDIATION.md §8.6: checkedIn/roomAllocated/seatAllocated
        // used to be hardcoded to the same value for every member on every
        // fetch (false/'VEG'/'Room TBD'/'Seat TBD') — this now reflects the
        // real, persisted TripMember columns the server returns.
        const mappedMembers: GroupMember[] = data.map((m: TripMemberRow) => ({
          id: m.id,
          userId: m.userId,
          name: m.name,
          avatar: m.avatar,
          role: m.isCreator ? 'LEADER' : 'MEMBER',
          checkedIn: m.checkedIn,
          roomAllocated: m.roomAllocated,
          seatAllocated: m.seatAllocated,
        }));
        setMembers(mappedMembers);
      })
      .catch((e) => logger.warn('Failed to fetch tour members:', e));
  }, []);

  // docs/REMEDIATION.md §8.6: this used to be a hardcoded two-day plan
  // ("Arrival & Welcoming Dinner" / "Trekking & Sightseeing") shown
  // identically for every tour, and "Insert Itinerary Day" only pushed
  // onto this array — the day was gone on unmount and no trip member ever
  // saw it. Now a real, per-trip, persisted schedule.
  type ItineraryDay = { id: string; day: number; title: string; plan: string };
  const [itinerary, setItinerary] = useState<ItineraryDay[]>([]);
  const [itineraryLoading, setItineraryLoading] = useState(false);
  const [itineraryError, setItineraryError] = useState<string | null>(null);
  const [newDayTitle, setNewDayTitle] = useState('');
  const [newDayDesc, setNewDayDesc] = useState('');
  const [addingDay, setAddingDay] = useState(false);

  // .then()-chain style, not async/await — still returns a Promise so the
  // `await fetchItinerary(...)` call sites below keep working, but nests
  // the setState calls inside .then()/.catch()/.finally() closures instead
  // of at the async function's own top level (see fetchIncoming above for
  // why that distinction matters to react-hooks/set-state-in-effect).
  const fetchItinerary = useCallback(
    (tripId: string) => {
      // The loading/error resets are deferred into the first .then() rather
      // than called synchronously here - this function is called directly
      // from a useEffect below, and even wrapped in .then()-chain style,
      // synchronous setState calls at a function's own top level (before
      // any .then()) still trip react-hooks/set-state-in-effect. Deferring
      // by one microtask is imperceptible for its other, event-handler call
      // sites.
      return Promise.resolve()
        .then(() => {
          setItineraryLoading(true);
          setItineraryError(null);
          return apiService.getTripItinerary(tripId);
        })
        .then((data) => {
          setItinerary(data?.days ?? []);
        })
        .catch((e) => {
          logger.warn('[GroupOrganizer] Failed to fetch itinerary:', e);
          setItinerary([]);
          setItineraryError(t('groupOrganizer.couldNotLoadDaySchedule'));
        })
        .finally(() => {
          setItineraryLoading(false);
        });
    },
    [t],
  );

  useEffect(() => {
    fetchIncoming();
  }, [fetchIncoming]);

  useEffect(() => {
    if (currentTour) {
      fetchTourMembers(currentTour.id);
      void fetchItinerary(currentTour.id);
    }
  }, [selectedTourIdx, tours, currentTour, fetchTourMembers, fetchItinerary]);

  // Create new Tour form
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newDest, setNewDest] = useState('');
  const [newDuration, setNewDuration] = useState('');
  const [newMaxSize, setNewMaxSize] = useState('');
  const [newPrice, setNewPrice] = useState('');

  const handleCreateTour = () => {
    if (!newGroupName.trim() || !newDest.trim() || !newDuration.trim() || !newMaxSize.trim() || !newPrice.trim()) {
      toast(t('groupOrganizer.fillAllTripDetails'), 'error');
      return;
    }

    const globalTripId = `trip-${Date.now()}`;

    const newTour: ActiveTour = {
      id: globalTripId,
      groupName: newGroupName.trim(),
      destination: newDest.trim(),
      durationDays: parseInt(newDuration),
      maxSize: parseInt(newMaxSize),
      currentSize: 1, // Organizer starts inside
      price: parseFloat(newPrice),
      status: 'OPEN',
    };

    const newGlobalTrip = {
      id: globalTripId,
      name: newGroupName.trim(),
      creator: `${profile.name} (Organizer)`,
      cities: [newDest.trim()],
      startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      budget: parseFloat(newPrice),
      availableSeats: parseInt(newMaxSize) - 1,
      totalSeats: parseInt(newMaxSize),
      meetingPoint: 'Organizer Meeting Point',
      guideIncluded: true,
      foodIncluded: true,
      privacy: 'PUBLIC' as const,
      membersCount: 1,
    };

    addTrip(newGlobalTrip);
    setTours([...tours, newTour]);
    setNewGroupName('');
    setNewDest('');
    setNewDuration('');
    setNewMaxSize('');
    setNewPrice('');
    setShowCreateModal(false);
    toast(t('groupOrganizer.tourCreated', { name: newTour.groupName }), 'success');
  };

  const handleApproveRequest = async (reqId: string, userName: string, avatar: string) => {
    try {
      await apiService.updateJoinRequestStatus(reqId, 'APPROVED');
      toast(t('groupOrganizer.requestApproved', { name: userName, tour: currentTour.groupName }), 'success');
      fetchIncoming();
      if (currentTour) {
        fetchTourMembers(currentTour.id);
      }
    } catch (e) {
      logger.warn('Approve request failed:', e);
      toast(t('groupOrganizer.failedToApproveRequest'), 'error');
    }
  };

  const handleRejectRequest = async (reqId: string, userName: string) => {
    try {
      await apiService.updateJoinRequestStatus(reqId, 'REJECTED');
      toast(t('groupOrganizer.requestRejected', { name: userName }), 'info');
      fetchIncoming();
    } catch (e) {
      logger.warn('Reject request failed:', e);
      toast(t('groupOrganizer.failedToRejectRequest'), 'error');
    }
  };

  // docs/REMEDIATION.md §8.6 — "Edit Group Name" and the "Official Chat
  // Join Link" removed: both were pure local useState with no backend call
  // (a rename never touched the real ChatRoom.name column) and the "join
  // link" was a fabricated travelstar.app/chat/join/... string that no
  // route in this app resolves — tapping or sharing it would have done
  // nothing. Real chat rooms are joined by joining the trip, not a link.

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TABS 2: MEMBERS & TOOLS STATE
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // docs/REMEDIATION.md §8.6: "Add Member" and "Remove Member" bypassed the
  // real seat-claiming/join-request system entirely — a manually-added
  // member had a fake id and no TripMember row, and removal never freed a
  // seat back on the server (§5.4's race-safe seat accounting lives in
  // claimSeatAndJoin/releaseSeatAndLeave, keyed off a real join). Building a
  // parallel, safe path for an organizer to add/remove members outside that
  // flow is a larger, separate piece of work — not attempted this pass.
  // Members join for real via the "Chats & Approvals" tab's join-request
  // approval below, which already goes through that system.

  const handleCheckInToggle = async (member: GroupMember) => {
    if (!currentTour) return;
    const next = !member.checkedIn;
    // Optimistic — rolled back if the server rejects it.
    setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, checkedIn: next } : m)));
    try {
      await apiService.updateTripRoster(currentTour.id, member.userId, { checkedIn: next });
    } catch (e) {
      logger.warn('[GroupOrganizer] Check-in update failed:', e);
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, checkedIn: member.checkedIn } : m)));
      toast(t('groupOrganizer.couldNotUpdateCheckIn'), 'error');
    }
  };

  // Roster stats
  const checkedInCount = members.filter((m) => m.checkedIn).length;

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // TABS 3: ITINERARY PLANNER & LOGISTICS
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [logisticsTab, setLogisticsTab] = useState<'itinerary' | 'transport' | 'hotel'>('itinerary');

  const handleAddItineraryDay = async () => {
    if (!newDayTitle.trim() || !newDayDesc.trim()) {
      toast(t('groupOrganizer.pleaseCompleteDayDetails'), 'error');
      return;
    }
    if (!currentTour) return;
    setAddingDay(true);
    try {
      // The day number is assigned server-side, so refetch rather than
      // guessing it from the local array length.
      await apiService.addTripItineraryDay(currentTour.id, {
        title: newDayTitle.trim(),
        plan: newDayDesc.trim(),
      });
      setNewDayTitle('');
      setNewDayDesc('');
      await fetchItinerary(currentTour.id);
    } catch (e) {
      logger.warn('[GroupOrganizer] Failed to add itinerary day:', e);
      toast(t('groupOrganizer.couldNotSaveDay'), 'error');
    } finally {
      setAddingDay(false);
    }
  };

  const handleDeleteItineraryDay = (target: ItineraryDay) => {
    if (!currentTour) return;
    void (async () => {
      const ok = await confirm({
        title: t('groupOrganizer.removeDay'),
        message: t('groupOrganizer.removeDayMessage', { number: target.day, title: target.title }),
        confirmLabel: t('groupOrganizer.remove'),
        destructive: true,
      });
      if (!ok) return;
      try {
        // The server renumbers the days after this one, so take the whole
        // list back from it rather than splicing locally.
        await apiService.deleteTripItineraryDay(currentTour.id, target.id);
        await fetchItinerary(currentTour.id);
      } catch (e) {
        logger.warn('[GroupOrganizer] Failed to delete itinerary day:', e);
        toast(t('groupOrganizer.couldNotRemoveDay'), 'error');
      }
    })();
  };

  // Rooms and Seats allocations states
  // docs/REMEDIATION.md §8.6: both of these used to be pure local
  // setMembers() — discarded the next time fetchTourMembers ran (e.g.
  // switching tours and back). Now a real PATCH, with a rollback on failure.
  //
  // These two used Alert.prompt, which exists only on iOS — on Android and
  // web the allocator buttons did nothing at all, silently. showPrompt is the
  // cross-platform replacement (docs/REMEDIATION.md §9.2).
  const handleAllocateRoom = (member: GroupMember) => {
    if (!currentTour) return;
    void (async () => {
      const room = await showPrompt({
        title: t('groupOrganizer.allocateHotelRoom'),
        message: t('groupOrganizer.setRoomNumberMessage'),
        placeholder: t('groupOrganizer.roomPlaceholder'),
        defaultValue: member.roomAllocated ?? '',
        confirmLabel: t('groupOrganizer.allocate'),
      });
      if (room === null) return;
      const trimmed = room.trim();
      if (!trimmed) return;
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, roomAllocated: trimmed } : m)));
      try {
        await apiService.updateTripRoster(currentTour.id, member.userId, { roomAllocated: trimmed });
      } catch (e) {
        logger.warn('[GroupOrganizer] Room allocation failed:', e);
        setMembers((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, roomAllocated: member.roomAllocated } : m)),
        );
        toast(t('groupOrganizer.couldNotSaveRoomAssignment'), 'error');
      }
    })();
  };

  const handleAllocateSeat = (member: GroupMember) => {
    if (!currentTour) return;
    void (async () => {
      const seat = await showPrompt({
        title: t('groupOrganizer.allocateTransportSeat'),
        message: t('groupOrganizer.setSeatNumberMessage'),
        placeholder: t('groupOrganizer.seatPlaceholder'),
        defaultValue: member.seatAllocated ?? '',
        confirmLabel: t('groupOrganizer.allocate'),
      });
      if (seat === null) return;
      const trimmed = seat.trim();
      if (!trimmed) return;
      setMembers((prev) => prev.map((m) => (m.id === member.id ? { ...m, seatAllocated: trimmed } : m)));
      try {
        await apiService.updateTripRoster(currentTour.id, member.userId, { seatAllocated: trimmed });
      } catch (e) {
        logger.warn('[GroupOrganizer] Seat allocation failed:', e);
        setMembers((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, seatAllocated: member.seatAllocated } : m)),
        );
        toast(t('groupOrganizer.couldNotSaveSeatAssignment'), 'error');
      }
    })();
  };

  // docs/REMEDIATION.md §8.6: removed —
  // • Fake driver info (hardcoded "Jaspreet Singh" for every tour).
  // • Payments tab (three hardcoded names/balances that never changed) and
  //   "Generate Invoice" (an Alert.alert claiming a PDF had been compiled
  //   and emailed — payments/wallet were already removed for v1, §5.5/§5.6,
  //   so there is no real payment data to display here at all).
  // • Documents tab (three hardcoded fake filenames, no real storage).
  // • Group consensus polls — fully local, unauthenticated, unlimited
  //   voting (nothing stopped one person clicking the same option 100
  //   times), no persistence.
  // • The AI Trip Generator — a setTimeout("Simulate AI generation lag",
  //   the code's own comment) that filled in a hardcoded template string
  //   with the typed destination name, presented as if a real model ran.
  // • The QR check-in scanner simulation — a fake scanning animation with
  //   a "Simulate Scanned Participant" picker; there was never a real scan.
  // None of these had a reasonable real backend to wire up in this pass —
  // payments/documents/polls, in particular, would each need their own
  // schema and moderation story, not a quick fix.

  // docs/REMEDIATION.md §8.6 — real announcements, replacing local-only
  // useState + an Alert.alert claiming "broadcasted... via Push
  // Notification" when nothing was sent to anyone. Publishing is real (a
  // Notification row is created for every trip member) — this list itself
  // is the organizer's session-only log of what they've sent, not a fetch
  // of history, since a Notification is stored per-recipient, not per-
  // announcement; there's no single row to list back without deduping N
  // near-identical copies. Reopening the app clears this list; the sent
  // notifications themselves are not lost.
  const [announcements, setAnnouncements] = useState<
    { id: string; title: string; content: string; createdAt: string }[]
  >([]);
  const [newAnnounceTitle, setNewAnnounceTitle] = useState('');
  const [newAnnounceDesc, setNewAnnounceDesc] = useState('');
  const [publishingAnnouncement, setPublishingAnnouncement] = useState(false);

  const handlePublishAnnouncement = async () => {
    if (!newAnnounceTitle.trim() || !newAnnounceDesc.trim()) {
      toast(t('groupOrganizer.fillTitleAndContent'), 'error');
      return;
    }
    if (!currentTour) return;
    setPublishingAnnouncement(true);
    try {
      const result = await apiService.postTripAnnouncement(currentTour.id, {
        title: newAnnounceTitle.trim(),
        content: newAnnounceDesc.trim(),
      });
      setAnnouncements((prev) => [
        {
          id: `a-${Date.now()}`,
          title: newAnnounceTitle.trim(),
          content: newAnnounceDesc.trim(),
          createdAt: t('groupOrganizer.justNow'),
        },
        ...prev,
      ]);
      setNewAnnounceTitle('');
      setNewAnnounceDesc('');
      toast(
        result.recipientCount > 0
          ? t('groupOrganizer.announcementPublished', { count: result.recipientCount })
          : t('groupOrganizer.announcementPublishedNoMembers'),
        result.recipientCount > 0 ? 'success' : 'info',
      );
    } catch (e) {
      logger.warn('[GroupOrganizer] Publish announcement failed:', e);
      toast(t('groupOrganizer.couldNotSendAnnouncement'), 'error');
    } finally {
      setPublishingAnnouncement(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Modern neon header */}
      <LinearGradient
        colors={['rgba(24,30,59,0.85)', 'rgba(4,6,15,0.96)']}
        style={styles.headerGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        <View style={styles.header}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.back()}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('groupOrganizer.goBack')}
          >
            <ArrowLeft size={18} color={C.white} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>{t('groupOrganizer.headerTitle')}</Text>
            <Text style={styles.headerSub}>{t('groupOrganizer.headerSub')}</Text>
          </View>
          <LinearGradient
            colors={['#7C3AED', '#5B21B6']}
            style={styles.badgeOfficialGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <Users size={11} color={C.white} />
            <Text style={styles.badgeOfficialText}>{t('groupOrganizer.adminBadge')}</Text>
          </LinearGradient>
        </View>

        {/* Floating Scrollable Tab Selector */}
        <View style={styles.tabBarContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarScroll}>
            {(
              [
                { key: 'dashboard', labelKey: 'groupOrganizer.tabDashboard', Icon: TrendingUp },
                { key: 'trips', labelKey: 'groupOrganizer.tabToursRoster', Icon: Users },
                { key: 'logistics', labelKey: 'groupOrganizer.tabItineraryRoom', Icon: Hotel },
                { key: 'chat', labelKey: 'groupOrganizer.tabChatsApprovals', Icon: MessageSquare },
              ] as const
            ).map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.tabItem, isActive && styles.tabItemActive]}
                  onPress={() => setActiveTab(tab.key)}
                  activeOpacity={0.85}
                  accessibilityRole="tab"
                  accessibilityLabel={t(tab.labelKey)}
                  accessibilityState={{ selected: isActive }}
                >
                  <tab.Icon size={13} color={isActive ? C.white : C.textSec} strokeWidth={isActive ? 2.5 : 1.8} />
                  <Text style={[styles.tabLabel, { color: isActive ? C.white : C.textSec }]}>{t(tab.labelKey)}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Dropdown Trip Selector */}
        <View style={styles.dropdownTripBar}>
          <Text style={styles.dropdownLabel}>{t('groupOrganizer.activeRosterLabel')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dropdownTripScroll}>
            {tours.map((tour, idx) => {
              const isSel = idx === selectedTourIdx;
              return (
                <TouchableOpacity
                  key={tour.id}
                  style={[styles.dropdownTripBtn, isSel && styles.dropdownTripBtnActive]}
                  onPress={() => setSelectedTourIdx(idx)}
                  accessibilityRole="button"
                  accessibilityLabel={tour.groupName}
                  accessibilityState={{ selected: isSel }}
                >
                  <Text style={[styles.dropdownTripText, { color: isSel ? C.white : C.textSec }]}>{tour.groupName}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </LinearGradient>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* docs/REMEDIATION.md §8.6: `tours` used to always have at least
            one entry (a hardcoded fixture) even for an organizer with zero
            real trips, so every tab below could assume `currentTour`
            existed. It's now sourced entirely from real trips, which means
            it can be empty — this is the real empty state instead of a
            crash or a fake trip. */}
        {!currentTour ? (
          <View style={styles.emptyTourState}>
            <Users size={40} color={C.textMuted} />
            <Text style={styles.emptyTourStateTitle}>{t('groupOrganizer.noToursYetTitle')}</Text>
            <Text style={styles.emptyTourStateDesc}>{t('groupOrganizer.noToursYetDesc')}</Text>
            <TouchableOpacity
              style={styles.createTripBtn}
              onPress={() => setShowCreateModal(true)}
              accessibilityRole="button"
              accessibilityLabel={t('groupOrganizer.launchNewTourGroup')}
            >
              <Plus size={16} color={C.white} />
              <Text style={styles.createTripBtnText}>{t('groupOrganizer.launchNewTourGroup')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ========================================================
            TAB 1: DASHBOARD & ANALYTICS
            ======================================================== */}
            {activeTab === 'dashboard' && (
              <View>
                {/* Dashboard Cards Grid */}
                <View style={styles.metricsGrid}>
                  <LinearGradient colors={['#181e3a', '#0b0d1b']} style={styles.metricCard}>
                    <Users size={16} color={C.blueGlow} />
                    <Text style={styles.metricVal}>
                      {currentTour.currentSize} / {currentTour.maxSize}
                    </Text>
                    <Text style={styles.metricLabel}>{t('groupOrganizer.totalMembers')}</Text>
                  </LinearGradient>

                  <LinearGradient colors={['#181e3a', '#0b0d1b']} style={styles.metricCard}>
                    <Calendar size={16} color={C.purpleGlow} />
                    <Text style={styles.metricVal}>{t('groupOrganizer.upcomingTripsCount', { count: tours.length })}</Text>
                    <Text style={styles.metricLabel}>{t('groupOrganizer.upcomingTrips')}</Text>
                  </LinearGradient>

                  <LinearGradient colors={['#181e3a', '#0b0d1b']} style={styles.metricCard}>
                    <DollarSign size={16} color={C.greenGlow} />
                    <Text style={styles.metricVal}>
                      ₹{(currentTour.currentSize * currentTour.price).toLocaleString('en-IN')}
                    </Text>
                    <Text style={styles.metricLabel}>{t('groupOrganizer.revenueBooking')}</Text>
                  </LinearGradient>

                  <LinearGradient colors={['#181e3a', '#0b0d1b']} style={styles.metricCard}>
                    <Activity size={16} color={C.amberGlow} />
                    <Text style={styles.metricVal}>
                      {t('groupOrganizer.newCount', { count: joinRequests.filter((r) => r.tourId === currentTour.id).length })}
                    </Text>
                    <Text style={styles.metricLabel}>{t('groupOrganizer.pendingRequests')}</Text>
                  </LinearGradient>
                </View>

                {/* Performance Analytics Block */}
                <Text style={styles.sectionLabelInline}>{t('groupOrganizer.reportsStatisticsOverview')}</Text>
                <View style={styles.analyticsBox}>
                  {/* docs/REMEDIATION.md §8.6: this box used to also show a
                  hardcoded "Customer Satisfaction 96%★" and "Cancellation
                  Rate 4.5%" — fabricated numbers with no data behind them —
                  and a "Monthly Gross Revenue Log (Simulated)" bar chart of
                  four made-up values. Removed; occupancy is the one real,
                  derived stat here. */}
                  <View style={styles.statsRow}>
                    <View style={styles.subStatBox}>
                      <Text style={styles.subStatLabel}>{t('groupOrganizer.occupancyRate')}</Text>
                      <Text style={[styles.subStatValue, { color: C.blueGlow }]}>
                        {((currentTour.currentSize / currentTour.maxSize) * 100).toFixed(0)}%
                      </Text>
                    </View>
                    <View style={styles.subStatDivider} />
                    <View style={styles.subStatBox}>
                      <Text style={styles.subStatLabel}>{t('groupOrganizer.checkedIn')}</Text>
                      <Text style={[styles.subStatValue, { color: C.greenGlow }]}>
                        {checkedInCount} / {members.length}
                      </Text>
                    </View>
                    <View style={styles.subStatDivider} />
                    <View style={styles.subStatBox}>
                      <Text style={styles.subStatLabel}>{t('groupOrganizer.pendingRequests')}</Text>
                      <Text style={[styles.subStatValue, { color: C.amberGlow }]}>
                        {joinRequests.filter((r) => r.tourId === currentTour.id).length}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* ========================================================
            TAB 2: TRIP & MEMBER MANAGER
            ======================================================== */}
            {activeTab === 'trips' && (
              <View>
                {/* Roster & Roster Action tools */}
                <View style={styles.leadsHeaderRow}>
                  <View>
                    <Text style={styles.subTitle}>{t('groupOrganizer.participantRosterManagement')}</Text>
                    <Text style={styles.descSec}>{t('groupOrganizer.checkMembersInDesc')}</Text>
                  </View>
                </View>

                {/* Checked-in status bar */}
                {members.length > 0 && (
                  <View style={styles.checkInProgressCard}>
                    <View style={styles.checkInRow}>
                      <Text style={styles.checkInProgressText}>{t('groupOrganizer.rosterCheckedInStatus')}</Text>
                      <Text style={styles.checkInProgressValue}>
                        {t('groupOrganizer.presentCount', { count: checkedInCount, total: members.length })}
                      </Text>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${(checkedInCount / members.length) * 100}%`, backgroundColor: C.green },
                        ]}
                      />
                    </View>
                  </View>
                )}

                {members.map((member) => (
                  <View key={member.id} style={styles.memberListItemCard}>
                    <View style={styles.memberItemHeader}>
                      <Image source={{ uri: member.avatar }} style={styles.memberAvatar} />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <View style={styles.memberTitleRow}>
                          <Text style={styles.memberName}>{member.name}</Text>
                          <View
                            style={[
                              styles.roleBadge,
                              member.role === 'LEADER'
                                ? { backgroundColor: C.blueGlow }
                                : member.role === 'GUIDE'
                                  ? { backgroundColor: C.purpleGlow }
                                  : { backgroundColor: C.border },
                            ]}
                          >
                            <Text style={styles.roleBadgeText}>{t(ROLE_LABEL_KEYS[member.role])}</Text>
                          </View>
                        </View>
                      </View>
                    </View>

                    {/* docs/REMEDIATION.md §8.6: the organizer's own row (LEADER)
                    has no TripMember row to check in — nothing to toggle. */}
                    {member.role !== 'LEADER' && (
                      <>
                        <View style={styles.memberActionsDivider} />
                        <View style={styles.memberListItemActions}>
                          <TouchableOpacity
                            style={[
                              styles.memberActionToggleBtn,
                              member.checkedIn ? styles.memberActionToggleBtnActive : {},
                            ]}
                            onPress={() => handleCheckInToggle(member)}
                            accessibilityRole="switch"
                            accessibilityLabel={t('groupOrganizer.checkInLabel')}
                            accessibilityState={{ checked: !!member.checkedIn }}
                          >
                            <CheckCircle size={12} color={member.checkedIn ? C.white : C.textSec} />
                            <Text
                              style={[
                                styles.memberActionToggleBtnLabel,
                                { color: member.checkedIn ? C.white : C.textSec },
                              ]}
                            >
                              {member.checkedIn ? t('groupOrganizer.checkedInLabel') : t('groupOrganizer.checkInLabel')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </>
                    )}
                  </View>
                ))}

                {/* Trip management tool */}
                <View style={styles.cardHeader}>
                  <Text style={styles.subTitle}>{t('groupOrganizer.configureTourInformation')}</Text>
                  <Text style={styles.descSec}>{t('groupOrganizer.configureTourDesc')}</Text>
                </View>

                {/* Unified Trip Card Design */}
                <View style={[styles.tripCard, { marginBottom: 16 }]}>
                  {/* Left side: Image — docs/REMEDIATION.md §8.6: this used to
                  be a hardcoded Unsplash photo for every tour regardless of
                  the real trip's own cover image (see §8.4's real upload
                  flow in create.tsx). */}
                  <View style={styles.tripImageContainer}>
                    <Image
                      source={{
                        uri:
                          currentTour.coverImage ||
                          'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&q=80',
                      }}
                      style={styles.tripImage}
                    />
                    <LinearGradient
                      colors={['rgba(0, 0, 0, 0.65)', 'rgba(0, 0, 0, 0.1)', 'rgba(0, 0, 0, 0.75)']}
                      locations={[0, 0.45, 1]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={[styles.tripBadge, { backgroundColor: '#6C5CE7' }]}>
                      <Text style={styles.tripBadgeText}>{t('groupOrganizer.activeTourBadge')}</Text>
                    </View>
                  </View>

                  {/* Right side: Detailed trip content */}
                  <View style={styles.tripContent}>
                    <Text style={styles.tripName} numberOfLines={2}>
                      {currentTour.groupName}
                    </Text>

                    {/* docs/REMEDIATION.md §8.6: this row also carried a fixed
                    "4.8★"/"Verified Route" badge for every tour — removed;
                    there is no real rating system for trips (§8.14, not
                    built). Seats-left is real. */}
                    <View style={styles.tripDetailsMetaRow}>
                      <Text style={{ fontSize: 12, fontWeight: '600', color: '#10B981' }}>
                        {t('groupOrganizer.seatsLeft', { count: currentTour.maxSize - currentTour.currentSize })}
                      </Text>
                    </View>

                    {/* Route cities with arrow */}
                    <View style={styles.routeCities}>
                      <Text style={styles.cityText}>{currentTour.destination}</Text>
                    </View>

                    {/* Subtitle / capsules */}
                    <View style={styles.capsulesRow}>
                      <View style={styles.capsule}>
                        <Clock size={8} color="#7E8494" />
                        <Text style={styles.capsuleText} numberOfLines={1}>
                          {t('groupOrganizer.daysCount', { count: currentTour.durationDays })}
                        </Text>
                      </View>
                      <View style={styles.capsule}>
                        <Users size={8} color="#7E8494" />
                        <Text style={styles.capsuleText} numberOfLines={1}>
                          {t('groupOrganizer.membersCount', { current: currentTour.currentSize, max: currentTour.maxSize })}
                        </Text>
                      </View>
                    </View>

                    {/* Price and Action Buttons */}
                    <View style={styles.priceRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.priceLabel}>{t('groupOrganizer.packageCost')}</Text>
                        <Text style={styles.priceAmount}>₹{currentTour.price.toLocaleString('en-IN')}</Text>
                      </View>
                      <View style={{ gap: 4, width: 110 }}>
                        {/* docs/REMEDIATION.md §8.6: "Edit Details" used to be
                        an Alert.alert claiming "Edit configuration mode is
                        active" — there was never an edit mode. Removed;
                        the trip's own fields are configured at creation
                        time below. */}
                        <TouchableOpacity
                          style={[
                            styles.joinBtn,
                            {
                              backgroundColor: 'transparent',
                              borderWidth: 1,
                              borderColor: '#0066FF',
                              paddingVertical: 4,
                            },
                          ]}
                          onPress={() => {
                            setActiveTab('chat');
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={t('groupOrganizer.openChat')}
                        >
                          <MessageSquare size={9} color="#0066FF" style={{ marginRight: 2 }} />
                          <Text style={[styles.joinBtnText, { color: '#0066FF' }]}>{t('groupOrganizer.openChat')}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                </View>

                <View style={styles.tripManagerConfigBox}>
                  <View style={styles.tripDetailField}>
                    <Text style={styles.tripFieldLabel}>{t('groupOrganizer.destinationTarget')}</Text>
                    <Text style={styles.tripFieldValue}>{currentTour.destination}</Text>
                  </View>

                  <View style={styles.tripDetailField}>
                    <Text style={styles.tripFieldLabel}>{t('groupOrganizer.tourDuration')}</Text>
                    <Text style={styles.tripFieldValue}>{t('groupOrganizer.daysCount', { count: currentTour.durationDays })}</Text>
                  </View>

                  <View style={styles.tripDetailField}>
                    <Text style={styles.tripFieldLabel}>{t('groupOrganizer.maxGroupCapacity')}</Text>
                    <Text style={styles.tripFieldValue}>{t('groupOrganizer.personsCount', { count: currentTour.maxSize })}</Text>
                  </View>

                  <View style={styles.tripDetailField}>
                    <Text style={styles.tripFieldLabel}>{t('groupOrganizer.pricePerTouristPackage')}</Text>
                    <Text style={styles.tripFieldValue}>₹{currentTour.price.toLocaleString('en-IN')}</Text>
                  </View>

                  <View style={styles.tripDetailField}>
                    <Text style={styles.tripFieldLabel}>{t('groupOrganizer.currentStatus')}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            currentTour.status === 'OPEN' ? C.green : currentTour.status === 'FULL' ? C.amber : C.rose,
                        },
                      ]}
                    >
                      <Text style={styles.statusBadgeText}>{t(STATUS_LABEL_KEYS[currentTour.status])}</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.createTripBtn}
                    onPress={() => setShowCreateModal(true)}
                    accessibilityRole="button"
                    accessibilityLabel={t('groupOrganizer.launchNewTourGroup')}
                  >
                    <Plus size={16} color={C.white} />
                    <Text style={styles.createTripBtnText}>{t('groupOrganizer.launchNewTourGroup')}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ========================================================
            TAB 3: ITINERARY PLANNER & LOGISTICS
            ======================================================== */}
            {activeTab === 'logistics' && (
              <View>
                {/* Logistics Subtabs */}
                <View style={styles.plannerSubTabs}>
                  {(
                    [
                      { key: 'itinerary', labelKey: 'groupOrganizer.subtabDaySchedule', Icon: Calendar },
                      { key: 'transport', labelKey: 'groupOrganizer.subtabTransport', Icon: Car },
                      { key: 'hotel', labelKey: 'groupOrganizer.subtabRoomAssigns', Icon: Hotel },
                    ] as const
                  ).map((sTab) => {
                    const isSubActive = logisticsTab === sTab.key;
                    return (
                      <TouchableOpacity
                        key={sTab.key}
                        style={[styles.plannerSubTabItem, isSubActive && styles.plannerSubTabItemActive]}
                        onPress={() => setLogisticsTab(sTab.key)}
                        accessibilityRole="tab"
                        accessibilityLabel={t(sTab.labelKey)}
                        accessibilityState={{ selected: isSubActive }}
                      >
                        <Text style={[styles.plannerSubTabLabel, { color: isSubActive ? C.blueGlow : C.textSec }]}>
                          {t(sTab.labelKey)}
                        </Text>
                        {isSubActive && <View style={styles.plannerSubTabIndicator} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* 3A: Day Schedule */}
                {logisticsTab === 'itinerary' && (
                  <View style={styles.innerPlannerSection}>
                    <Text style={styles.subTitle}>{t('groupOrganizer.dayWiseScheduleDetails')}</Text>
                    <Text style={styles.descSec}>{t('groupOrganizer.dayScheduleDesc')}</Text>

                    {itineraryLoading && itinerary.length === 0 ? (
                      <View style={styles.itineraryStateBox}>
                        <ActivityIndicator size="small" color={C.blueGlow} />
                        <Text style={styles.itineraryStateText}>{t('groupOrganizer.loadingDaySchedule')}</Text>
                      </View>
                    ) : itineraryError ? (
                      <View style={styles.itineraryStateBox}>
                        <Text style={styles.itineraryStateText}>{itineraryError}</Text>
                        <TouchableOpacity
                          onPress={() => currentTour && fetchItinerary(currentTour.id)}
                          hitSlop={{ top: 14, bottom: 14, left: 10, right: 10 }}
                          accessibilityRole="button"
                          accessibilityLabel={t('groupOrganizer.retry')}
                        >
                          <Text style={styles.itineraryRetryText}>{t('groupOrganizer.retry')}</Text>
                        </TouchableOpacity>
                      </View>
                    ) : itinerary.length === 0 ? (
                      <View style={styles.itineraryStateBox}>
                        <Text style={styles.itineraryStateText}>{t('groupOrganizer.noDaysPlannedYet')}</Text>
                      </View>
                    ) : (
                      itinerary.map((day) => (
                        <TouchableOpacity
                          key={day.id}
                          style={styles.dayCard}
                          activeOpacity={0.8}
                          onLongPress={() => handleDeleteItineraryDay(day)}
                          accessibilityRole="button"
                          accessibilityLabel={t('groupOrganizer.dayNumber', { number: day.day })}
                          accessibilityHint={t('groupOrganizer.deleteDayHint')}
                        >
                          <View style={styles.dayHeader}>
                            <Text style={styles.dayNumber}>{t('groupOrganizer.dayNumber', { number: day.day })}</Text>
                            <Text style={styles.dayTitleText}>{day.title}</Text>
                          </View>
                          <Text style={styles.dayActivitiesText}>{day.plan}</Text>
                        </TouchableOpacity>
                      ))
                    )}

                    <View style={styles.addDayBox}>
                      <Text style={styles.addDayBoxTitle}>{t('groupOrganizer.addScheduleDay')}</Text>
                      <Text style={styles.formInputLabel}>{t('groupOrganizer.dayHeading')}</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder={t('groupOrganizer.dayHeadingPlaceholder')}
                        placeholderTextColor={C.textMuted}
                        value={newDayTitle}
                        onChangeText={setNewDayTitle}
                      />

                      <Text style={styles.formInputLabel}>{t('groupOrganizer.planActivities')}</Text>
                      <TextInput
                        style={[styles.formInput, { height: 60, textAlignVertical: 'top' }]}
                        placeholder={t('groupOrganizer.planActivitiesPlaceholder')}
                        placeholderTextColor={C.textMuted}
                        multiline
                        value={newDayDesc}
                        onChangeText={setNewDayDesc}
                      />

                      <TouchableOpacity
                        style={[styles.addDayBtn, addingDay && { opacity: 0.6 }]}
                        onPress={handleAddItineraryDay}
                        disabled={addingDay}
                        accessibilityRole="button"
                        accessibilityLabel={t('groupOrganizer.insertItineraryDay')}
                      >
                        {addingDay ? (
                          <ActivityIndicator size="small" color={C.white} />
                        ) : (
                          <Plus size={14} color={C.white} />
                        )}
                        <Text style={styles.addDayBtnText}>
                          {addingDay ? t('groupOrganizer.saving') : t('groupOrganizer.insertItineraryDay')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* 3B: Transport Manager */}
                {logisticsTab === 'transport' && (
                  <View style={styles.innerPlannerSection}>
                    {/* docs/REMEDIATION.md §8.6: this tab also showed a
                    hardcoded driver/vehicle card ("Jaspreet Singh", a fixed
                    phone number and bus, for every tour) — removed; there
                    is no real driver-assignment feature or schema behind
                    it. Seat allocation below is real. */}
                    <Text style={styles.subTitle}>{t('groupOrganizer.seatAllocationMatrix')}</Text>
                    <Text style={styles.descSec}>{t('groupOrganizer.assignTransportSeatsDesc')}</Text>

                    {members
                      .filter((m) => m.role !== 'LEADER')
                      .map((m) => (
                        <View key={m.id} style={styles.allocationRowItem}>
                          <Text style={styles.allocNameText}>{m.name}</Text>
                          <TouchableOpacity
                            style={styles.allocButton}
                            onPress={() => handleAllocateSeat(m)}
                            accessibilityRole="button"
                            accessibilityLabel={t('groupOrganizer.allocateTransportSeat')}
                          >
                            <Text style={styles.allocButtonText}>{m.seatAllocated || t('groupOrganizer.unassigned')}</Text>
                            <ExternalLink size={10} color={C.blueGlow} />
                          </TouchableOpacity>
                        </View>
                      ))}
                  </View>
                )}

                {/* 3C: Room Assignments */}
                {logisticsTab === 'hotel' && (
                  <View style={styles.innerPlannerSection}>
                    <Text style={styles.subTitle}>{t('groupOrganizer.hotelRoomAllocationMatrix')}</Text>
                    <Text style={styles.descSec}>{t('groupOrganizer.assignHotelRoomsDesc')}</Text>

                    {members
                      .filter((m) => m.role !== 'LEADER')
                      .map((m) => (
                        <View key={m.id} style={styles.allocationRowItem}>
                          <Text style={styles.allocNameText}>{m.name}</Text>
                          <TouchableOpacity
                            style={styles.allocButton}
                            onPress={() => handleAllocateRoom(m)}
                            accessibilityRole="button"
                            accessibilityLabel={t('groupOrganizer.allocateHotelRoom')}
                          >
                            <Text style={styles.allocButtonText}>{m.roomAllocated || t('groupOrganizer.unassigned')}</Text>
                            <ExternalLink size={10} color={C.blueGlow} />
                          </TouchableOpacity>
                        </View>
                      ))}
                  </View>
                )}

                {/* docs/REMEDIATION.md §8.6: a "Meal Dietary" subtab used to
                live here — a per-member `diet` hardcoded to 'VEG' for
                every member on every fetch, with zero edit affordance
                (nothing ever set it to anything else), so the "counts" it
                displayed were entirely decorative. Removed outright rather
                than kept as a fake field with no real data behind it. */}
              </View>
            )}

            {/* docs/REMEDIATION.md §8.6: a "Billing & Permit" tab used to live
            here — three hardcoded names/deposits/balances that never
            changed no matter which tour was selected, a fake permit/
            insurance/ticket document list, and "Generate Invoice"/document
            approval that did nothing but show an Alert.alert. Payments and
            wallet were already removed from this app for v1 (§5.5/§5.6),
            so there is no real payment or document-storage data to show
            here — removed rather than rebuilt, which would mean bringing
            payments back. */}

            {/* ========================================================
            TAB 5: COMM & JOIN MODERATION
            ======================================================== */}
            {activeTab === 'chat' && (
              <View>
                {/* Chat Moderation Panel */}
                <View style={styles.chatGroupModeratorHeader}>
                  <View>
                    <Text style={styles.subTitle}>{t('groupOrganizer.groupChatModeration')}</Text>
                    <Text style={styles.descSec}>{t('groupOrganizer.approveJoinRequestsDesc')}</Text>
                  </View>
                </View>

                {/* Moderation List of Requests */}
                <Text style={styles.sectionLabelInline}>{t('groupOrganizer.pendingChatJoinRequests')}</Text>
                {joinRequests.filter((r) => r.tourId === currentTour.id).length === 0 ? (
                  <View style={styles.emptyRequestsCard}>
                    <CheckCircle size={18} color={C.green} />
                    <Text style={styles.emptyRequestsText}>{t('groupOrganizer.allRequestsProcessed')}</Text>
                  </View>
                ) : (
                  joinRequests
                    .filter((r) => r.tourId === currentTour.id)
                    .map((req) => (
                      <View key={req.id} style={styles.requestItemCard}>
                        <View style={styles.requestHeaderRow}>
                          <Image source={{ uri: req.userAvatar }} style={styles.reqAvatar} />
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.reqName}>{req.userName}</Text>
                            {/* No applicant message is rendered here. There
                                is no message field on JoinRequest and the
                                endpoint never sent one, so this used to
                                quote a hardcoded "Would love to join this
                                group tour!" back to the organizer as though
                                the applicant had written it — the same
                                sentence for every person who ever applied
                                (docs/REMEDIATION.md §0.2 rule 4). */}
                          </View>
                        </View>

                        <View style={styles.reqActionButtonsRow}>
                          <TouchableOpacity
                            style={[styles.reqBtn, styles.reqBtnReject]}
                            onPress={() => handleRejectRequest(req.id, req.userName)}
                            accessibilityRole="button"
                            accessibilityLabel={t('groupOrganizer.reject')}
                          >
                            <X size={12} color={C.rose} />
                            <Text style={styles.reqBtnRejectText}>{t('groupOrganizer.reject')}</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={[styles.reqBtn, styles.reqBtnApprove]}
                            onPress={() => handleApproveRequest(req.id, req.userName, req.userAvatar)}
                            accessibilityRole="button"
                            accessibilityLabel={t('groupOrganizer.approveJoin')}
                          >
                            <Check size={12} color={C.white} />
                            <Text style={styles.reqBtnApproveText}>{t('groupOrganizer.approveJoin')}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))
                )}

                {/* Announcements Panel */}
                <Text style={styles.subTitle}>{t('groupOrganizer.groupAnnouncements')}</Text>
                <Text style={styles.descSec}>{t('groupOrganizer.broadcastWarningsDesc')}</Text>

                {announcements.map((ann) => (
                  <View key={ann.id} style={styles.announceCard}>
                    <View style={styles.announceCardHeader}>
                      <Text style={styles.announceCardTitle}>{ann.title}</Text>
                      <Text style={styles.announceCardDate}>{formatRelative(ann.createdAt)}</Text>
                    </View>
                    <Text style={styles.announceCardContent}>{ann.content}</Text>
                  </View>
                ))}

                <View style={styles.addAnnounceBox}>
                  <Text style={styles.formInputLabel}>{t('groupOrganizer.noticeTitle')}</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder={t('groupOrganizer.noticeTitlePlaceholder')}
                    placeholderTextColor={C.textMuted}
                    value={newAnnounceTitle}
                    onChangeText={setNewAnnounceTitle}
                  />
                  <Text style={styles.formInputLabel}>{t('groupOrganizer.noticeDescription')}</Text>
                  <TextInput
                    style={[styles.formInput, { height: 50 }]}
                    placeholder={t('groupOrganizer.noticeDescriptionPlaceholder')}
                    placeholderTextColor={C.textMuted}
                    value={newAnnounceDesc}
                    onChangeText={setNewAnnounceDesc}
                  />
                  <TouchableOpacity
                    style={[styles.announceBtn, publishingAnnouncement && { opacity: 0.6 }]}
                    onPress={handlePublishAnnouncement}
                    disabled={publishingAnnouncement}
                    accessibilityRole="button"
                    accessibilityLabel={t('groupOrganizer.broadcastNotice')}
                  >
                    <Send size={12} color={C.white} />
                    <Text style={styles.announceBtnText}>
                      {publishingAnnouncement ? t('groupOrganizer.sending') : t('groupOrganizer.broadcastNotice')}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* docs/REMEDIATION.md §8.6: a "Live GPS & AI Desk" tab used to
            live here, with three sub-tools:
            • "GPS Tracking" — a hand-drawn "Mock GPS Map Drawing" (the
              code's own comment) of fixed-position dots labelled with
              fabricated first names, not live data, plus a "Trigger
              Emergency Alarm" button that showed an Alert.alert claiming a
              real safety warning had been broadcast to every participant's
              device — nothing was sent. That is dangerous UI to leave in:
              an organizer could believe they had broadcast a real
              emergency warning when nothing happened. The app's real live
              map (with the real SOS system, §3.4/§8.9) is the separate
              /map screen.
            • "AI Generator" — a setTimeout("Simulate AI generation lag",
              the code's own comment) that filled a hardcoded template
              string with the typed destination name, presented as if a
              real model had generated it.
            • "QR Scanner" — a fake scanning animation with a "Simulate
              Scanned Participant" picker; there was never a real scan or
              a real ticket to validate.
            None of these had a real backend or a reasonable one to build
            in this pass — removed rather than left as decorative or
            (for the SOS button) actively misleading UI. */}
          </>
        )}

        {/* Bottom Spacer */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* CREATE NEW TOUR SHEET */}
      <Sheet visible={showCreateModal} onClose={() => setShowCreateModal(false)} title={t('groupOrganizer.launchNewTourGroup')}>
        <Text style={styles.modalDesc}>{t('groupOrganizer.launchNewTourGroupDesc')}</Text>

        <Input
          label={t('groupOrganizer.tourGroupName')}
          placeholder={t('groupOrganizer.tourGroupNamePlaceholder')}
          value={newGroupName}
          onChangeText={setNewGroupName}
          containerStyle={styles.modalFieldGap}
        />

        <Input
          label={t('groupOrganizer.destinationTarget')}
          placeholder={t('groupOrganizer.destinationTargetPlaceholder')}
          value={newDest}
          onChangeText={setNewDest}
          containerStyle={styles.modalFieldGap}
        />

        <View style={[styles.modalInputRow, styles.modalFieldGap]}>
          <Input
            label={t('groupOrganizer.durationDays')}
            placeholder={t('groupOrganizer.durationDaysPlaceholder')}
            keyboardType="numeric"
            value={newDuration}
            onChangeText={setNewDuration}
            containerStyle={{ flex: 1, marginRight: 8 }}
          />
          <Input
            label={t('groupOrganizer.maxCapacity')}
            placeholder={t('groupOrganizer.maxCapacityPlaceholder')}
            keyboardType="numeric"
            value={newMaxSize}
            onChangeText={setNewMaxSize}
            containerStyle={{ flex: 1 }}
          />
        </View>

        <Input
          label={t('groupOrganizer.pricePackagePerHead')}
          placeholder={t('groupOrganizer.pricePackagePerHeadPlaceholder')}
          keyboardType="numeric"
          value={newPrice}
          onChangeText={setNewPrice}
          containerStyle={styles.modalFieldGap}
        />

        <View style={styles.modalActionRow}>
          <Button
            label={t('common.cancel')}
            variant="secondary"
            onPress={() => setShowCreateModal(false)}
            style={{ flex: 1 }}
          />
          <Button label={t('groupOrganizer.createTourGroup')} onPress={handleCreateTour} style={{ flex: 1 }} />
        </View>
      </Sheet>
    </SafeAreaView>
  );
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// STYLESheet
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  tripCard: {
    flexDirection: 'row',
    backgroundColor: '#0c0f1d',
    borderColor: '#22294c',
    borderWidth: 1.5,
    borderRadius: 16,
    overflow: 'hidden',
    minHeight: 180,
  },
  tripImageContainer: {
    width: 110,
    alignSelf: 'stretch',
    position: 'relative',
    backgroundColor: '#000',
  },
  tripImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  tripBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
    zIndex: 2,
  },
  tripBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFF',
  },
  tripContent: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
  },
  tripName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
    lineHeight: 18,
  },
  tripDetailsMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  routeCities: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  cityText: {
    fontSize: 12,
    fontWeight: '700',
    color: C.blue,
  },
  capsulesRow: {
    flexDirection: 'row',
    gap: 4,
    marginVertical: 2,
  },
  capsule: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#14182f',
    paddingHorizontal: 5,
    paddingVertical: 3.5,
    borderRadius: 5,
    gap: 2,
  },
  capsuleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#a2a9c3',
    flex: 1,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: '#22294c',
    paddingTop: 6,
    marginTop: 4,
  },
  priceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.textMuted,
  },
  priceAmount: {
    fontSize: 17,
    fontWeight: '900',
    color: C.blue,
    marginTop: -2,
  },
  joinBtn: {
    backgroundColor: C.blue,
    paddingVertical: 5,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // Header Visuals
  headerGradient: {
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: C.text,
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    color: C.textSec,
  },
  badgeOfficialGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 4,
    shadowColor: C.purple,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  badgeOfficialText: {
    fontSize: 12,
    fontWeight: '900',
    color: C.white,
    letterSpacing: 0.4,
  },

  // Scrollable Horizontal Tab Selector
  tabBarContainer: {
    paddingHorizontal: 10,
    marginTop: 6,
  },
  tabBarScroll: {
    flexDirection: 'row',
    gap: 6,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    gap: 5,
  },
  tabItemActive: {
    backgroundColor: C.blue,
    borderColor: C.blueGlow,
    shadowColor: C.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Dropdown selectors
  dropdownTripBar: {
    paddingHorizontal: 16,
    marginTop: 10,
  },
  dropdownLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: C.textMuted,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  dropdownTripScroll: {
    flexDirection: 'row',
    gap: 6,
  },
  dropdownTripBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.04)',
    marginRight: 6,
  },
  dropdownTripBtnActive: {
    borderColor: C.purpleGlow,
    backgroundColor: 'rgba(139,92,246,0.12)',
  },
  dropdownTripText: {
    fontSize: 12,
    fontWeight: '800',
  },

  // Section titles
  subTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: C.white,
    marginTop: 20,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  descSec: {
    fontSize: 12,
    color: C.textSec,
    marginBottom: 14,
  },
  sectionLabelInline: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
    marginTop: 18,
    marginBottom: 10,
    letterSpacing: 0.2,
  },

  // Dashboard Tab Styles
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  metricCard: {
    width: (SCREEN_WIDTH - 42) / 2,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.2,
    borderColor: C.border,
    justifyContent: 'space-between',
    height: 90,
  },
  metricVal: {
    fontSize: 16,
    fontWeight: '900',
    color: C.white,
    marginTop: 8,
  },
  metricLabel: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '700',
  },

  // Reports & Analytics
  analyticsBox: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  subStatBox: {
    flex: 1,
    alignItems: 'center',
  },
  subStatDivider: {
    width: 1.2,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  subStatLabel: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '700',
    marginBottom: 4,
  },
  subStatValue: {
    fontSize: 16,
    fontWeight: '900',
  },

  // TAB 2: TRIP & MEMBER MANAGER
  checkInProgressCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 14,
  },
  checkInRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  checkInProgressText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },
  checkInProgressValue: {
    fontSize: 12,
    fontWeight: '900',
    color: C.greenGlow,
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  memberListItemCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 12,
  },
  memberItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  memberTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: C.white,
  },
  roleBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: C.white,
  },
  memberActionsDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 12,
  },
  memberListItemActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  memberActionToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  memberActionToggleBtnActive: {
    backgroundColor: C.green,
    borderColor: C.greenGlow,
  },
  memberActionToggleBtnLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  tripManagerConfigBox: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 20,
    gap: 12,
  },
  tripDetailField: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
    paddingBottom: 8,
  },
  tripFieldLabel: {
    fontSize: 12,
    color: C.textSec,
    fontWeight: '700',
  },
  tripFieldValue: {
    fontSize: 12.5,
    color: C.white,
    fontWeight: '800',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: C.white,
  },
  createTripBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: MIN_TOUCH_TARGET,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  createTripBtnText: {
    color: C.white,
    fontSize: 12.5,
    fontWeight: '800',
  },
  emptyTourState: {
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 60,
  },
  emptyTourStateTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: C.white,
    marginTop: 14,
    marginBottom: 6,
  },
  emptyTourStateDesc: {
    fontSize: 12.5,
    color: C.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 18,
  },

  // TAB 3: ITINERARY PLANNER & LOGISTICS
  plannerSubTabs: {
    flexDirection: 'row',
    backgroundColor: C.card,
    borderRadius: 14,
    padding: 4,
    marginTop: 4,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  plannerSubTabItem: {
    flex: 1,
    paddingVertical: 9,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    position: 'relative',
  },
  plannerSubTabItemActive: {
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  plannerSubTabLabel: {
    fontSize: 12,
    fontWeight: '800',
  },
  plannerSubTabIndicator: {
    position: 'absolute',
    bottom: 0,
    width: 14,
    height: 2,
    backgroundColor: C.blueGlow,
    borderRadius: 1,
  },
  innerPlannerSection: {
    marginTop: 8,
  },
  itineraryStateBox: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 18,
    marginBottom: 10,
    alignItems: 'center',
    gap: 8,
  },
  itineraryStateText: {
    color: C.textSec,
    fontSize: 12.5,
    textAlign: 'center',
  },
  itineraryRetryText: {
    color: C.blueGlow,
    fontSize: 12.5,
    fontWeight: '700',
  },
  dayCard: {
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: C.border,
    padding: 14,
    marginBottom: 10,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  dayNumber: {
    fontSize: 12,
    fontWeight: '900',
    color: C.blueGlow,
    backgroundColor: 'rgba(0,102,255,0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  dayTitleText: {
    fontSize: 13,
    fontWeight: '800',
    color: C.white,
    flex: 1,
  },
  dayActivitiesText: {
    fontSize: 12,
    color: C.textSec,
    lineHeight: 17,
    fontWeight: '500',
  },
  addDayBox: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: C.border,
    marginTop: 14,
    marginBottom: 24,
  },
  addDayBoxTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: C.white,
    marginBottom: 4,
  },
  addDayBtn: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,102,255,0.12)',
    borderWidth: 1.2,
    borderColor: C.blue,
    height: MIN_TOUCH_TARGET,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
  },
  addDayBtnText: {
    color: C.blueGlow,
    fontSize: 12,
    fontWeight: '800',
  },

  // Transport details style
  allocationRowItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1.2,
    borderColor: C.border,
    marginBottom: 8,
  },
  allocNameText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: C.white,
  },
  allocButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: 'rgba(0,102,255,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 8,
  },
  allocButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.blueGlow,
  },

  // Stays lodging card

  // Meal management

  // TAB 4: PAYMENTS & DOCUMENTS

  // Doc lists

  // TAB 5: CHAT & MODERATION
  chatGroupModeratorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  emptyRequestsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.06)',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.18)',
    marginBottom: 16,
  },
  emptyRequestsText: {
    flex: 1,
    fontSize: 12,
    color: C.textSec,
    fontWeight: '600',
  },
  requestItemCard: {
    backgroundColor: C.card,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 10,
  },
  requestHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reqAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  reqName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  reqMsg: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 2,
    fontStyle: 'italic',
  },
  reqActionButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  reqBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 8,
  },
  reqBtnReject: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
  },
  reqBtnRejectText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.roseGlow,
  },
  reqBtnApprove: {
    backgroundColor: C.green,
  },
  reqBtnApproveText: {
    fontSize: 12,
    fontWeight: '800',
    color: C.white,
  },

  // Announcements
  announceCard: {
    backgroundColor: C.cardAlt,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.2,
    borderColor: C.border,
    marginBottom: 10,
  },
  announceCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  announceCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: C.white,
  },
  announceCardDate: {
    fontSize: 12,
    color: C.textMuted,
    fontWeight: '700',
  },
  announceCardContent: {
    fontSize: 12,
    color: C.textSec,
    lineHeight: 16,
    fontWeight: '500',
  },
  addAnnounceBox: {
    backgroundColor: C.card,
    borderRadius: 22,
    padding: 14,
    borderWidth: 1.5,
    borderColor: C.border,
    marginBottom: 20,
  },
  announceBtn: {
    flexDirection: 'row',
    backgroundColor: C.blue,
    height: MIN_TOUCH_TARGET,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  announceBtnText: {
    color: C.white,
    fontSize: 12,
    fontWeight: '800',
  },

  // Decision polls

  // TAB 6: GPS & AI

  // AI Planner

  // QR checkins scanner

  // Create Tour sheet content (chrome itself now comes from <Sheet>)
  modalDesc: {
    fontSize: 12,
    color: C.textSec,
    marginTop: 6,
    lineHeight: 18,
    fontWeight: '500',
  },
  modalFieldGap: {
    marginTop: 14,
  },
  modalInputRow: {
    flexDirection: 'row',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },

  // Missing Style Definitions
  leadsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 2,
  },
  cardHeader: {
    marginTop: 4,
  },
  formInputLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: C.textSec,
    marginTop: 14,
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1.5,
    borderColor: C.border,
    borderRadius: 12,
    height: 40,
    paddingHorizontal: 12,
    color: C.white,
    fontSize: 12.5,
    fontWeight: '600',
  },
});
