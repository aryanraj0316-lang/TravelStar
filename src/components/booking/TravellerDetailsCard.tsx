// The traveller details filled in before payment, shown the same way
// everywhere: Approvals → View info, Verify & Allocate, and the traveller's
// own Trip Pass. One block per traveller, phone numbers tappable to call.
import IdCard from 'lucide-react-native/icons/id-card';
import Phone from 'lucide-react-native/icons/phone';
import ShieldAlert from 'lucide-react-native/icons/shield-alert';
import UserRound from 'lucide-react-native/icons/user-round';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { TravellerDetails, TravellerIdType } from '@/types/api';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';

export const ID_TYPE_LABELS: Record<TravellerIdType, string> = {
  AADHAAR: 'Aadhaar',
  PASSPORT: 'Passport',
  DRIVING_LICENCE: 'Driving licence',
  VOTER_ID: 'Voter ID',
  PAN: 'PAN card',
};

type Props = {
  travellers: TravellerDetails[];
  /** Heading above the list; omit to render none. */
  title?: string;
  /** Short line under the heading. */
  subtitle?: string;
};

export default function TravellerDetailsCard({ travellers, title, subtitle }: Props) {
  const { t } = useTranslation();
  return (
    <View style={styles.wrap}>
      {title ? (
        <View style={{ gap: 2 }}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      ) : null}
      {travellers.map((tr, i) => (
        <View key={i} style={styles.card}>
          <View style={styles.nameRow}>
            <View style={styles.avatar}>
              <UserRound size={16} color={C.blueText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} selectable>
                {tr.fullName}
              </Text>
              <Text style={styles.meta}>
                {travellers.length > 1
                  ? i === 0
                    ? t('travellerCard.lead', 'Lead traveller')
                    : t('travellerCard.companion', { n: i + 1, defaultValue: 'Traveller {{n}}' })
                  : t('travellerCard.single', 'Traveller')}
                {' · '}
                {t('organizerTerms.age', { count: tr.age, defaultValue: '{{count}} yrs' })}
                {' · '}
                {tr.gender}
              </Text>
            </View>
          </View>

          <View style={styles.divider} />

          <DetailRow
            icon={<IdCard size={14} color={C.textSec} />}
            label={ID_TYPE_LABELS[tr.idType] ?? tr.idType}
            value={tr.idNumber}
          />
          {tr.phone ? (
            <DetailRow icon={<Phone size={14} color={C.textSec} />} label={t('travellerCard.phone', 'Phone')} phone={tr.phone} />
          ) : null}
          {tr.emergencyContactName || tr.emergencyContactPhone ? (
            <DetailRow
              icon={<ShieldAlert size={14} color={C.textSec} />}
              label={
                tr.emergencyContactName
                  ? t('travellerCard.emergencyNamed', {
                      name: tr.emergencyContactName,
                      defaultValue: 'Emergency · {{name}}',
                    })
                  : t('travellerCard.emergency', 'Emergency contact')
              }
              phone={tr.emergencyContactPhone}
            />
          ) : null}
        </View>
      ))}
    </View>
  );
}

function DetailRow({
  icon,
  label,
  value,
  phone,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  phone?: string;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.row}>
      <View style={styles.rowLabel}>
        {icon}
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
      {phone ? (
        <TouchableOpacity
          onPress={() => void Linking.openURL(`tel:${phone.replace(/[ -]/g, '')}`)}
          style={styles.phoneBtn}
          accessibilityRole="button"
          accessibilityLabel={t('applicant.call', { phone, defaultValue: 'Call {{phone}}' })}
        >
          <Text style={styles.phone}>{phone}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.value} selectable>
          {value ?? '—'}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  title: { fontSize: 15, fontWeight: '800', color: C.text },
  subtitle: { fontSize: 12, color: C.textSec, lineHeight: 17 },
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 12,
    gap: 8,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.blueGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { fontSize: 14.5, fontWeight: '800', color: C.text },
  meta: { fontSize: 12, color: C.textSec, marginTop: 1 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: C.border },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 28 },
  rowLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  label: { fontSize: 12.5, color: C.textSec, fontWeight: '600', flexShrink: 1 },
  value: { fontSize: 13, color: C.text, fontWeight: '700', textAlign: 'right', letterSpacing: 0.3 },
  phoneBtn: { minHeight: MIN_TOUCH_TARGET - 12, justifyContent: 'center' },
  phone: { fontSize: 13, fontWeight: '700', color: C.blueText },
});
