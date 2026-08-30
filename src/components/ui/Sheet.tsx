// docs/REMEDIATION.md §9.1 — the bottom-sheet shell every screen was
// hand-rolling with a bare <Modal> plus its own backdrop and panel styles.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { C, MIN_TOUCH_TARGET, fontSize, fontWeight, radii, space } from '@/theme/tokens';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Set false for a sheet whose body manages its own scrolling. */
  scrollable?: boolean;
}

export function Sheet({ visible, onClose, title, children, scrollable = true }: SheetProps) {
  const { t } = useTranslation();
  const Body = scrollable ? ScrollView : View;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          accessibilityHint={t('common.dismissesPanelHint')}
        />
        <View style={styles.panel}>
          <View style={styles.grabber} />
          {title ? (
            <View style={styles.header}>
              <Text style={styles.title} accessibilityRole="header">
                {title}
              </Text>
              <Pressable
                onPress={onClose}
                style={styles.close}
                accessibilityRole="button"
                accessibilityLabel={t('common.close')}
              >
                <X size={20} color={C.textSec} />
              </Pressable>
            </View>
          ) : null}
          <Body style={styles.body}>{children}</Body>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  backdropTouch: { flex: 1 },
  panel: {
    backgroundColor: C.card,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderWidth: 1,
    borderColor: C.border,
    paddingBottom: space[6],
    maxHeight: '88%',
  },
  grabber: {
    width: 40,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: C.border,
    alignSelf: 'center',
    marginTop: space[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[5],
    paddingVertical: space[4],
  },
  title: { color: C.white, fontSize: fontSize.md, fontWeight: fontWeight.semibold },
  close: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { paddingHorizontal: space[5] },
});
