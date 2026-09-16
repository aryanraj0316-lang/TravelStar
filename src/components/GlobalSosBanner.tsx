import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname } from 'expo-router';
import MapPin from 'lucide-react-native/icons/map-pin';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';

import { useApp } from '@/store/AppContext';

/**
 * The SOS banner, mounted once at the root so it is visible on every screen.
 *
 * It used to live inside the chat screen alone, which meant an alert was
 * invisible to anyone who happened to be on the map, their profile, or
 * anywhere else — the one situation where where-you-are must not decide
 * whether you see it.
 *
 * Tapping it opens the map focused on the alert's exact coordinates. The
 * person who raised it gets a stand-down control instead, which asks what
 * changed and broadcasts that to everyone the alert reached.
 */
export const GlobalSosBanner: React.FC = () => {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { sosAlerts, profile, resolveSOS } = useApp();

  const [resolveOpen, setResolveOpen] = useState(false);
  const [note, setNote] = useState('');
  const [resolving, setResolving] = useState(false);

  const activeAlert = useMemo(
    () => sosAlerts.find((a) => a.status === 'ACTIVE') ?? null,
    [sosAlerts],
  );

  // Deliberately only two places: the home screen and the TravelStar chat
  // tab. Everywhere else stays clear of it, including the map — which is
  // where the banner sends people, and which draws the alert itself.
  const showsBanner =
    pathname === '/' ||
    pathname === '/index' ||
    pathname === '/home' ||
    pathname === '/chat' ||
    pathname?.startsWith('/chat/');

  if (!activeAlert || !showsBanner) return null;

  const isMine = !!(
    (activeAlert.userId && profile.id && activeAlert.userId === profile.id) ||
    (!activeAlert.userId && profile.name && activeAlert.userName === profile.name)
  );

  const openExactLocation = () => {
    router.push({
      pathname: '/map',
      params: {
        // The map already flies to these and drops a labelled marker, so
        // the alert's own coordinates land the viewer on the exact spot
        // rather than somewhere in the area.
        focusLat: String(activeAlert.latitude),
        focusLng: String(activeAlert.longitude),
        focusLabel: t('sos.mapLabel', {
          name: activeAlert.userName,
          defaultValue: '🆘 {{name}} needs help here',
        }),
        alertId: activeAlert.id,
      },
    });
  };

  const submitResolve = () => {
    setResolving(true);
    resolveSOS(activeAlert.id, note.trim() || undefined);
    setResolving(false);
    setResolveOpen(false);
    setNote('');
  };

  return (
    <>
      <View style={[styles.wrap, { paddingTop: Math.max(insets.top, 12) + 4 }]} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.banner}
          activeOpacity={0.9}
          onPress={openExactLocation}
          accessibilityRole="button"
          accessibilityLabel={t('sos.bannerAccessibility', {
            name: activeAlert.userName,
            defaultValue: '{{name}} needs help. Open their exact location.',
          })}
        >
          <View style={styles.iconWrap}>
            <TriangleAlert size={19} color="#FFFFFF" strokeWidth={2.4} />
          </View>

          <View style={styles.textWrap}>
            <Text style={styles.title} numberOfLines={1}>
              {t('sos.needsHelp', { name: activeAlert.userName, defaultValue: '🆘 {{name}} needs help' })}
            </Text>
            {activeAlert.message ? (
              <Text style={styles.message} numberOfLines={2}>
                {activeAlert.message}
              </Text>
            ) : null}
            <View style={styles.tapRow}>
              <MapPin size={11} color="#FECACA" />
              <Text style={styles.tapHint}>
                {t('sos.tapForLocation', 'Tap for exact location')}
              </Text>
            </View>
          </View>

          {isMine && (
            <TouchableOpacity
              style={styles.safeBtn}
              onPress={() => setResolveOpen(true)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('sos.imSafe', "I'm safe")}
            >
              <ShieldCheck size={13} color="#065F46" strokeWidth={2.6} />
              <Text style={styles.safeBtnText}>{t('sos.imSafe', "I'm safe")}</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </View>

      {/* Stand-down, with room to say what changed. */}
      <Modal visible={resolveOpen} transparent animationType="fade" onRequestClose={() => setResolveOpen(false)}>
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setResolveOpen(false)} />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('sos.resolveTitle', 'Mark yourself safe')}</Text>
            <Text style={styles.modalSub}>
              {t(
                'sos.resolveSub',
                'Everyone who received your alert will be told it is over. Add a note if you want them to know what changed.',
              )}
            </Text>

            <TextInput
              style={styles.input}
              value={note}
              onChangeText={setNote}
              placeholder={t('sos.resolvePlaceholder', 'e.g. Found my group, all fine now')}
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={300}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setResolveOpen(false)}
                accessibilityRole="button"
              >
                <Text style={styles.cancelBtnText}>{t('common.cancel', 'Cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={submitResolve}
                disabled={resolving}
                accessibilityRole="button"
              >
                {resolving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmBtnText}>{t('sos.sendAllClear', 'Send all-clear')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10000,
    paddingHorizontal: 12,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#B91C1C',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingVertical: 11,
    paddingHorizontal: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  textWrap: { flex: 1 },
  title: { color: '#FFFFFF', fontSize: 13.5, fontWeight: '800' },
  message: { color: 'rgba(255,255,255,0.92)', fontSize: 12, marginTop: 2, lineHeight: 16 },
  tapRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  tapHint: { color: '#FECACA', fontSize: 11, fontWeight: '700' },
  safeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  safeBtnText: { color: '#065F46', fontSize: 11.5, fontWeight: '800' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    gap: 10,
  },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0F172A' },
  modalSub: { fontSize: 12.5, color: '#64748B', lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    minHeight: 76,
    textAlignVertical: 'top',
    fontSize: 13.5,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 2 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  confirmBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
  },
  confirmBtnText: { fontSize: 14, fontWeight: '800', color: '#FFFFFF' },
});
