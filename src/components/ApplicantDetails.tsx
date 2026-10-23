// The traveller details as the organizer sees them on a booking (Chats &
// Approvals → Approvals → View info): the form the traveller filled in
// before paying, one card per seat. The server only sends it once the
// booking is paid (or a free trip's request is sent).
import React from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import TravellerDetailsCard from '@/components/booking/TravellerDetailsCard';
import type { IncomingJoinRequest } from '@/types/api';
import { C } from '@/theme/tokens';

export function ApplicantDetails({ request }: { request: IncomingJoinRequest }) {
  const { t } = useTranslation();
  const list = request.travellerDetails ?? null;

  return (
    <View style={styles.wrap}>
      {list && list.length > 0 ? (
        <TravellerDetailsCard travellers={list} title={t('applicant.heading', 'Traveller details')} />
      ) : (
        <>
          <Text style={styles.heading}>{t('applicant.heading', 'Traveller details')}</Text>
          <Text style={styles.muted}>
            {request.detailsShared === false
              ? t('applicant.detailsAfterPayment', 'The traveller’s details are shared the moment they pay.')
              : t('applicant.noDetails', 'No traveller details were submitted with this booking.')}
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginTop: 6, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  heading: { fontSize: 13, fontWeight: '800', color: C.text },
  muted: { fontSize: 12, color: C.textSec, lineHeight: 17 },
});
