// The traveller details as the organizer sees them on a booking (Chats &
// Approvals → Approvals → View info): the form the traveller filled in
// before paying, one card per seat. The server only sends it once the
// booking is paid (or a free trip's request is sent).
import Phone from 'lucide-react-native/icons/phone';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { IncomingJoinRequest, TravellerIdType } from '@/types/api';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';

const ID_LABELS: Record<TravellerIdType, string> = {
  AADHAAR: 'Aadhaar',
  PASSPORT: 'Passport',
  DRIVING_LICENCE: 'Driving licence',
  VOTER_ID: 'Voter ID',
  PAN: 'PAN card',
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value} selectable>
        {value}
      </Text>
    </View>
  );
}

function CallLink({ phone, label }: { phone: string; label: string }) {
  return (
    <TouchableOpacity
      style={styles.call}
      onPress={() => void Linking.openURL(`tel:${phone.replace(/[ -]/g, '')}`)}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Phone size={14} color={C.blueText} />
      <Text style={styles.callText}>{phone}</Text>
    </TouchableOpacity>
  );
}

export function ApplicantDetails({ request }: { request: IncomingJoinRequest }) {
  const { t } = useTranslation();
  const list = request.travellerDetails ?? null;

  if (!list || list.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.heading}>{t('applicant.heading', 'Traveller details')}</Text>
        <Text style={styles.muted}>
          {request.detailsShared === false
            ? t('applicant.detailsAfterPayment', 'The traveller’s details are shared the moment they pay.')
            : t('applicant.noDetails', 'No traveller details were submitted with this booking.')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{t('applicant.heading', 'Traveller details')}</Text>
      {list.map((tr, i) => (
        <View key={i} style={styles.card}>
          <Text style={styles.cardTitle} selectable>
            {list.length > 1 ? `${i + 1}. ` : ''}
            {tr.fullName}
          </Text>
          <Row
            label={t('applicant.ageGender', 'Age / gender')}
            value={`${t('organizerTerms.age', { count: tr.age, defaultValue: '{{count}} yrs' })} · ${tr.gender}`}
          />
          <Row label={t('applicant.idProof', 'ID proof')} value={`${ID_LABELS[tr.idType] ?? tr.idType} · ${tr.idNumber}`} />
          {tr.phone ? (
            <CallLink phone={tr.phone} label={t('applicant.call', { phone: tr.phone, defaultValue: 'Call {{phone}}' })} />
          ) : null}
          {tr.emergencyContactName || tr.emergencyContactPhone ? (
            <View style={{ gap: 2 }}>
              <Text style={styles.muted}>
                {t('applicant.emergencyContactShort', {
                  name: tr.emergencyContactName ?? '',
                  defaultValue: 'Emergency contact: {{name}}',
                })}
              </Text>
              {tr.emergencyContactPhone ? (
                <CallLink
                  phone={tr.emergencyContactPhone}
                  label={t('applicant.call', { phone: tr.emergencyContactPhone, defaultValue: 'Call {{phone}}' })}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  heading: { fontSize: 12, fontWeight: '700', color: C.text },
  card: { gap: 5, padding: 10, borderRadius: 10, backgroundColor: C.cardAlt, borderWidth: 1, borderColor: C.border },
  cardTitle: { fontSize: 13, fontWeight: '800', color: C.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 12, color: C.textSec, fontWeight: '600' },
  value: { fontSize: 12, color: C.text, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  muted: { fontSize: 12, color: C.textSec, lineHeight: 17 },
  call: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: MIN_TOUCH_TARGET - 8 },
  callText: { fontSize: 13, fontWeight: '600', color: C.blueText },
});
