// Keeps a bottom-sheet form (inside a Modal) usable while the keyboard is
// open. On Android a pop-up sheet is not pushed up by the keyboard, so:
//
//   useKeyboardLift()      — how far to lift the sheet (the keyboard height,
//                            minus whatever the system already shrank the
//                            window by, so it is never lifted twice).
//   useScrollToFocused(kb) — scrolls the text box being typed in into view.
//
// Used by the traveller details form and Verify & Allocate.
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, type LayoutChangeEvent, type ScrollView, type TextInput, type View } from 'react-native';

export function useKeyboardLift() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // The backdrop's height with no keyboard open (the tallest seen), and now.
  const [fullHeight, setFullHeight] = useState(0);
  const [backdropHeight, setBackdropHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const alreadyShrunk = keyboardHeight > 0 && fullHeight > 0 ? Math.max(0, fullHeight - backdropHeight) : 0;
  const lift = Math.max(0, keyboardHeight - alreadyShrunk);

  const onBackdropLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    setBackdropHeight(h);
    setFullHeight((prev) => Math.max(prev, h));
  };

  return {
    keyboardHeight,
    lift,
    /** Height left for the sheet above the keyboard (0 until measured). */
    availableHeight: backdropHeight > 0 ? backdropHeight - lift : 0,
    onBackdropLayout,
  };
}

export function useScrollToFocused(keyboardHeight: number) {
  const scrollRef = useRef<ScrollView>(null);
  /** Wrap the scroll content in a View with this ref. */
  const contentRef = useRef<View>(null);
  const inputs = useRef(new Map<string, TextInput | null>());
  const focusedKey = useRef<string | null>(null);

  const scrollToFocused = () => {
    const input = focusedKey.current ? inputs.current.get(focusedKey.current) : null;
    const content = contentRef.current;
    if (!input || !content) return;
    input.measureLayout(
      content,
      // Leave room above the box for its label.
      (_x, y) => scrollRef.current?.scrollTo({ y: Math.max(0, y - 90), animated: true }),
      () => {},
    );
  };

  // Once the keyboard is up and the sheet has moved.
  useEffect(() => {
    if (keyboardHeight <= 0) return;
    const timer = setTimeout(scrollToFocused, 120);
    return () => clearTimeout(timer);
  }, [keyboardHeight]);

  /** Spread onto a TextInput: `<TextInput {...field('hotel-1')} />`. */
  const field = (key: string) => ({
    ref: (r: TextInput | null) => {
      inputs.current.set(key, r);
    },
    onFocus: () => {
      focusedKey.current = key;
      // With the keyboard already open no new keyboard event comes.
      if (keyboardHeight > 0) setTimeout(scrollToFocused, 60);
    },
  });

  return { scrollRef, contentRef, field };
}
