// Organizer: verify a paid traveller's booking token and assign their seat,
// vehicle, hotel and room for every stop of the trip. Submitting confirms
// the booking — the server then makes them a member, adds them to the group
// chat, posts "[name] has joined the trip!" and sends them their Trip Pass.
//
// Two views in one sheet: the queue of travellers awaiting allocation (paid
// bookings show their token; free-trip approvals have none), and the
// per-traveller form, with one section per checkpoint built from the trip's
// own timeline (falling back to its itinerary days, then to a single stop).
import { errorToastMessage, toast } from '@/lib/feedback';
import { formatINR } from '@/lib/money';
import { apiService } from '@/services/api';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import type { AllocationSubmission, PendingAllocationTraveller, PendingAllocations } from '@/types/api';
import { useQuery } from '@tanstack/react-query';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import BedDouble from 'lucide-react-native/icons/bed-double';
import Bus from 'lucide-react-native/icons/bus';
import CheckCircle from 'lucide-react-native/icons/circle-check-big';
import Copy from 'lucide-react-native/icons/copy';
import KeyRound from 'lucide-react-native/icons/key-round';
import MapPin from 'lucide-react-native/icons/map-pin';
import X from 'lucide-react-native/icons/x';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  visible: boolean;
  tripId: string | null;
  /** Open straight into this traveller's form. */
  initialJoinRequestId?: string | null;
  onClose: () => void;
  /** A booking was confirmed (refresh requests / roster). */
  onConfirmed: (joinRequestId: string) => void;
};

type Section = {
  key: string;
  tripTimelineStopId?: string;
  dayNumber: number;
  checkpointName: string;
  defaultTransit: string;
};

type SectionValues = {
  hotelName: string;
  roomNumber: string;
  transitType: string;
  vehicleNumber: string;
  seatNumber: string;
  assemblyTime: string;
  notes: string;
};

const TRANSIT_TYPES = ['BUS', 'CAB', 'TRAIN', 'FLIGHT'] as const;
const REQUIRED: (keyof SectionValues)[] = ['hotelName', 'roomNumber', 'vehicleNumber', 'seatNumber'];

/** One section per checkpoint, each on the day the group arrives there. */
function buildSections(data: PendingAllocations): Section[] {
  if (data.stops.length > 0) {
    let day = 1;
    return data.stops.map((stop) => {
      const section: Section = {
        key: stop.id,
        tripTimelineStopId: stop.id,
        dayNumber: day,
        checkpointName: stop.city,
        defaultTransit: stop.transitMode ?? 'BUS',
      };
      day += Math.max(1, stop.stayDays || 0);
      return section;
    });
  }
  if (data.itineraryDays.length > 0) {
    return data.itineraryDays.map((d) => ({ key: `day-${d.day}`, dayNumber: d.day, checkpointName: d.title || `Day ${d.day}`, defaultTransit: 'BUS' }));
  }
  return [{ key: 'trip', dayNumber: 1, checkpointName: data.trip.name, defaultTransit: 'BUS' }];
}

const emptyValues = (transit: string): SectionValues => ({
  hotelName: '',
  roomNumber: '',
  transitType: transit,
  vehicleNumber: '',
  seatNumber: '',
  assemblyTime: '',
  notes: '',
});

export default function OrganizerAllocationModal({ visible, tripId, initialJoinRequestId, onClose, onConfirmed }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState<string | null>(initialJoinRequestId ?? null);
  const [lastInitial, setLastInitial] = useState(initialJoinRequestId);
  // Re-target when opened for a different traveller.
  if (initialJoinRequestId !== lastInitial) {
    setLastInitial(initialJoinRequestId);
    setSelectedId(initialJoinRequestId ?? null);
  }

  const query = useQuery({
    queryKey: ['allocations', 'pending', tripId],
    queryFn: () => apiService.getPendingAllocations(tripId!),
    enabled: visible && !!tripId,
  });
  const data = query.data ?? null;
  const selected = data?.travellers.find((tr) => tr.joinRequestId === selectedId) ?? null;

  const close = () => {
    setSelectedId(null);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.sheet, { paddingBottom: insets.bottom }]}>
          <View style={styles.header}>
            {selected ? (
              <TouchableOpacity onPress={() => setSelectedId(null)} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t('common.back', 'Back')}>
                <ArrowLeft size={20} color={C.text} />
              </TouchableOpacity>
            ) : (
              <View style={styles.iconBtn} />
            )}
            <Text style={styles.headerTitle} numberOfLines={1}>
              {selected ? selected.name : t('allocation.title', 'Verify & Allocate')}
            </Text>
            <TouchableOpacity onPress={close} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel={t('common.close', 'Close')}>
              <X size={20} color={C.text} />
            </TouchableOpacity>
          </View>

          {query.isLoading ? (
            <View style={styles.center}>
              <ActivityIndicator color={C.accent} />
            </View>
          ) : query.isError || !data ? (
            <View style={styles.center}>
              <Text style={styles.muted}>{errorToastMessage(query.error, t('allocation.loadFailed', 'Could not load bookings awaiting allocation.'))}</Text>
              <TouchableOpacity style={styles.secondaryBtn} onPress={() => void query.refetch()} accessibilityRole="button">
                <Text style={styles.secondaryBtnText}>{t('common.retry', 'Retry')}</Text>
              </TouchableOpacity>
            </View>
          ) : selected ? (
            <AllocationForm
              key={selected.joinRequestId}
              tripId={data.trip.id}
              traveller={selected}
              sections={buildSections(data)}
              onDone={() => {
                onConfirmed(selected.joinRequestId);
                setSelectedId(null);
                void query.refetch();
              }}
            />
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              <Text style={styles.muted}>
                {t('allocation.listIntro', 'Travellers who have paid (or whose free request you approved). Verify each booking token, then assign their seat and rooms to confirm them and add them to the group chat.')}
              </Text>
              {data.travellers.length === 0 ? (
                <View style={styles.emptyBox}>
                  <CheckCircle size={28} color={C.greenText} />
                  <Text style={styles.emptyText}>{t('allocation.empty', 'Nobody is waiting for allocation.')}</Text>
                </View>
              ) : (
                data.travellers.map((tr) => (
                  <TouchableOpacity key={tr.joinRequestId} style={styles.travellerRow} onPress={() => setSelectedId(tr.joinRequestId)} accessibilityRole="button" accessibilityLabel={tr.name}>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={styles.travellerName}>{tr.name}</Text>
                      <Text style={styles.travellerMeta}>
                        {tr.partySize > 1 ? t('allocation.party', { count: tr.partySize, defaultValue: 'Party of {{count}}' }) : t('allocation.solo', '1 seat')}
                        {tr.fromCity && tr.toCity ? ` · ${tr.fromCity} ➔ ${tr.toCity}` : ''}
                        {tr.amountPaid ? ` · ${t('allocation.paid', { amount: formatINR(tr.amountPaid), defaultValue: 'Paid {{amount}}' })}` : ''}
                      </Text>
                      {tr.verificationToken ? (
                        <View style={styles.tokenChip}>
                          <KeyRound size={12} color={C.blueText} />
                          <Text style={styles.tokenChipText}>{tr.verificationToken}</Text>
                          {tr.tokenVerified ? <CheckCircle size={12} color={C.greenText} /> : null}
                        </View>
                      ) : (
                        <Text style={styles.travellerMeta}>{t('allocation.freeTrip', 'Free trip — no token')}</Text>
                      )}
                    </View>
                    <Text style={styles.allocateLink}>{t('allocation.allocate', 'Allocate ›')}</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function AllocationForm({
  tripId,
  traveller,
  sections,
  onDone,
}: {
  tripId: string;
  traveller: PendingAllocationTraveller;
  sections: Section[];
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [tokenInput, setTokenInput] = useState('');
  const [verified, setVerified] = useState(!traveller.requiresToken || traveller.tokenVerified);
  const [verifying, setVerifying] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [values, setValues] = useState<Record<string, SectionValues>>(() =>
    Object.fromEntries(sections.map((s) => [s.key, emptyValues(s.defaultTransit)])),
  );

  const missing = useMemo(
    () => sections.filter((s) => REQUIRED.some((f) => !values[s.key]?.[f].trim())).map((s) => s.key),
    [sections, values],
  );

  const setField = (key: string, field: keyof SectionValues, v: string) =>
    setValues((prev) => ({ ...prev, [key]: { ...prev[key]!, [field]: v } }));

  const copyFromPrevious = (idx: number) => {
    const prev = values[sections[idx - 1]!.key]!;
    const key = sections[idx]!.key;
    setValues((all) => ({
      ...all,
      [key]: { ...all[key]!, hotelName: prev.hotelName, roomNumber: prev.roomNumber, transitType: prev.transitType, vehicleNumber: prev.vehicleNumber, seatNumber: prev.seatNumber },
    }));
  };

  const verify = async () => {
    const token = (tokenInput || '').trim();
    if (!token) return;
    setVerifying(true);
    try {
      await apiService.verifyBookingToken(tripId, { joinRequestId: traveller.joinRequestId, verificationToken: token });
      setVerified(true);
      toast(t('allocation.tokenVerified', 'Token verified'), 'success');
    } catch (e) {
      toast(errorToastMessage(e, t('allocation.tokenMismatch', 'That token does not match this booking.')), 'error');
    } finally {
      setVerifying(false);
    }
  };

  const submit = async () => {
    if (missing.length > 0) {
      setShowErrors(true);
      toast(t('allocation.fillRequired', 'Fill in the hotel, room, vehicle and seat for every stop.'), 'error');
      return;
    }
    setSubmitting(true);
    try {
      const allocations: AllocationSubmission[] = sections.map((s) => {
        const v = values[s.key]!;
        return {
          ...(s.tripTimelineStopId ? { tripTimelineStopId: s.tripTimelineStopId } : {}),
          dayNumber: s.dayNumber,
          checkpointName: s.checkpointName,
          hotelName: v.hotelName.trim(),
          roomNumber: v.roomNumber.trim(),
          transitType: v.transitType,
          vehicleNumber: v.vehicleNumber.trim(),
          seatNumber: v.seatNumber.trim(),
          ...(v.assemblyTime.trim() ? { assemblyTime: v.assemblyTime.trim() } : {}),
          ...(v.notes.trim() ? { notes: v.notes.trim() } : {}),
        };
      });
      await apiService.approveAndAllocate(tripId, {
        joinRequestId: traveller.joinRequestId,
        ...(traveller.requiresToken ? { verificationToken: (tokenInput || traveller.verificationToken || '').trim() } : {}),
        allocations,
      });
      toast(t('allocation.confirmed', { name: traveller.name, defaultValue: '{{name}} is confirmed and has been added to the group chat.' }), 'success');
      onDone();
    } catch (e) {
      toast(errorToastMessage(e, t('allocation.confirmFailed', 'Could not confirm this booking.')), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      {traveller.requiresToken ? (
        <View style={[styles.tokenCard, verified && styles.tokenCardOk]}>
          <View style={styles.tokenHeader}>
            <KeyRound size={16} color={verified ? C.greenText : C.blueText} />
            <Text style={styles.tokenTitle}>
              {verified ? t('allocation.tokenVerifiedTitle', 'Payment token verified') : t('allocation.verifyTokenTitle', 'Step 1 · Verify payment token')}
            </Text>
          </View>
          {verified ? (
            <Text style={styles.tokenValue}>{tokenInput.trim().toUpperCase() || traveller.verificationToken}</Text>
          ) : (
            <>
              <Text style={styles.muted}>
                {t('allocation.verifyTokenHelp', 'Enter the token the traveller shows you (also in your payment notification).')}
              </Text>
              <View style={styles.tokenInputRow}>
                <TextInput
                  style={styles.tokenInput}
                  value={tokenInput}
                  onChangeText={setTokenInput}
                  placeholder="TST-XXXXXX"
                  placeholderTextColor={C.textMuted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  accessibilityLabel={t('allocation.tokenInput', 'Verification token')}
                />
                <TouchableOpacity style={[styles.verifyBtn, (!tokenInput.trim() || verifying) && styles.disabled]} onPress={() => void verify()} disabled={!tokenInput.trim() || verifying} accessibilityRole="button">
                  {verifying ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.verifyBtnText}>{t('allocation.verify', 'Verify')}</Text>}
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      ) : null}

      <Text style={[styles.stepTitle, !verified && styles.disabled]}>
        {traveller.requiresToken ? t('allocation.step2', 'Step 2 · Assign seat & rooms for each stop') : t('allocation.assign', 'Assign seat & rooms for each stop')}
      </Text>

      <View pointerEvents={verified ? 'auto' : 'none'} style={[{ gap: 12 }, !verified && styles.disabled]}>
        {sections.map((s, idx) => {
          const v = values[s.key]!;
          const err = showErrors && missing.includes(s.key);
          return (
            <View key={s.key} style={[styles.stopCard, err && styles.stopCardError]}>
              <View style={styles.stopHeader}>
                <MapPin size={14} color={C.accent} />
                <Text style={styles.stopTitle} numberOfLines={1}>
                  {t('allocation.stopTitle', { n: idx + 1, city: s.checkpointName, day: s.dayNumber, defaultValue: 'Stop {{n}}: {{city}} · Day {{day}}' })}
                </Text>
                {idx > 0 ? (
                  <TouchableOpacity onPress={() => copyFromPrevious(idx)} style={styles.copyBtn} accessibilityRole="button" accessibilityLabel={t('allocation.copyPrevious', 'Same as previous stop')}>
                    <Copy size={12} color={C.blueText} />
                    <Text style={styles.copyText}>{t('allocation.copyPreviousShort', 'Same as above')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.fieldRow}>
                <BedDouble size={14} color={C.textSecondary} />
                <Field style={{ flex: 2 }} value={v.hotelName} onChange={(x) => setField(s.key, 'hotelName', x)} placeholder={t('allocation.hotel', 'Hotel / camp name')} />
                <Field style={{ flex: 1 }} value={v.roomNumber} onChange={(x) => setField(s.key, 'roomNumber', x)} placeholder={t('allocation.room', 'Room #')} />
              </View>

              <View style={styles.transitRow}>
                {TRANSIT_TYPES.map((tt) => (
                  <TouchableOpacity
                    key={tt}
                    style={[styles.transitChip, v.transitType === tt && styles.transitChipOn]}
                    onPress={() => setField(s.key, 'transitType', tt)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: v.transitType === tt }}
                  >
                    <Text style={[styles.transitChipText, v.transitType === tt && styles.transitChipTextOn]}>{tt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.fieldRow}>
                <Bus size={14} color={C.textSecondary} />
                <Field style={{ flex: 2 }} value={v.vehicleNumber} onChange={(x) => setField(s.key, 'vehicleNumber', x)} placeholder={t('allocation.vehicle', 'Vehicle / plate / train #')} />
                <Field style={{ flex: 1 }} value={v.seatNumber} onChange={(x) => setField(s.key, 'seatNumber', x)} placeholder={t('allocation.seat', 'Seat #')} />
              </View>
              <Field value={v.assemblyTime} onChange={(x) => setField(s.key, 'assemblyTime', x)} placeholder={t('allocation.assembly', 'Assembly time & place (optional), e.g. 06:30 AM at lobby')} />
              <Field value={v.notes} onChange={(x) => setField(s.key, 'notes', x)} placeholder={t('allocation.notes', 'Notes for the traveller (optional)')} multiline />
              {err ? <Text style={styles.errText}>{t('allocation.sectionMissing', 'Hotel, room, vehicle and seat are required.')}</Text> : null}
            </View>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.submitBtn, (!verified || submitting) && styles.disabled]}
        onPress={() => void submit()}
        disabled={!verified || submitting}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator size="small" color="#FFF" />
        ) : (
          <Text style={styles.submitText}>
            {traveller.requiresToken ? t('allocation.submit', 'Confirm Token & Assign Itinerary Pass') : t('allocation.submitFree', 'Confirm & Assign Itinerary Pass')}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({
  value,
  onChange,
  placeholder,
  style,
  multiline,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  style?: object;
  multiline?: boolean;
}) {
  return (
    <TextInput
      style={[styles.input, multiline && { minHeight: 60, textAlignVertical: 'top' }, style]}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={C.textMuted}
      multiline={multiline}
      accessibilityLabel={placeholder}
    />
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { height: '92%', backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    height: 56,
    backgroundColor: C.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '800', color: C.text },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  muted: { fontSize: 12.5, color: C.textSec, lineHeight: 18 },
  list: { padding: 16, gap: 10 },
  emptyBox: { alignItems: 'center', gap: 8, paddingVertical: 32 },
  emptyText: { fontSize: 14, color: C.textSec, fontWeight: '600' },
  travellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
  },
  travellerName: { fontSize: 15, fontWeight: '800', color: C.text },
  travellerMeta: { fontSize: 12, color: C.textSec },
  tokenChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: C.blueGlow,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginTop: 2,
  },
  tokenChipText: { fontSize: 12.5, fontWeight: '800', color: C.blueText, letterSpacing: 1 },
  allocateLink: { fontSize: 13, fontWeight: '800', color: C.accent },
  form: { padding: 16, gap: 14, paddingBottom: 48 },
  tokenCard: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: '#BFDBFE', padding: 14, gap: 8 },
  tokenCardOk: { borderColor: '#A7F3D0', backgroundColor: C.greenGlow },
  tokenHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tokenTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  tokenValue: { fontSize: 22, fontWeight: '900', color: C.text, letterSpacing: 2 },
  tokenInputRow: { flexDirection: 'row', gap: 8 },
  tokenInput: {
    flex: 1,
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: C.text,
    backgroundColor: C.card,
  },
  verifyBtn: { minHeight: MIN_TOUCH_TARGET, paddingHorizontal: 18, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  verifyBtnText: { color: '#FFF', fontWeight: '800', fontSize: 14 },
  stepTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  stopCard: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 12, gap: 8 },
  stopCardError: { borderColor: C.redText },
  stopHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stopTitle: { flex: 1, fontSize: 14, fontWeight: '800', color: C.text },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 6 },
  copyText: { fontSize: 11.5, color: C.blueText, fontWeight: '700' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    minHeight: 42,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13.5,
    color: C.text,
    backgroundColor: C.cardAlt,
  },
  transitRow: { flexDirection: 'row', gap: 6 },
  transitChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, borderColor: C.border },
  transitChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  transitChipText: { fontSize: 11.5, fontWeight: '700', color: C.textSec },
  transitChipTextOn: { color: '#FFF' },
  errText: { fontSize: 12, color: C.redText, fontWeight: '600' },
  submitBtn: { minHeight: MIN_TOUCH_TARGET + 6, borderRadius: 14, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  submitText: { color: '#FFF', fontSize: 15, fontWeight: '800', textAlign: 'center' },
  secondaryBtn: { paddingHorizontal: 18, minHeight: MIN_TOUCH_TARGET, borderRadius: 12, borderWidth: 1, borderColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { color: C.accent, fontWeight: '700' },
  disabled: { opacity: 0.45 },
});
