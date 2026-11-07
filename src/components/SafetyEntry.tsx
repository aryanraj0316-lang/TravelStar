import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/store/AppContext';
import { apiService } from '@/services/api';
import { eventBus } from '@/services/event-bus';
import { queryClient } from '@/lib/query-client';

/** A consistently reachable entry on every signed-in social screen. */
export function SafetyEntry() {
  const { isLoggedIn, profile } = useApp();
  return isLoggedIn ? <SafetyControls key={profile.id} /> : null;
}
function SafetyControls() {
  const { isLoggedIn, profile } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rules, setRules] = useState<{ version: string; rules: string; accepted: boolean } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (isLoggedIn) apiService.safety<typeof rules>('/state').then(setRules).catch(() => {});
  }, [isLoggedIn, profile.id]);
  useEffect(() => eventBus.on('safetyChanged', () => { queryClient.clear(); }), []);
  if (!isLoggedIn || /safety-center|stories|auth|onboarding|legal/.test(pathname)) return null;
  return <>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Safety: report content or block a user" onPress={() => router.push('/safety-center')} style={[styles.button, { bottom: Math.max(insets.bottom, 8) + 80 }]}><Text style={styles.text}>Safety</Text></TouchableOpacity>
    <Modal visible={!!rules && !rules.accepted && !dismissed} transparent animationType="fade" onRequestClose={() => setDismissed(true)}><View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }}><ScrollView style={{ maxHeight: '80%', backgroundColor: '#fff', borderRadius: 16 }} contentContainerStyle={{ padding: 22, gap: 16 }}>
      <Text style={{ fontWeight: '700', fontSize: 22, color: '#142641' }}>Before you share content</Text><Text>{rules?.rules}</Text>
      <TouchableOpacity accessibilityRole="link" onPress={() => { setDismissed(true); router.push('/legal/terms'); }}><Text style={{ color: '#145ac4', paddingVertical: 12 }}>Read Terms of Use</Text></TouchableOpacity>
      {!!error && <Text accessibilityRole="alert" style={{ color: '#a1192e' }}>{error}</Text>}
      <TouchableOpacity accessibilityRole="button" style={{ padding: 16, backgroundColor: '#174c96', borderRadius: 8 }} onPress={() => { if (rules) apiService.safety('/accept', 'POST', { version: rules.version, accepted: true }).then(() => setRules({ ...rules, accepted: true })).catch(() => setError('Could not save acceptance. Please retry.')); }}><Text style={styles.text}>I accept the Terms and content rules</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => setDismissed(true)}><Text style={{ color: '#145ac4', paddingVertical: 12 }}>Browse without posting</Text></TouchableOpacity>
    </ScrollView></View></Modal>
  </>;
}
const styles = StyleSheet.create({ button: { position: 'absolute', right: 12, zIndex: 1500, elevation: 12, backgroundColor: '#10233f', borderRadius: 18, minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderWidth: 1, borderColor: '#8aa9da' }, text: { color: '#fff', fontWeight: '700', fontSize: 12 } });
