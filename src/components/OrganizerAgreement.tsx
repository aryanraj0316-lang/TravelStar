// The organizer code of conduct (src/lib/organizer-terms.ts), in two sheets:
//
// - OrganizerAgreementAcceptSheet — shown before a trip is published, saved
//   as a draft, or edited. The organizer reads the terms, says whether they
//   will drive (and if so gives their licence number), and ticks acceptance.
// - OrganizerAgreementViewerSheet — what travellers see: the organizer's
//   details and the agreement they signed for this trip. Opened from the trip
//   details and from the group chat's Documents.
import { useQuery } from '@tanstack/react-query';
import CheckCircle from 'lucide-react-native/icons/circle-check-big';
import Phone from 'lucide-react-native/icons/phone';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Avatar, Input, Sheet } from '@/components/ui';
import { formatRelative } from '@/lib/datetime';
import {
  ORGANIZER_TERMS_CLAUSE_IDS,
  ORGANIZER_TERMS_VERSION,
  isValidDrivingLicence,
  isValidVehicleRegistration,
  type OrganizerAgreementInput,
} from '@/lib/organizer-terms';
import { queryKeys } from '@/lib/query-keys';
import { apiService } from '@/services/api';
import type { OrganizerAgreementView } from '@/types/api';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';

type Clause = { id: string; title: string; body: string };

/** The current terms, in the app's language. */
function useCurrentClauses(): Clause[] {
  const { t } = useTranslation();
  return ORGANIZER_TERMS_CLAUSE_IDS.map((id) => ({
    id,
    title: t(`organizerTerms.clauses.${id}.title`),
    body: t(`organizerTerms.clauses.${id}.body`),
  }));
}

function ClauseList({ clauses }: { clauses: Clause[] }) {
  return (
    <View style={styles.clauses}>
      {clauses.map((c, i) => (
        <View key={c.id} style={styles.clause}>
          <Text style={styles.clauseNum}>{i + 1}.</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.clauseTitle}>{c.title}</Text>
            <Text style={styles.clauseBody}>{c.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

// ── Accept ────────────────────────────────────────────────────────────────

export interface OrganizerAgreementAcceptSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the accepted agreement; the caller then creates/saves the trip. */
  onAccept: (agreement: OrganizerAgreementInput) => void;
  /** Disables the button while the caller's request is in flight. */
  submitting?: boolean;
  /** Editing an existing trip: prefill the driving details from its agreement. */
  tripId?: string;
}

export function OrganizerAgreementAcceptSheet({
  visible,
  onClose,
  onAccept,
  submitting = false,
  tripId,
}: OrganizerAgreementAcceptSheetProps) {
  const { t, i18n } = useTranslation();
  const clauses = useCurrentClauses();
  const [drives, setDrives] = useState(false);
  const [licence, setLicence] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  // On an edit, start from what the organizer declared last time (the
  // server returns the organizer their own numbers unmasked).
  const existing = useQuery({
    queryKey: queryKeys.organizerAgreement(tripId ?? ''),
    queryFn: () => apiService.getOrganizerAgreement(tripId as string),
    enabled: visible && !!tripId,
  });
  const prior = existing.data?.agreement;
  // Reset the form each time the sheet opens (and once the prior agreement
  // arrives) — adjusted during render rather than in an effect, the same
  // pattern the rest of the app uses for derived resets.
  const resetKey = visible ? `open:${prior ? new Date(prior.acceptedAt).getTime() : 'new'}` : 'closed';
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    if (visible) {
      setAccepted(false);
      setShowErrors(false);
      setDrives(prior?.organizerDrives ?? false);
      setLicence(prior?.drivingLicenceNumber ?? '');
      setVehicle(prior?.vehicleRegistrationNumber ?? '');
    }
  }

  const licenceError =
    drives && !isValidDrivingLicence(licence)
      ? t('organizerTerms.licenceInvalid', 'Enter a valid driving licence number, e.g. MH12 20110012345.')
      : undefined;
  const vehicleError =
    drives && vehicle.trim() && !isValidVehicleRegistration(vehicle)
      ? t('organizerTerms.vehicleInvalid', 'Enter a valid vehicle number, e.g. MH12 AB 1234.')
      : undefined;
  const canSubmit = accepted && !licenceError && !vehicleError && !submitting;

  const submit = () => {
    if (!accepted || licenceError || vehicleError) {
      setShowErrors(true);
      return;
    }
    onAccept({
      accepted: true,
      termsVersion: ORGANIZER_TERMS_VERSION,
      organizerDrives: drives,
      ...(drives ? { drivingLicenceNumber: licence.trim() } : {}),
      ...(drives && vehicle.trim() ? { vehicleRegistrationNumber: vehicle.trim() } : {}),
      language: i18n.language,
    });
  };

  return (
    <Sheet visible={visible} onClose={onClose} title={t('organizerTerms.acceptTitle', 'Organizer code of conduct')}>
      <Text style={styles.intro}>
        {t(
          'organizerTerms.acceptIntro',
          'Before this trip goes live, read and accept these terms. Every traveller on the trip can read the agreement you sign here.',
        )}
      </Text>

      <ClauseList clauses={clauses} />

      <View style={styles.driveBox}>
        <View style={styles.driveRow}>
          <Text style={styles.driveLabel}>{t('organizerTerms.drivesQuestion', 'I will drive the group between destinations')}</Text>
          <Switch
            value={drives}
            onValueChange={setDrives}
            trackColor={{ true: C.accent, false: C.border }}
            accessibilityLabel={t('organizerTerms.drivesQuestion', 'I will drive the group between destinations')}
          />
        </View>
        {drives ? (
          <View style={{ gap: 10, marginTop: 10 }}>
            <Input
              label={t('organizerTerms.licenceLabel', 'Driving licence number')}
              value={licence}
              onChangeText={setLicence}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="MH12 20110012345"
              error={showErrors ? licenceError : undefined}
            />
            <Input
              label={t('organizerTerms.vehicleLabel', 'Vehicle registration number (optional)')}
              value={vehicle}
              onChangeText={setVehicle}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="MH12 AB 1234"
              error={showErrors ? vehicleError : undefined}
            />
            <Text style={styles.muted}>
              {t(
                'organizerTerms.licencePrivacy',
                'Travellers see only a masked number (e.g. MH12 •••• 2345). No photo of your licence is stored.',
              )}
            </Text>
          </View>
        ) : null}
      </View>

      <Pressable
        style={styles.consentRow}
        onPress={() => setAccepted((v) => !v)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: accepted }}
        accessibilityLabel={t('organizerTerms.consent', 'I have read these terms and agree to follow them on this trip.')}
        hitSlop={6}
      >
        <View style={[styles.checkbox, accepted && styles.checkboxOn]}>
          {accepted ? <CheckCircle size={14} color="#FFF" /> : null}
        </View>
        <Text style={styles.consentText}>
          {t('organizerTerms.consent', 'I have read these terms and agree to follow them on this trip.')}
        </Text>
      </Pressable>
      {showErrors && !accepted ? (
        <Text style={styles.errorText}>{t('organizerTerms.mustAccept', 'Tick the box to accept the terms.')}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.primaryBtn, !canSubmit && styles.btnDisabled]}
        onPress={submit}
        disabled={submitting}
        activeOpacity={0.88}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canSubmit }}
      >
        {submitting ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.primaryBtnText}>{t('organizerTerms.acceptButton', 'Accept and continue')}</Text>
        )}
      </TouchableOpacity>
      <View style={{ height: 12 }} />
    </Sheet>
  );
}

// ── View ──────────────────────────────────────────────────────────────────

function OrganizerCard({ organizer }: { organizer: OrganizerAgreementView['organizer'] }) {
  const { t } = useTranslation();
  const place = [organizer.city, organizer.state].filter(Boolean).join(', ');
  const facts = [
    organizer.age ? t('organizerTerms.age', { count: organizer.age, defaultValue: '{{count}} yrs' }) : null,
    organizer.gender,
    place || null,
  ].filter(Boolean);

  return (
    <View style={styles.orgCard}>
      <View style={styles.orgHeader}>
        <Avatar uri={organizer.avatarUrl} name={organizer.name} size={48} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.orgName} numberOfLines={1}>
              {organizer.name}
            </Text>
            {organizer.verifiedBadge ? <ShieldCheck size={15} color={C.greenText} /> : null}
          </View>
          {facts.length > 0 ? <Text style={styles.muted}>{facts.join(' · ')}</Text> : null}
          <Text style={styles.muted}>
            {t('organizerTerms.tripsHosted', { count: organizer.tripsHosted, defaultValue: '{{count}} trips hosted' })}
          </Text>
        </View>
      </View>
      {organizer.bio ? <Text style={styles.orgBio}>{organizer.bio}</Text> : null}
      {organizer.languages.length > 0 ? (
        <Text style={styles.muted}>
          {t('organizerTerms.speaks', { languages: organizer.languages.join(', '), defaultValue: 'Speaks {{languages}}' })}
        </Text>
      ) : null}
      {organizer.phoneNumber ? (
        <TouchableOpacity
          style={styles.callRow}
          onPress={() => void Linking.openURL(`tel:${organizer.phoneNumber}`)}
          accessibilityRole="button"
          accessibilityLabel={t('organizerTerms.callOrganizer', { phone: organizer.phoneNumber, defaultValue: 'Call {{phone}}' })}
        >
          <Phone size={15} color={C.blueText} />
          <Text style={styles.callText}>{organizer.phoneNumber}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.muted}>
          {t('organizerTerms.phoneHidden', 'The organizer’s phone number is shared with confirmed travellers.')}
        </Text>
      )}
    </View>
  );
}

export function OrganizerAgreementViewerSheet({
  visible,
  onClose,
  tripId,
}: {
  visible: boolean;
  onClose: () => void;
  tripId: string | null;
}) {
  const { t } = useTranslation();
  const current = useCurrentClauses();
  const q = useQuery({
    queryKey: queryKeys.organizerAgreement(tripId ?? ''),
    queryFn: () => apiService.getOrganizerAgreement(tripId as string),
    enabled: visible && !!tripId,
  });
  const view = q.data;
  const a = view?.agreement;
  // Translated text for the current terms; the signed English snapshot for
  // an agreement accepted under an older version.
  const clauses = a ? (a.termsVersion === ORGANIZER_TERMS_VERSION ? current : a.clauses) : [];

  return (
    <Sheet visible={visible} onClose={onClose} title={t('organizerTerms.viewTitle', 'Organizer & agreement')}>
      {q.isLoading ? (
        <ActivityIndicator style={{ marginVertical: 32 }} color={C.accent} />
      ) : q.isError || !view ? (
        <View style={{ paddingVertical: 24, gap: 10, alignItems: 'center' }}>
          <Text style={styles.muted}>{t('organizerTerms.loadFailed', 'Could not load the agreement.')}</Text>
          <TouchableOpacity onPress={() => void q.refetch()} style={styles.retryBtn} accessibilityRole="button">
            <Text style={styles.callText}>{t('common.retry', 'Retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ gap: 14, paddingBottom: 16 }}>
          <OrganizerCard organizer={view.organizer} />

          {a ? (
            <>
              <View style={styles.signedBox}>
                <Text style={styles.signedTitle}>
                  {t('organizerTerms.signedOn', {
                    when: formatRelative(a.acceptedAt),
                    defaultValue: 'Accepted by the organizer {{when}}',
                  })}
                </Text>
                <Text style={styles.muted}>
                  {a.organizerDrives
                    ? t('organizerTerms.drivesYes', 'The organizer drives the group between destinations.')
                    : t('organizerTerms.drivesNo', 'The organizer does not drive the group.')}
                </Text>
                {a.organizerDrives && a.drivingLicenceNumber ? (
                  <Text style={styles.muted}>
                    {t('organizerTerms.licenceShown', { number: a.drivingLicenceNumber, defaultValue: 'Driving licence: {{number}}' })}
                  </Text>
                ) : null}
                {a.organizerDrives && a.vehicleRegistrationNumber ? (
                  <Text style={styles.muted}>
                    {t('organizerTerms.vehicleShown', { number: a.vehicleRegistrationNumber, defaultValue: 'Vehicle: {{number}}' })}
                  </Text>
                ) : null}
              </View>
              <ClauseList clauses={clauses} />
            </>
          ) : (
            <Text style={styles.muted}>
              {t(
                'organizerTerms.noAgreement',
                'No agreement on file. This trip was published before organizers were asked to accept the code of conduct.',
              )}
            </Text>
          )}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  intro: { fontSize: 13.5, color: C.textSec, lineHeight: 20, marginBottom: 12 },
  clauses: { gap: 12 },
  clause: { flexDirection: 'row', gap: 8 },
  clauseNum: { fontSize: 13.5, fontWeight: '700', color: C.textSec, width: 22 },
  clauseTitle: { fontSize: 14, fontWeight: '700', color: C.text },
  clauseBody: { fontSize: 13, color: C.textSec, lineHeight: 19, marginTop: 2 },
  driveBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.cardAlt,
  },
  driveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  driveLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: C.text },
  muted: { fontSize: 12.5, color: C.textSec, lineHeight: 18 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 16, paddingVertical: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: C.accent, borderColor: C.accent },
  consentText: { flex: 1, fontSize: 13.5, color: C.text, lineHeight: 19, fontWeight: '600' },
  errorText: { fontSize: 12.5, color: C.redText, marginTop: 4 },
  primaryBtn: {
    marginTop: 14,
    minHeight: MIN_TOUCH_TARGET + 4,
    borderRadius: 14,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  orgCard: { gap: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.card },
  orgHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orgName: { fontSize: 16, fontWeight: '700', color: C.text, flexShrink: 1 },
  orgBio: { fontSize: 13, color: C.text, lineHeight: 19 },
  callRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: MIN_TOUCH_TARGET },
  callText: { fontSize: 14, fontWeight: '600', color: C.blueText },
  signedBox: { gap: 4 },
  signedTitle: { fontSize: 13.5, fontWeight: '700', color: C.text },
  retryBtn: { minHeight: MIN_TOUCH_TARGET, justifyContent: 'center', paddingHorizontal: 16 },
});
