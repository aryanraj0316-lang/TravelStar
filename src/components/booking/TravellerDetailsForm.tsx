// The traveller details form shown before payment: one card per seat (the
// person booking first, then everyone booked with them). What is entered
// here is what the organizer receives with the payment, in place of the
// booker's saved profile. The server checks the same rules
// (backend/src/lib/traveller-details.ts).
import X from 'lucide-react-native/icons/x';
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TravellerDetails, TravellerGender, TravellerIdType } from '@/types/api';
import { useApp } from '@/store/AppContext';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';

const GENDERS: TravellerGender[] = ['Male', 'Female', 'Other'];
const ID_TYPES: { value: TravellerIdType; label: string }[] = [
  { value: 'AADHAAR', label: 'Aadhaar' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'DRIVING_LICENCE', label: 'Driving licence' },
  { value: 'VOTER_ID', label: 'Voter ID' },
  { value: 'PAN', label: 'PAN card' },
];

type Draft = {
  fullName: string;
  age: string;
  gender: TravellerGender | null;
  phone: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  idType: TravellerIdType | null;
  idNumber: string;
};

type Errors = Partial<Record<keyof Draft, string>>;

const emptyDraft = (): Draft => ({
  fullName: '',
  age: '',
  gender: null,
  phone: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
  idType: null,
  idNumber: '',
});

const PHONE_RE = /^\+?[0-9][0-9 -]{6,18}[0-9]$/;
const ID_RE = /^[A-Za-z0-9 -]{4,30}$/;

function validate(d: Draft, isLead: boolean): Errors {
  const e: Errors = {};
  if (d.fullName.trim().length < 2) e.fullName = 'Enter the full name';
  const age = Number(d.age);
  if (!d.age.trim() || !Number.isInteger(age) || age < 0 || age > 120) e.age = 'Enter a valid age';
  if (!d.gender) e.gender = 'Choose one';
  if (!d.idType) e.idType = 'Choose an ID type';
  if (!ID_RE.test(d.idNumber.trim())) e.idNumber = 'Enter a valid ID number';
  const phone = d.phone.trim();
  if (isLead ? !PHONE_RE.test(phone) : phone && !PHONE_RE.test(phone)) e.phone = 'Enter a valid phone number';
  const ecName = d.emergencyContactName.trim();
  const ecPhone = d.emergencyContactPhone.trim();
  if (isLead ? ecName.length < 2 : ecName.length === 1) e.emergencyContactName = 'Enter the contact’s name';
  if (isLead ? !PHONE_RE.test(ecPhone) : ecPhone && !PHONE_RE.test(ecPhone)) {
    e.emergencyContactPhone = 'Enter a valid phone number';
  }
  return e;
}

function toDetails(d: Draft): TravellerDetails {
  const opt = (v: string) => (v.trim() ? v.trim() : undefined);
  return {
    fullName: d.fullName.trim(),
    age: Number(d.age),
    gender: d.gender!,
    phone: opt(d.phone),
    emergencyContactName: opt(d.emergencyContactName),
    emergencyContactPhone: opt(d.emergencyContactPhone),
    idType: d.idType!,
    idNumber: d.idNumber.trim(),
  };
}

type Props = {
  visible: boolean;
  /** One card per seat. */
  partySize: number;
  /** Shown on the submit button, e.g. "Continue to payment". */
  submitLabel: string;
  onClose: () => void;
  /** Resolves once saved; the form stays open (and editable) if it throws. */
  onSubmit: (details: TravellerDetails[]) => Promise<void>;
};

export default function TravellerDetailsForm(props: Props) {
  return (
    <Modal visible={props.visible} animationType="slide" transparent onRequestClose={props.onClose}>
      {/* Mounted only while open, so every opening starts a fresh form. */}
      {props.visible ? <FormSheet {...props} /> : null}
    </Modal>
  );
}

function FormSheet({ partySize, submitLabel, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const { profile } = useApp();
  const insets = useSafeAreaInsets();
  const count = Math.max(1, partySize);
  // The first traveller starts with the name and phone from the account,
  // which they can change.
  const [drafts, setDrafts] = useState<Draft[]>(() => {
    const list = Array.from({ length: count }, emptyDraft);
    const lead = list[0]!;
    lead.fullName = profile?.name ?? '';
    lead.phone = profile?.phoneNumber ?? '';
    lead.emergencyContactPhone = profile?.emergencyContact ?? '';
    if (profile?.gender && (GENDERS as string[]).includes(profile.gender))
      lead.gender = profile.gender as TravellerGender;
    return list;
  });
  const [errors, setErrors] = useState<Errors[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Keyboard ──────────────────────────────────────────────────────────
  // A pop-up sheet is not pushed up by the keyboard on Android, so the
  // sheet is lifted by the keyboard's height itself, and the box being
  // typed in is scrolled into view above it.
  const { height: windowHeight } = useWindowDimensions();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // The backdrop's height with no keyboard open (the tallest seen). If the system already
  // shrank the window for the keyboard, only the rest is made up here, so
  // the sheet is never lifted twice.
  const [fullHeight, setFullHeight] = useState(0);
  const [backdropHeight, setBackdropHeight] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const contentRef = useRef<View>(null);
  const inputs = useRef(new Map<string, TextInput | null>());
  const focusedKey = useRef<string | null>(null);

  const scrollToFocused = () => {
    const input = focusedKey.current ? inputs.current.get(focusedKey.current) : null;
    const content = contentRef.current;
    if (!input || !content) return;
    input.measureLayout(
      content,
      (_x, y) => {
        // Leave room above the box for its label.
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 90), animated: true });
      },
      () => {},
    );
  };

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
      // After the sheet has moved up.
      setTimeout(scrollToFocused, 120);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const alreadyShrunk = keyboardHeight > 0 && fullHeight > 0 ? Math.max(0, fullHeight - backdropHeight) : 0;
  const lift = Math.max(0, keyboardHeight - alreadyShrunk);
  const sheetMaxHeight = Math.max(240, (backdropHeight || windowHeight) - lift - insets.top - 8);

  /** Ref and focus handling for one text box. */
  const field = (key: string) => ({
    ref: (r: TextInput | null) => {
      inputs.current.set(key, r);
    },
    onFocus: () => {
      focusedKey.current = key;
      // When the keyboard is already open, the show event will not fire again.
      if (keyboardHeight > 0) setTimeout(scrollToFocused, 60);
    },
  });

  const update = (i: number, patch: Partial<Draft>) => {
    setDrafts((prev) => prev.map((d, j) => (j === i ? { ...d, ...patch } : d)));
    setErrors((prev) => {
      if (!prev[i]) return prev;
      const next = [...prev];
      const cleared = { ...next[i] };
      for (const k of Object.keys(patch) as (keyof Draft)[]) delete cleared[k];
      next[i] = cleared;
      return next;
    });
  };

  const submit = async () => {
    if (submitting) return;
    const found = drafts.map((d, i) => validate(d, i === 0));
    setErrors(found);
    if (found.some((e) => Object.keys(e).length > 0)) {
      setFormError(t('travellerForm.fixErrors', 'Please fill in the highlighted fields.'));
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit(drafts.map(toDetails));
    } catch (e) {
      setFormError(
        e instanceof Error && e.message
          ? e.message
          : t('travellerForm.saveFailed', 'Could not save the details. Please try again.'),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View
      style={styles.backdrop}
      onLayout={(ev) => {
        const h = ev.nativeEvent.layout.height;
        setBackdropHeight(h);
        setFullHeight((prev) => Math.max(prev, h));
      }}
    >
      <View style={{ maxHeight: sheetMaxHeight, marginBottom: lift }}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('travellerForm.title', 'Traveller details')}</Text>
              <Text style={styles.subtitle}>
                {count > 1
                  ? t('travellerForm.subtitleMany', {
                      count,
                      defaultValue:
                        'Fill in the details of all {{count}} travellers. They are sent to the organizer with your payment.',
                    })
                  : t('travellerForm.subtitleOne', 'These details are sent to the organizer with your payment.')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel={t('common.close', 'Close')}
            >
              <X size={20} color={C.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
          >
            <View ref={contentRef} style={{ gap: 14 }}>
              {drafts.map((d, i) => {
                const e = errors[i] ?? {};
                const isLead = i === 0;
                return (
                  <View key={i} style={styles.card}>
                    <Text style={styles.cardTitle}>
                      {isLead
                        ? t('travellerForm.lead', 'Traveller 1 (you)')
                        : t('travellerForm.companion', { n: i + 1, defaultValue: 'Traveller {{n}}' })}
                    </Text>

                    <Field label={t('travellerForm.fullName', 'Full name (as on ID)')} error={e.fullName}>
                      <TextInput
                        {...field(`${i}.fullName`)}
                        style={[styles.input, e.fullName && styles.inputError]}
                        value={d.fullName}
                        onChangeText={(v) => update(i, { fullName: v })}
                        autoCapitalize="words"
                        maxLength={100}
                        placeholder="e.g. Priya Sharma"
                        placeholderTextColor={C.textMuted}
                      />
                    </Field>

                    <Field label={t('travellerForm.age', 'Age')} error={e.age}>
                      <TextInput
                        {...field(`${i}.age`)}
                        style={[styles.input, styles.ageInput, e.age && styles.inputError]}
                        value={d.age}
                        onChangeText={(v) => update(i, { age: v.replace(/[^0-9]/g, '') })}
                        keyboardType="number-pad"
                        maxLength={3}
                        placeholder="e.g. 28"
                        placeholderTextColor={C.textMuted}
                      />
                    </Field>

                    <Field label={t('travellerForm.gender', 'Gender')} error={e.gender}>
                      <View style={styles.chips}>
                        {GENDERS.map((g) => (
                          <Chip
                            key={g}
                            label={t(`travellerForm.gender${g}`, g)}
                            selected={d.gender === g}
                            onPress={() => update(i, { gender: g })}
                          />
                        ))}
                      </View>
                    </Field>

                    <Field
                      label={
                        isLead
                          ? t('travellerForm.phone', 'Phone number')
                          : t('travellerForm.phoneOptional', 'Phone number (optional)')
                      }
                      error={e.phone}
                    >
                      <TextInput
                        {...field(`${i}.phone`)}
                        style={[styles.input, e.phone && styles.inputError]}
                        value={d.phone}
                        onChangeText={(v) => update(i, { phone: v })}
                        keyboardType="phone-pad"
                        maxLength={20}
                        placeholder="e.g. 9876543210"
                        placeholderTextColor={C.textMuted}
                      />
                    </Field>

                    <Field
                      label={
                        isLead
                          ? t('travellerForm.emergencyName', 'Emergency contact name')
                          : t('travellerForm.emergencyNameOptional', 'Emergency contact name (optional)')
                      }
                      error={e.emergencyContactName}
                    >
                      <TextInput
                        {...field(`${i}.emergencyContactName`)}
                        style={[styles.input, e.emergencyContactName && styles.inputError]}
                        value={d.emergencyContactName}
                        onChangeText={(v) => update(i, { emergencyContactName: v })}
                        autoCapitalize="words"
                        maxLength={100}
                        placeholderTextColor={C.textMuted}
                      />
                    </Field>

                    <Field
                      label={
                        isLead
                          ? t('travellerForm.emergencyPhone', 'Emergency contact number')
                          : t('travellerForm.emergencyPhoneOptional', 'Emergency contact number (optional)')
                      }
                      error={e.emergencyContactPhone}
                    >
                      <TextInput
                        {...field(`${i}.emergencyContactPhone`)}
                        style={[styles.input, e.emergencyContactPhone && styles.inputError]}
                        value={d.emergencyContactPhone}
                        onChangeText={(v) => update(i, { emergencyContactPhone: v })}
                        keyboardType="phone-pad"
                        maxLength={20}
                        placeholderTextColor={C.textMuted}
                      />
                    </Field>

                    <Field label={t('travellerForm.idType', 'ID proof')} error={e.idType}>
                      <View style={styles.chips}>
                        {ID_TYPES.map((it) => (
                          <Chip
                            key={it.value}
                            label={t(`travellerForm.id_${it.value}`, it.label)}
                            selected={d.idType === it.value}
                            onPress={() => update(i, { idType: it.value })}
                          />
                        ))}
                      </View>
                    </Field>

                    <Field label={t('travellerForm.idNumber', 'ID number')} error={e.idNumber}>
                      <TextInput
                        {...field(`${i}.idNumber`)}
                        style={[styles.input, e.idNumber && styles.inputError]}
                        value={d.idNumber}
                        onChangeText={(v) => update(i, { idNumber: v })}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={30}
                        placeholderTextColor={C.textMuted}
                      />
                    </Field>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          {formError ? (
            <Text style={styles.formError} accessibilityLiveRegion="polite">
              {formError}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.submit, submitting && { opacity: 0.6 }]}
            onPress={() => void submit()}
            disabled={submitting}
            accessibilityRole="button"
            accessibilityLabel={submitLabel}
          >
            {submitting ? <ActivityIndicator size="small" color="#FFF" /> : null}
            <Text style={styles.submitText}>{submitLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
    maxHeight: '100%',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 18, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12.5, color: C.textSec, marginTop: 3, lineHeight: 18 },
  closeBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    marginRight: -8,
  },
  card: { backgroundColor: C.cardAlt, borderRadius: 14, borderWidth: 1, borderColor: C.border, padding: 14, gap: 12 },
  cardTitle: { fontSize: 14, fontWeight: '800', color: C.text },
  label: { fontSize: 12.5, fontWeight: '700', color: C.textSec },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.borderGlow,
    backgroundColor: C.card,
    paddingHorizontal: 12,
    fontSize: 15,
    color: C.text,
  },
  ageInput: { width: 110 },
  inputError: { borderColor: C.redText },
  fieldError: { fontSize: 11.5, color: C.redText, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: MIN_TOUCH_TARGET - 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.borderGlow,
    backgroundColor: C.card,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { fontSize: 13, fontWeight: '600', color: C.text },
  chipTextOn: { color: '#FFF' },
  formError: { fontSize: 12.5, color: C.redText, fontWeight: '600', textAlign: 'center' },
  submit: {
    flexDirection: 'row',
    gap: 8,
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  submitText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
});
