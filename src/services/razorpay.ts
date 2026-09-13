import { Platform } from 'react-native';

export interface RazorpayCheckoutOptions {
  description: string;
  image?: string;
  currency: string;
  key: string;
  amount: string | number; // in paise
  name: string;
  order_id: string;
  prefill?: {
    email?: string;
    contact?: string;
    name?: string;
  };
  theme?: {
    color?: string;
  };
}

export interface RazorpaySuccessData {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

/**
 * Platform-specific Razorpay checkout wrapper.
 * On Web: dynamically loads checkout.js and triggers Razorpay modal.
 * On Native (EAS / Dev Build): calls native react-native-razorpay module.
 * On Expo Go: cleanly catches missing native module and throws EXPO_GO_UNSUPPORTED.
 */
export async function openRazorpayCheckout(options: RazorpayCheckoutOptions): Promise<RazorpaySuccessData> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const openModal = () => {
        try {
          const rzp = new (window as any).Razorpay({
            ...options,
            handler: (response: RazorpaySuccessData) => {
              resolve(response);
            },
            modal: {
              ondismiss: () => {
                reject(new Error('PAYMENT_CANCELLED'));
              },
            },
          });
          rzp.open();
        } catch (err) {
          reject(err);
        }
      };

      if (typeof window !== 'undefined') {
        if (!(window as any).Razorpay) {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.async = true;
          script.onload = () => openModal();
          script.onerror = () => reject(new Error('Failed to load Razorpay Web SDK'));
          document.body.appendChild(script);
        } else {
          openModal();
        }
      } else {
        reject(new Error('WINDOW_UNDEFINED'));
      }
    });
  }

  // Native
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RazorpayCheckout = require('react-native-razorpay').default || require('react-native-razorpay');
    if (!RazorpayCheckout || typeof RazorpayCheckout.open !== 'function') {
      throw new Error('EXPO_GO_UNSUPPORTED');
    }
    const data = await RazorpayCheckout.open(options);
    return data;
  } catch (error: any) {
    if (
      error?.message?.includes('Native module cannot be null') ||
      error?.message?.includes('EXPO_GO_UNSUPPORTED') ||
      error?.message?.includes('null is not an object') ||
      error?.message?.includes('RazorpayCheckout')
    ) {
      throw new Error('EXPO_GO_UNSUPPORTED');
    }
    throw error;
  }
}
