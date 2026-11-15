import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useApp } from '@/store/AppContext';
import { apiService } from '@/services/api';
import { eventBus } from '@/services/event-bus';
import { queryClient } from '@/lib/query-client';

/** Keep the content-rules acceptance prompt available without a screen overlay button. */
export function SafetyPolicyGate() {
  const { isLoggedIn, profile } = useApp();
  const router = useRouter();
  const [rules, setRules] = useState<{ version: string; rules: string; accepted: boolean } | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (isLoggedIn) apiService.safety<typeof rules>('/state').then(setRules).catch(() => {});
  }, [isLoggedIn, profile.id]);
  useEffect(() => eventBus.on('safetyChanged', () => { queryClient.clear(); }), []);
  if (!isLoggedIn) return null;
  return <>
    <Modal visible={!!rules && !rules.accepted && !dismissed} transparent animationType="fade" onRequestClose={() => setDismissed(true)}><View style={{ flex: 1, backgroundColor: '#0008', justifyContent: 'center', padding: 24 }}><ScrollView style={{ maxHeight: '80%', backgroundColor: '#fff', borderRadius: 16 }} contentContainerStyle={{ padding: 22, gap: 16 }}>
      <Text style={{ fontWeight: '700', fontSize: 22, color: '#142641' }}>Before you share content</Text><Text>{rules?.rules}</Text>
      <TouchableOpacity accessibilityRole="link" onPress={() => { setDismissed(true); router.push('/legal/terms'); }}><Text style={{ color: '#145ac4', paddingVertical: 12 }}>Read Terms of Use</Text></TouchableOpacity>
      {!!error && <Text accessibilityRole="alert" style={{ color: '#a1192e' }}>{error}</Text>}
      <TouchableOpacity accessibilityRole="button" style={{ padding: 16, backgroundColor: '#174c96', borderRadius: 8 }} onPress={() => { if (rules) apiService.safety('/accept', 'POST', { version: rules.version, accepted: true }).then(() => setRules({ ...rules, accepted: true })).catch(() => setError('Could not save acceptance. Please retry.')); }}><Text style={styles.text}>I accept the Terms and content rules</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" onPress={() => setDismissed(true)}><Text style={{ color: '#145ac4', paddingVertical: 12 }}>Browse without posting</Text></TouchableOpacity>
    </ScrollView></View></Modal>
  </>;
}
const styles = StyleSheet.create({ text: { color: '#fff', fontWeight: '700', fontSize: 12 } });
