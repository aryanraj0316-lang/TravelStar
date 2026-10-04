import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { Card } from '@/components/ui';


const EFFECTIVE_DATE = 'October 4, 2026';

const SECTIONS = [
  {
    title: '1. Introduction',
    body: `Yatrenzo ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your personal information when you use the Yatrenzo mobile application ("App").\n\nBy using the App, you consent to the data practices described in this policy. If you do not agree, please discontinue use of the App.`,
  },
  {
    title: '2. Information We Collect',
    body: `We collect the following categories of information:\n\nAccount Information: When you register, we collect your name, email address, and password. You may also provide an optional profile photo, bio, and travel preferences.\n\nTrip Data: Information you provide when creating or joining trips, including destinations, dates, itineraries, budget details, group members, and trip descriptions.\n\nLocation Data: With your explicit permission, we collect your device's precise location for real-time location sharing with co-travelers, nearby trip discovery, and SOS alert transmission. Location data is only collected when these features are actively enabled.\n\nPayment Information: When you make trip payments or bookings, transaction details are processed by our third-party payment providers. We store transaction records (amount, date, status) but do not store your full card details.\n\nCommunications: Chat messages sent within trip groups are stored on our servers to enable message delivery and history.\n\nDevice Information: We may collect device type, operating system, app version, and push notification tokens to deliver notifications and improve app performance.\n\nUsage Data: Anonymized analytics on feature usage, screen views, and app performance to help us improve the App.`,
  },
  {
    title: '3. How We Use Your Information',
    body: `We use your personal information to:\n\n• Create and manage your account\n• Enable trip creation, discovery, search, and booking\n• Facilitate in-app chat and group coordination\n• Process trip payments and generate receipts\n• Provide real-time location sharing with your trip group (when enabled)\n• Transmit your location during SOS alerts to your configured audience\n• Send push notifications for trip updates, booking confirmations, disaster alerts, and chat messages\n• Provide travel guides, monsoon advisories, trip safety analysis, and destination information\n• Track your travel budget and expenses\n• Respond to support requests and provide customer assistance\n• Improve, personalize, and optimize the App\n• Detect, prevent, and address fraud, abuse, and security issues\n• Comply with legal obligations`,
  },
  {
    title: '4. Location Data & Consent',
    body: `Location data is central to several Yatrenzo features. We want you to understand exactly how it is used:\n\nReal-Time Location Sharing: When you enable location sharing in your profile settings, your live location is shared with co-travelers in your active trip group. You can toggle this off at any time.\n\nNearby Trip Discovery: Your location is used to show trips near your current position. This data is processed in real time and is not stored for this purpose.\n\nSOS Alerts: When you trigger an SOS alert, your current location is transmitted to your configured audience (trip group members or nearby travelers within your set radius). This location data is retained only for the duration necessary to facilitate the emergency alert.\n\nYou can revoke location permissions at any time through your device settings or within the App's profile section. The App will continue to function with reduced functionality if location access is denied.`,
  },
  {
    title: '5. Data Sharing & Disclosure',
    body: `We do not sell your personal information. We may share your data in the following limited circumstances:\n\nWith Co-Travelers: Your profile name, photo, and location (if enabled) are visible to members of your trip group.\n\nWith Trip Organizers: When you book or join a trip, the organizer may see your name and booking details.\n\nPayment Processors: Transaction data is shared with our third-party payment providers to process payments securely.\n\nService Providers: We may share data with trusted service providers who assist us in operating the App (e.g., cloud hosting, analytics, push notification delivery). These providers are contractually bound to protect your data.\n\nLegal Requirements: We may disclose your information if required by law, court order, or government regulation, or if we believe disclosure is necessary to protect our rights, your safety, or the safety of others.\n\nSOS Alerts: During an SOS event, your name and real-time location are shared with your configured alert audience.`,
  },
  {
    title: '6. Data Security',
    body: `We implement industry-standard security measures to protect your personal information:\n\n• All data is transmitted over encrypted (HTTPS/TLS) connections\n• Authentication tokens are stored securely on your device using expo-secure-store\n• Passwords are hashed using bcrypt before storage\n• Access to production databases is restricted to authorized personnel only\n• We conduct regular security reviews of our infrastructure\n\nWhile we strive to protect your data, no method of electronic storage or transmission is 100% secure. We cannot guarantee absolute security.`,
  },
  {
    title: '7. Data Retention',
    body: `We retain your personal data for as long as your account is active or as needed to provide you with our services.\n\nAccount Data: Retained until you delete your account.\n\nTrip Data: Retained for the duration of the trip and a reasonable period afterward for reference and dispute resolution.\n\nChat Messages: Retained for the duration of your account.\n\nTransaction Records: Retained for a minimum of 5 years as required by applicable financial regulations.\n\nLocation Data: Real-time location data is not persistently stored. SOS alert location data is retained only for the duration of the alert.\n\nUpon account deletion, your personal data is permanently erased from our servers within 30 days, except where retention is required by law.`,
  },
  {
    title: '8. Your Rights',
    body: `You have the following rights regarding your personal data:\n\nAccess: You can download a copy of your personal data from the Account & Security section of your profile at any time.\n\nCorrection: You can update your profile information, including your name, email, photo, and preferences, directly within the App.\n\nDeletion: You can permanently delete your account and all associated data from the Account & Security section. This action is irreversible.\n\nWithdraw Consent: You can withdraw consent for location sharing, notifications, and other optional data processing at any time through your device settings or the App.\n\nTo exercise any of these rights or if you have questions, contact us at 1bharatgo@gmail.com.`,
  },
  {
    title: '9. Compliance with India\'s Digital Personal Data Protection Act (DPDP Act)',
    body: `Yatrenzo is committed to complying with India's Digital Personal Data Protection Act, 2023 ("DPDP Act"). In accordance with the DPDP Act:\n\n• We process personal data only for lawful purposes with your informed consent\n• We collect only the data that is necessary for the stated purposes\n• We provide you with clear notice about what data we collect and why\n• We enable you to access, correct, and delete your personal data\n• We implement reasonable security safeguards to protect your data\n• We will notify you and the Data Protection Board of India in the event of a personal data breach as required by the Act\n\nIf you are a Data Principal under the DPDP Act and wish to exercise your rights, please contact us at 1bharatgo@gmail.com.`,
  },
  {
    title: '10. Children\'s Privacy',
    body: `The App is not intended for use by individuals under the age of 18. We do not knowingly collect personal data from children.\n\nIf we become aware that we have collected personal data from a child under 18, we will take immediate steps to delete such data from our servers. If you believe a child has provided us with personal data, please contact us at 1bharatgo@gmail.com.`,
  },
  {
    title: '11. Third-Party Services',
    body: `The App may contain links to or integrate with third-party services, including payment processors, map providers, and analytics tools. These third parties have their own privacy policies, and we are not responsible for their data practices.\n\nWe encourage you to review the privacy policies of any third-party services you interact with through the App.`,
  },
  {
    title: '12. Push Notifications',
    body: `With your consent, we send push notifications for:\n\n• Trip updates and reminders\n• Booking confirmations and payment receipts\n• Disaster and safety alerts\n• Chat messages from trip group members\n• General service announcements\n\nYou can disable push notifications at any time through your device's notification settings. Disabling notifications will not affect core App functionality.`,
  },
  {
    title: '13. Changes to This Privacy Policy',
    body: `We may update this Privacy Policy from time to time to reflect changes in our practices, technology, legal requirements, or other factors.\n\nWe will notify you of material changes via in-app notification or email. The "Effective Date" at the top of this policy indicates when it was last revised.\n\nYour continued use of the App after any changes constitutes your acceptance of the updated Privacy Policy.`,
  },
  {
    title: '14. Contact Us',
    body: `If you have any questions, concerns, or complaints about this Privacy Policy or our data practices, please contact us at:\n\nEmail: 1bharatgo@gmail.com\nApp: Support section within Yatrenzo`,
  },
];

export default function PrivacyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('legal.goBack')}
        >
          <ArrowLeft size={18} color={C.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('legal.privacyTitle')}</Text>
        <View style={{ width: MIN_TOUCH_TARGET }} />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.effectiveDate}>Effective Date: {EFFECTIVE_DATE}</Text>
        {SECTIONS.map((section, index) => (
          <Card key={index} style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionBody}>{section.body}</Text>
          </Card>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: C.border,
  },
  backBtn: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    backgroundColor: C.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  scrollContent: { padding: 16 },
  effectiveDate: {
    fontSize: 12,
    color: C.textMuted,
    textAlign: 'center',
    marginBottom: 16,
  },
  sectionCard: {
    marginBottom: 12,
    borderColor: 'transparent',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
    marginBottom: 8,
  },
  sectionBody: {
    fontSize: 13,
    lineHeight: 20,
    color: C.textSec,
  },
});

