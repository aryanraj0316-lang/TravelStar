import { Platform } from 'react-native';
import { logger } from '@/lib/logger';

/**
 * Copies text to the device clipboard. Returns whether it actually worked,
 * so the caller only says "Copied" when it did.
 *
 * Uses React Native's built-in Clipboard (deprecated in core but still
 * shipped, with its native module, in RN 0.86) rather than expo-clipboard:
 * a new native module can't reach installed builds over an OTA update.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (Platform.OS === 'web') {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      return false;
    }
    // Synchronous require so a build without the module falls through to
    // the catch instead of crashing at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Clipboard = require('react-native').Clipboard as { setString?: (s: string) => void } | undefined;
    if (Clipboard && typeof Clipboard.setString === 'function') {
      Clipboard.setString(text);
      return true;
    }
    return false;
  } catch (e) {
    logger.warn('[Clipboard] Copy failed:', e);
    return false;
  }
}
