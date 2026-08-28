// Cross-platform replacement for Alert.alert (REMEDIATION.md §0.2.6 /
// CONVENTIONS.md §7). Alert.alert no-ops on web, and this app ships web, so
// every confirmation and error dialog built on it silently vanished there.
//
// Mount <FeedbackProvider> once, at the root (src/app/_layout.tsx). Then:
//   toast('Trip created', 'success')
//   const confirm = useConfirm();
//   const ok = await confirm({ title: 'Leave trip?', message: '...', destructive: true });
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ApiError } from '@/services/api';
import { C } from '@/theme/tokens';

/** Prefer the server/network's own message over a generic fallback when the
 * caught value is an ApiError — every other thrown value falls back. */
export function errorToastMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError ? err.message : fallback;
}

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

let pushToast: ((message: string, type: ToastType) => void) | null = null;

// Module-level function so any call site (including outside a component,
// e.g. a plain service module) can call `toast(...)` without threading a
// hook through every layer. Registered by the single <FeedbackProvider>
// instance the app mounts at the root.
export function toast(message: string, type: ToastType = 'info'): void {
  if (!pushToast) {
    // No provider mounted yet (e.g. very early boot) — fail loudly in dev
    // instead of silently dropping the message.
    if (__DEV__) console.warn('[feedback] toast() called before FeedbackProvider mounted:', message);
    return;
  }
  pushToast(message, type);
}

interface FeedbackContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | undefined>(undefined);

export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useConfirm must be used within a FeedbackProvider');
  return ctx.confirm;
}

const TOAST_COLORS: Record<ToastType, string> = {
  success: '#1F9D55',
  error: '#DC2626',
  info: '#2563EB',
};

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (v: boolean) => void }) | null
  >(null);
  const idRef = useRef(0);

  pushToast = useCallback((message: string, type: ToastType) => {
    const id = String(idRef.current++);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const resolveConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  return (
    <FeedbackContext.Provider value={{ confirm }}>
      {children}
      <View style={styles.toastContainer} pointerEvents="box-none">
        {toasts.map((t) => (
          <View key={t.id} style={[styles.toast, { borderLeftColor: TOAST_COLORS[t.type] }]}>
            <Text style={styles.toastText}>{t.message}</Text>
          </View>
        ))}
      </View>

      <Modal visible={!!confirmState} transparent animationType="fade" onRequestClose={() => resolveConfirm(false)}>
        <View style={styles.overlay}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>{confirmState?.title}</Text>
            {confirmState?.message ? <Text style={styles.dialogMessage}>{confirmState.message}</Text> : null}
            <View style={styles.dialogActions}>
              <Pressable style={styles.dialogButton} onPress={() => resolveConfirm(false)}>
                <Text style={styles.dialogButtonText}>{confirmState?.cancelLabel ?? 'Cancel'}</Text>
              </Pressable>
              <Pressable
                style={styles.dialogButton}
                onPress={() => resolveConfirm(true)}
              >
                <Text
                  style={[
                    styles.dialogButtonText,
                    styles.dialogButtonPrimary,
                    confirmState?.destructive ? styles.dialogButtonDestructive : null,
                  ]}
                >
                  {confirmState?.confirmLabel ?? 'Confirm'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </FeedbackContext.Provider>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 56,
    left: 16,
    right: 16,
    zIndex: 9999,
    gap: 8,
  },
  toast: {
    backgroundColor: '#12141C',
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastText: {
    color: C.white,
    fontSize: 14,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: '#12141C',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 400,
  },
  dialogTitle: {
    color: C.white,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 8,
  },
  dialogMessage: {
    color: '#B8BCC8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 20,
  },
  dialogButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  dialogButtonText: {
    color: '#9AA0AE',
    fontSize: 15,
    fontWeight: '600',
  },
  dialogButtonPrimary: {
    color: '#4F8CFF',
  },
  dialogButtonDestructive: {
    color: '#DC2626',
  },
});
