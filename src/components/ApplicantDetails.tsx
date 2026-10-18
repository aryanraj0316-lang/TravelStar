// The traveller's details as the organizer sees them on a join request or
// booking (Chats & Approvals → Approvals → View info). Profile details come
// with every request; phone and emergency contacts only once the traveller
// has paid or been confirmed (the server sends `contact: null` before that).
import Phone from 'lucide-react-native/icons/phone';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { IncomingJoinRequest } from '@/types/api';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

function CallLink({ phone, label }: { phone: string; label: string }) {
  return (
    <TouchableOpacity
      style={styles.call}
      onPress={() => void Linking.openURL(`tel:${phone}`)}
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
  const a = request.applicant;
  const contact = request.contact;
  if (!a) return null;

  const place = [a.city, a.state].filter(Boolean).join(', ');
  const ageGender = [
    a.age ? t('organizerTerms.age', { count: a.age, defaultValue: '{{count}} yrs' }) : null,
    a.gender,
  ]
    .filter(Boolean)
    .join(' · ');
  const since = new Date(a.memberSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{t('applicant.heading', 'About the traveller')}</Text>
      {a.verifiedBadge ? (
        <View style={styles.verified}>
          <ShieldCheck size={13} color={C.greenText} />
          <Text style={styles.verifiedText}>{t('applicant.verified', 'Verified profile')}</Text>
        </View>
      ) : null}
      {ageGender ? <Row label={t('applicant.ageGender', 'Age / gender')} value={ageGender} /> : null}
      {place ? <Row label={t('applicant.from', 'From')} value={place} /> : null}
      {a.languages.length > 0 ? <Row label={t('applicant.languages', 'Languages')} value={a.languages.join(', ')} /> : null}
      {a.travelStyle.length > 0 ? <Row label={t('applicant.travelStyle', 'Travel style')} value={a.travelStyle.join(', ')} /> : null}
      {a.interests.length > 0 ? <Row label={t('applicant.interests', 'Interests')} value={a.interests.join(', ')} /> : null}
      <Row label={t('applicant.memberSince', 'On the app since')} value={since} />
      {a.bio ? <Text style={styles.bio}>{a.bio}</Text> : null}

      <Text style={[styles.heading, { marginTop: 6 }]}>{t('applicant.contactHeading', 'Contact')}</Text>
      {contact ? (
        <>
          {contact.phoneNumber ? (
            <CallLink
              phone={contact.phoneNumber}
              label={t('applicant.call', { phone: contact.phoneNumber, defaultValue: 'Call {{phone}}' })}
            />
          ) : (
            <Text style={styles.muted}>{t('applicant.noPhone', 'No phone number on the profile.')}</Text>
          )}
          {contact.emergencyContacts.length > 0 ? (
            contact.emergencyContacts.map((ec) => (
              <View key={`${ec.name}-${ec.phoneNumber}`} style={{ gap: 2 }}>
                <Text style={styles.muted}>
                  {t('applicant.emergencyContact', {
                    name: ec.name,
                    relation: ec.relation,
                    defaultValue: 'Emergency contact: {{name}} ({{relation}})',
                  })}
                </Text>
                <CallLink
                  phone={ec.phoneNumber}
                  label={t('applicant.call', { phone: ec.phoneNumber, defaultValue: 'Call {{phone}}' })}
                />
              </View>
            ))
          ) : (
            <Text style={styles.muted}>{t('applicant.noEmergency', 'No emergency contact added.')}</Text>
          )}
        </>
      ) : (
        <Text style={styles.muted}>
          {t('applicant.contactAfterPayment', 'Phone and emergency contact are shared once the traveller pays or is confirmed.')}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  heading: { fontSize: 12, fontWeight: '700', color: C.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 12, color: C.textSec, fontWeight: '600' },
  value: { fontSize: 12, color: C.text, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  bio: { fontSize: 12.5, color: C.text, lineHeight: 18 },
  muted: { fontSize: 12, color: C.textSec, lineHeight: 17 },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedText: { fontSize: 12, color: C.greenText, fontWeight: '600' },
  call: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: MIN_TOUCH_TARGET - 8 },
  callText: { fontSize: 13, fontWeight: '600', color: C.blueText },
});
