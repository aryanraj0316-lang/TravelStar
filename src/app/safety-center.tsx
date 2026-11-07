import { eventBus } from '@/services/event-bus';
import { VideoView, useVideoPlayer } from 'expo-video';
import React, { useCallback, useEffect, useState } from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { apiService } from '@/services/api';
import { toast, useConfirm } from '@/lib/feedback';
import { useApp } from '@/store/AppContext';
import { queryClient } from '@/lib/query-client';

const kinds = ['USER', 'STORY', 'TRIP', 'GUIDE', 'REEL', 'MESSAGE', 'POST', 'COMMENT', 'REVIEW'] as const;
type Kind = typeof kinds[number];
type Target = { id: string; label: string; authorId: string | null };
type State = { version: string; rules: string; accepted: boolean; isModerator: boolean; suspended: boolean };
type Report = { id: string; kind: string; targetId?: string; reason: string; details?: string; evidence?: { text?: string; label?: string; mediaUrl?: string; mediaType?: string }; status: string; resolution?: string };
const reasons = ['HARASSMENT', 'SEXUAL_CONTENT', 'VIOLENCE', 'HATE', 'SCAM', 'PRIVACY', 'CHILD_SAFETY', 'OTHER'];
const label = (s: string) => s.toLowerCase().replace(/_/g, ' ');

function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.45 }]}><Text style={styles.buttonText}>{title}</Text></TouchableOpacity>;
}
function ReportVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri);
  return <VideoView player={player} nativeControls style={{ height: 220, width: '100%' }} />;
}

export default function SafetyCenter() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; targetId?: string }>();
  const { isLoggedIn, profile, refreshTrips } = useApp();
  const confirm = useConfirm();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<Kind>(kinds.includes(params.kind as Kind) ? params.kind as Kind : 'USER');
  const [q, setQ] = useState('');
  const [targets, setTargets] = useState<Target[]>([]);
  const [target, setTarget] = useState<Target | null>(null);
  const [reason, setReason] = useState('HARASSMENT');
  const [details, setDetails] = useState('');
  const [blocks, setBlocks] = useState<{ userId: string; name: string }[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [queue, setQueue] = useState<Report[]>([]);
  const [note, setNote] = useState('');
  const [activation, setActivation] = useState('');
  const [showActivation, setShowActivation] = useState(false);
  const [media, setMedia] = useState<Record<string, string>>({});
  const [reviewPhone, setReviewPhone] = useState('');
  const [reviewAccess, setReviewAccess] = useState<{ travellerTripId: string; organizerTripId: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const current = await apiService.safety<State>('/state');
      if (!current) throw new Error('Safety services are unavailable. Please retry.');
      setState(current);
      setReviewAccess(await apiService.safety<typeof reviewAccess>('/review-access'));
      const [blocked, mine] = await Promise.all([apiService.safety<typeof blocks>('/blocks'), apiService.safety<Report[]>('/reports/mine')]);
      setBlocks(blocked ?? []); setReports(mine ?? []);
      if (current.isModerator) setQueue(await apiService.safety<Report[]>('/admin/reports') ?? []);
      setError('');
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load safety tools.'); }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load only updates state after its remote requests resolve.
  useEffect(() => { if (isLoggedIn) void load(); }, [isLoggedIn, load]);
  useEffect(() => {
    if (isLoggedIn && params.targetId) apiService.safety<Target>(`/target?kind=${kind}&targetId=${encodeURIComponent(params.targetId)}`).then(setTarget).catch(() => setError('This content is no longer available.'));
  }, [isLoggedIn, params.targetId, kind]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Action failed. Please retry.'); } finally { setBusy(false); }
  };
  const changed = () => { eventBus.emit('safetyChanged', undefined); queryClient.clear(); refreshTrips(); };
  const block = (userId: string) => void run(async () => {
    if (!await confirm({ title: 'Block this person?', message: 'Their social content will be hidden and direct contact stopped. Existing bookings, payments and refunds remain available.', confirmLabel: 'Block', cancelLabel: 'Cancel' })) return;
    await apiService.safety('/blocks', 'POST', { userId }); changed(); toast('User blocked.', 'success');
  });

  if (!isLoggedIn) return <SafeAreaView style={styles.page}><Text style={styles.title}>Safety & reports</Text><Text>Sign in to report content or block users.</Text><Button title="Sign in" onPress={() => router.push({ pathname: '/auth', params: { mode: 'LOGIN' } })} /></SafeAreaView>;
  return <SafeAreaView style={styles.page}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Button title="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />
    <Text style={styles.title}>Safety & reports</Text>
    <Text>For immediate danger call local emergency services. For privacy requests or an appeal, contact support.</Text>
    <Button title="Contact support" onPress={() => void Linking.openURL('mailto:1bharatgo@gmail.com')} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Button title="Refresh" disabled={busy} onPress={() => void load()} />
    {state && <View style={styles.card}><Text style={styles.heading}>Content rules</Text><Text>{state.rules}</Text><Text>Rules version: {state.version}</Text>
      {state.accepted ? <Text>Accepted. You can create and share content.</Text> : <><Text>Read these rules before creating or sharing content.</Text><Button title="I accept the content rules and Terms of Use" disabled={busy} onPress={() => void run(async () => { await apiService.safety('/accept', 'POST', { version: state.version, accepted: true }); toast('Content rules accepted.', 'success'); })} /></>}
      <Button title="Read Terms of Use" onPress={() => router.push('/legal/terms')} />
      {state.suspended && <Text style={styles.error}>Your account is suspended from posting. Contact support to appeal.</Text>}
    </View>}
    {reviewAccess && <View style={styles.card}><Text style={styles.heading}>Review scenarios</Text><Text>These private scenarios are complimentary. No payment was collected. The sample guide profile is unverified and is not offered publicly as a real service.</Text>
      <Button title="Traveller booking" onPress={() => router.push({ pathname: '/trip-pass', params: { tripId: reviewAccess.travellerTripId } })} />
      <Button title="Organizer tools" onPress={() => router.push({ pathname: '/group-organizer', params: { tripId: reviewAccess.organizerTripId } })} />
      <Button title="Guide tools" onPress={() => router.push('/travel-guide')} />
      <Button title="Chats" onPress={() => router.push('/(tabs)/chat')} />
    </View>}
    <View style={styles.card}><Text style={styles.heading}>Report content or block a person</Text>
      <Text>Choose a type, search by the name, title or message text, then select the item. Private messages are limited to your chats.</Text>
      <View style={styles.row}>{kinds.map(k => <Button key={k} title={`${kind === k ? '✓ ' : ''}${label(k)}`} onPress={() => { setKind(k); setTargets([]); setTarget(null); }} />)}</View>
      <TextInput accessibilityLabel="Search content or people" placeholder="Name, title or message text" value={q} onChangeText={setQ} style={styles.input} maxLength={100} />
      <Button title="Search" disabled={busy} onPress={() => void run(async () => { const found = await apiService.safety<Target[]>(`/targets?kind=${kind}&q=${encodeURIComponent(q)}`) ?? []; setTargets(found); if (!found.length) toast('No matching content found.', 'info'); })} />
      {targets.map(item => <Button key={item.id} title={item.label || label(kind)} onPress={() => { setTarget(item); setTargets([]); }} />)}
      {target && <View><Text style={styles.heading}>Selected: {target.label}</Text><View style={styles.row}>{reasons.map(r => <Button key={r} title={`${reason === r ? '✓ ' : ''}${label(r)}`} onPress={() => setReason(r)} />)}</View>
        <TextInput accessibilityLabel="Report details" value={details} onChangeText={setDetails} placeholder="What happened? Do not include passwords or payment details." multiline maxLength={2000} style={styles.input} />
        <Button title="Submit report" disabled={busy} onPress={() => void run(async () => { await apiService.safety('/reports', 'POST', { kind, targetId: target.id, reason, details }); setDetails(''); toast('Report saved for moderator review. Check its status below.', 'success'); })} />
        {target.authorId && target.authorId !== profile.id && <Button title="Block this person" disabled={busy} onPress={() => block(target.authorId!)} />}
      </View>}
    </View>
    <View style={styles.card}><Text style={styles.heading}>Blocked accounts</Text>{!blocks.length && <Text>No blocked accounts.</Text>}{blocks.map(b => <View key={b.userId}><Text>{b.name}</Text><Button title="Unblock" disabled={busy} onPress={() => void run(async () => { await apiService.safety(`/blocks/${b.userId}`, 'DELETE'); changed(); })} /></View>)}</View>
    <View style={styles.card}><Text style={styles.heading}>Your reports</Text>{!reports.length && <Text>No reports submitted.</Text>}{reports.map(r => <Text key={r.id}>{label(r.kind)} · {label(r.reason)} · {r.status}{r.resolution ? ` — ${r.resolution}` : ''}</Text>)}</View>
    {state?.isModerator && <View style={styles.card}><Text style={styles.heading}>Moderator queue</Text><Text>Review evidence, record the decision, and act on abusive content or accounts. Financial obligations are retained.</Text>
      <Text style={styles.heading}>Prepare a reviewer account</Text><Text>Use only the separate account supplied to Google. This adds private complimentary trips, a booking and unverified guide tools. It creates no payment transaction and grants no administrator access.</Text>
      <TextInput accessibilityLabel="Reviewer account phone number" placeholder="Reviewer phone number including +91" keyboardType="phone-pad" value={reviewPhone} onChangeText={setReviewPhone} style={styles.input} />
      <Button title="Prepare complimentary review scenarios" disabled={busy || !reviewPhone} onPress={() => void run(async () => { if (!await confirm({ title: 'Prepare review account?', message: 'Confirm this is the dedicated non-admin reviewer account. Private sample records will be added.', confirmLabel: 'Prepare', cancelLabel: 'Cancel' })) return; await apiService.safety('/admin/review-access', 'POST', { phoneNumber: reviewPhone, confirmReviewAccount: true }); toast('Review scenarios ready. Ask the reviewer to open Safety → Review scenarios.', 'success'); })} />
      <TextInput accessibilityLabel="Moderation decision reason" placeholder="Decision reason (at least 5 characters)" value={note} onChangeText={setNote} style={styles.input} maxLength={1000} />
      {!queue.length && <Text>No reports.</Text>}{queue.map(r => <View key={r.id} style={styles.card}><Text style={styles.heading}>{r.kind} · {r.reason} · {r.status}</Text><Text>{r.evidence?.label}</Text><Text>{r.evidence?.text}</Text><Text>Reporter details: {r.details || 'None'}</Text>
        {r.evidence?.mediaUrl && <Button title="View reported media" onPress={() => void run(async () => { const result = await apiService.safety<{ uri: string | null }>(`/admin/reports/${r.id}/media`); if (result?.uri) setMedia(m => ({ ...m, [r.id]: result.uri! })); else toast('Media is no longer available.', 'info'); })} />}
        {media[r.id] && (r.evidence?.mediaType === 'VIDEO' ? <ReportVideo uri={media[r.id]} /> : <Image source={{ uri: media[r.id] }} style={{ height: 220, width: '100%' }} resizeMode="contain" />)}
        <View style={styles.row}>{['DISMISS', 'HIDE', 'SUSPEND', 'RESTORE'].map(action => <Button key={action} title={label(action)} disabled={busy || note.trim().length < 5} onPress={() => void run(async () => { if (!await confirm({ title: `${label(action)}?`, message: 'This decision is recorded in the moderation audit trail.', confirmLabel: 'Confirm', cancelLabel: 'Cancel' })) return; await apiService.safety(`/admin/reports/${r.id}`, 'POST', { action, note }); changed(); })} />)}</View>
      </View>)}
    </View>}
    {!state?.isModerator && <><Button title="Moderator activation" onPress={() => setShowActivation(v => !v)} />{showActivation && <View style={styles.card}><Text>Operators only. Use the one-time code supplied by the app owner. Do not activate the Google reviewer account.</Text><TextInput accessibilityLabel="Moderator activation code" secureTextEntry value={activation} onChangeText={setActivation} autoCapitalize="none" style={styles.input} /><Button title="Activate moderator access" disabled={busy || !activation} onPress={() => void run(async () => { await apiService.safety('/activate', 'POST', { code: activation.trim() }); setActivation(''); })} /></View>}</>}
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: '#f4f7fc', paddingHorizontal: 16 }, content: { paddingVertical: 12, paddingBottom: 45, gap: 12, width: '100%', maxWidth: 850, alignSelf: 'center' }, title: { fontSize: 26, fontWeight: '700', color: '#142641' }, heading: { fontSize: 18, fontWeight: '700', color: '#142641', marginBottom: 8 }, card: { backgroundColor: '#fff', padding: 16, borderRadius: 14, gap: 10, borderWidth: 1, borderColor: '#d4dfef' }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, input: { borderWidth: 1, borderColor: '#96a6be', backgroundColor: '#fff', padding: 12, minHeight: 48, borderRadius: 8, color: '#142641' }, button: { backgroundColor: '#174c96', paddingHorizontal: 14, paddingVertical: 12, minHeight: 44, borderRadius: 9, alignItems: 'center' }, buttonText: { color: '#fff', fontWeight: '600' }, error: { color: '#a1192e', paddingVertical: 8 } });
