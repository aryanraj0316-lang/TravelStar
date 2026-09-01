// Cross-platform replacement for Alert.alert (REMEDIATION.md §0.2.6 / §9.2 /
// CONVENTIONS.md §7). Alert.alert no-ops on web, and this app ships web
// (`web.output: "static"` in app.json), so every confirmation, error, and
// prompt built on it silently vanished there.
//
// Mount <FeedbackProvider> once, at the root (src/app/_layout.tsx). Then:
//   toast('Trip created', 'success')
//   await showAlert('Permission Required', 'Enable photo access to continue.')
//   const ok = await confirm({ title: 'Leave trip?', destructive: true })
//   const room = await showPrompt({ title: 'Allocate Room', defaultValue: '402' })
//
// `toast` / `showAlert` / `showPrompt` are module-level so a plain service
// module can call them without threading a hook through every layer;
// `useConfirm` stays a hook because its call sites are all in components.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ApiError } from '@/services/api';
import { logger } from '@/lib/logger';
import { C, MIN_TOUCH_TARGET, fontSize, radii, space } from '@/theme/tokens';

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

interface AlertOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
}

interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

let pushToast: ((message: string, type: ToastType) => void) | null = null;
let pushAlert: ((options: AlertOptions) => Promise<void>) | null = null;
let pushPrompt: ((options: PromptOptions) => Promise<string | null>) | null = null;

function warnNoProvider(kind: string, detail: string): void {
  // No provider mounted yet (e.g. very early boot) — fail loudly in dev
  // instead of silently dropping the message, which is the exact failure
  // mode Alert.alert had on web.
  logger.warn(`[feedback] ${kind}() called before FeedbackProvider mounted:`, detail);
}

export function toast(message: string, type: ToastType = 'info'): void {
  if (!pushToast) return warnNoProvider('toast', message);
  pushToast(message, type);
}

/**
 * A single-button modal the user has to dismiss — the direct replacement
 * for a two-argument `Alert.alert(title, message)`. Awaitable, so a caller
 * that needs to continue only after acknowledgement can.
 */
export function showAlert(title: string, message?: string, confirmLabel?: string): Promise<void> {
  if (!pushAlert) {
    warnNoProvider('showAlert', title);
    return Promise.resolve();
  }
  return pushAlert(message !== undefined ? { title, message, ...(confirmLabel ? { confirmLabel } : {}) } : { title });
}

/**
 * A text-input modal. Replaces `Alert.prompt`, which exists **only on iOS**
 * — on Android and web it is not merely unstyled, it does not exist, so
 * every call site was a no-op for most of the user base. Resolves to the
 * entered string, or null if cancelled.
 */
export function showPrompt(options: PromptOptions): Promise<string | null> {
  if (!pushPrompt) {
    warnNoProvider('showPrompt', options.title);
    return Promise.resolve(null);
  }
  return pushPrompt(options);
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
  success: C.green,
  error: C.red,
  info: C.blueText,
};

type DialogState =
  | { kind: 'confirm'; options: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'alert'; options: AlertOptions; resolve: () => void }
  | { kind: 'prompt'; options: PromptOptions; resolve: (v: string | null) => void };

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [promptValue, setPromptValue] = useState('');
  const idRef = useRef(0);

  const addToast = useCallback((message: string, type: ToastType) => {
    const id = String(idRef.current++);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3500);
  }, []);

  const openAlert = useCallback(
    (options: AlertOptions) => new Promise<void>((resolve) => setDialog({ kind: 'alert', options, resolve })),
    []
  );

  const openPrompt = useCallback(
    (options: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setPromptValue(options.defaultValue ?? '');
        setDialog({ kind: 'prompt', options, resolve });
      }),
    []
  );

  // Registered in an effect, not during render: assigning a module-level
  // binding while rendering is a side effect, and React may render a
  // component without committing it.
  useEffect(() => {
    pushToast = addToast;
    pushAlert = openAlert;
    pushPrompt = openPrompt;
    return () => {
      pushToast = null;
      pushAlert = null;
      pushPrompt = null;
    };
  }, [addToast, openAlert, openPrompt]);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setDialog({ kind: 'confirm', options, resolve })),
    []
  );

  /** Dismissal path shared by the backdrop, the hardware back button, and
   *  the cancel button — each dialog kind resolves to its "nothing
   *  happened" value so an awaiting caller never hangs. */
  const dismiss = useCallback(() => {
    setDialog((current) => {
      if (!current) return null;
      if (current.kind === 'confirm') current.resolve(false);
      else if (current.kind === 'prompt') current.resolve(null);
      else current.resolve();
      return null;
    });
  }, []);

  const accept = useCallback(() => {
    setDialog((current) => {
      if (!current) return null;
      if (current.kind === 'confirm') current.resolve(true);
      else if (current.kind === 'prompt') current.resolve(promptValue);
      else current.resolve();
      return null;
    });
  }, [promptValue]);

  const options = dialog?.options;
  const cancelLabel =
    dialog && dialog.kind !== 'alert' ? ((dialog.options as ConfirmOptions).cancelLabel ?? 'Cancel') : null;
  const confirmLabel =
    options && 'confirmLabel' in options && options.confirmLabel
      ? options.confirmLabel
      : dialog?.kind === 'alert'
        ? 'OK'
        : dialog?.kind === 'prompt'
          ? 'Save'
          : 'Confirm';

  return (
    <FeedbackContext.Provider value={{ confirm }}>
      {children}
      <View style={styles.toastContainer} pointerEvents="box-none">
        {toasts.map((t) => (
          <View
            key={t.id}
            style={[styles.toast, { borderLeftColor: TOAST_COLORS[t.type] }]}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.toastText}>{t.message}</Text>
          </View>
        ))}
      </View>

      <Modal visible={!!dialog} transparent animationType="fade" onRequestClose={dismiss}>
        <Pressable style={styles.overlay} onPress={dismiss} accessibilityLabel="Dismiss">
          {/* Stops a tap inside the card from reaching the backdrop. */}
          <Pressable style={styles.dialog} onPress={() => {}} accessibilityViewIsModal>
            <Text style={styles.dialogTitle} accessibilityRole="header">
              {options?.title}
            </Text>
            {options?.message ? <Text style={styles.dialogMessage}>{options.message}</Text> : null}

            {dialog?.kind === 'prompt' && (
              <TextInput
                style={styles.promptInput}
                value={promptValue}
                onChangeText={setPromptValue}
                placeholder={dialog.options.placeholder ?? ''}
                placeholderTextColor={C.textMuted}
                autoFocus
                onSubmitEditing={accept}
                returnKeyType="done"
                accessibilityLabel={dialog.options.title}
              />
            )}

            <View style={styles.dialogActions}>
              {cancelLabel !== null && (
                <Pressable style={styles.dialogButton} onPress={dismiss} accessibilityRole="button">
                  <Text style={styles.dialogButtonText}>{cancelLabel}</Text>
                </Pressable>
              )}
              <Pressable style={styles.dialogButton} onPress={accept} accessibilityRole="button">
                <Text
                  style={[
                    styles.dialogButtonText,
                    styles.dialogButtonPrimary,
                    dialog?.kind === 'confirm' && dialog.options.destructive ? styles.dialogButtonDestructive : null,
                  ]}
                >
                  {confirmLabel}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </FeedbackContext.Provider>
  );
};

const styles = StyleSheet.create({
  toastContainer: {
    position: 'absolute',
    top: 56,
    left: space[4],
    right: space[4],
    zIndex: 9999,
    gap: space[2],
  },
  toast: {
    backgroundColor: C.card,
    borderLeftWidth: 4,
    borderRadius: radii.sm,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toastText: {
    color: C.white,
    fontSize: fontSize.sm,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[6],
  },
  dialog: {
    backgroundColor: C.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: C.border,
    padding: space[5],
    width: '100%',
    maxWidth: 400,
  },
  dialogTitle: {
    color: C.white,
    fontSize: fontSize.md,
    fontWeight: '700',
    marginBottom: space[2],
  },
  dialogMessage: {
    color: C.textSec,
    fontSize: fontSize.sm,
    lineHeight: 20,
    marginBottom: space[5],
  },
  promptInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: radii.sm,
    color: C.white,
    fontSize: fontSize.base,
    paddingHorizontal: space[3],
    minHeight: MIN_TOUCH_TARGET,
    marginBottom: space[5],
  },
  dialogActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: space[4],
  },
  dialogButton: {
    // §9.3: dialog actions were 8pt-tall text targets.
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    paddingHorizontal: space[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogButtonText: {
    color: C.textSec,
    fontSize: fontSize.base,
    fontWeight: '600',
  },
  dialogButtonPrimary: {
    color: C.blueText,
  },
  dialogButtonDestructive: {
    color: C.redText,
  },
});
