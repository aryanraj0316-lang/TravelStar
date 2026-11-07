import React from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import { C, MIN_TOUCH_TARGET } from '@/theme/tokens';
import { Card } from '@/components/ui';


const EFFECTIVE_DATE = 'November 7, 2026';

const SECTIONS = [
  {
    title: '1. Acceptance of Terms',
    body: `By downloading, installing, or using the Yatrenzo mobile application ("App"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you must not access or use the App.\n\nYatrenzo reserves the right to update these Terms at any time. We will notify you of material changes via in-app notification or email. Continued use of the App after such changes constitutes your acceptance of the revised Terms.`,
  },
  {
    title: '2. Eligibility',
    body: `You must be at least 18 years of age to create an account and use the App. By registering, you represent and warrant that you meet this age requirement and that all information you provide is accurate, current, and complete.\n\nIf you are using the App on behalf of a travel group or organization, you represent that you have authority to bind that entity to these Terms.`,
  },
  {
    title: '3. Account Registration & Security',
    body: `To access core features — including trip creation, bookings, chat, and budget tracking — you must create an account using a valid mobile number, email address and app password.\n\nYou are solely responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. You agree to notify us immediately at 1bharatgo@gmail.com if you suspect any unauthorized access.\n\nYatrenzo stores authentication tokens securely on your device using expo-secure-store and transmits credentials only over encrypted (HTTPS) connections.`,
  },
  {
    title: '4. Trip Creation & Discovery',
    body: `Yatrenzo allows users to create trips, search for trips posted by others, discover nearby trips, and browse budget-friendly travel options. All trip listings are user-generated content.\n\nYatrenzo does not independently verify the accuracy, safety, or legality of any trip listing. You acknowledge that participation in any trip is at your own risk and discretion.\n\nWe reserve the right to remove or restrict trip listings that violate these Terms, contain misleading information, or are reported by other users.`,
  },
  {
    title: '5. Payments & Bookings',
    body: `Certain features of the App involve financial transactions, including trip payments, booking confirmations, and budget tracking.\n\nAll payments are processed through secure third-party payment processors. Yatrenzo does not store your full credit/debit card information on its servers.\n\nThe applicable price and cancellation/refund information is shown in the booking flow. Refunds follow the policy and payment status recorded for the booking. Do not pay for a review sample or a booking whose checkout is unavailable. Contact support about payment, refund or service disputes.\n\nReceipts for completed transactions are available in the App under your profile.`,
  },
  {
    title: '6. Location Services & Sharing',
    body: `Yatrenzo offers optional location-based features, including:\n\n• Optional real-time location sharing on maps, which may be visible to other signed-in users outside your trip group\n• Nearby trip discovery based on your current position\n• Location transmission during SOS alerts\n\nLocation data is collected only when you explicitly enable these features and grant the App permission to access your device's location services. You may disable location sharing at any time from your profile settings.\n\nLocation data shared during SOS alerts is transmitted to your configured audience (trip group or nearby travelers within your set radius) and is not stored beyond the duration necessary to facilitate the alert.`,
  },
  {
    title: '7. SOS & Emergency Features',
    body: `The App provides an SOS alert feature and a direct dial option for India's national emergency number (112). These features are provided as a convenience and safety aid.\n\nYatrenzo is not an emergency services provider. We do not guarantee the availability, timeliness, or effectiveness of SOS alerts. In an emergency, always contact local emergency services directly.\n\nSOS alerts are broadcast to your selected audience (trip group members or nearby users) and include your real-time location if location permissions are enabled. You are responsible for configuring your SOS reach preferences appropriately.`,
  },
  {
    title: '8. User-Generated Content',
    body: `The App allows you to post content including trip descriptions, stories, photos, chat messages, reviews, and profile information ("User Content").\n\nYou retain ownership of your User Content. By posting it on Yatrenzo, you grant us a non-exclusive, worldwide, royalty-free license to display, distribute, and use your User Content within the App for the purpose of operating and improving the service.\n\nYou must not post nudity, sexual exploitation, child sexual abuse material, graphic violence, threats, harassment, hate speech, scams, illegal content, or another person's private information. Accept the content rules before posting. Use Safety & reports to report users or content, block or unblock a person, and check report status. We review reports and may hide content or suspend accounts. Blocking does not cancel existing bookings or refund obligations. Contact 1bharatgo@gmail.com to appeal a moderation decision. Yatrenzo reserves the right to remove any User Content that violates these Terms without prior notice.`,
  },
  {
    title: '9. Chat & Communications',
    body: `Yatrenzo provides in-app messaging for trip coordination and group communication. Chat messages are transmitted through our servers and stored to enable message delivery and history.\n\nYou agree to use the chat feature responsibly and not to send spam, phishing messages, or content that violates these Terms. Yatrenzo may moderate or restrict chat access for users who abuse the messaging system.`,
  },
  {
    title: '10. Travel Guides & Advisory Content',
    body: `The App provides travel guides, monsoon advisories, trip safety analysis, and destination details as informational content. This content is provided for general guidance only.\n\nYatrenzo does not guarantee the accuracy, completeness, or timeliness of advisory content. Travel conditions can change rapidly. You are solely responsible for verifying current conditions, travel advisories, and safety information from official government and local sources before traveling.`,
  },
  {
    title: '11. Notifications & Alerts',
    body: `Yatrenzo sends push notifications for trip updates, booking confirmations, disaster alerts, chat messages, and other service-related communications.\n\nBy enabling notifications, you consent to receiving these communications. You may manage notification preferences through your device's settings at any time.`,
  },
  {
    title: '12. Account Data & Deletion',
    body: "You can edit supported profile fields and manage device permissions and in-app settings. Profile > Account & Security includes Download my data and Delete my account. The current export covers core profile, trip, messaging and safety records, but does not include every data category; email support for additional access requests.\n\nTo request deletion without using the app, email 1bharatgo@gmail.com with the subject Yatrenzo account deletion request. Include only your registered email address or mobile number so support can identify the account. We may need to verify ownership. Do not send passwords, OTPs, full bank/card details or copies of identity documents. This address also accepts requests to delete specific data without deleting the entire account.\n\nThe in-app deletion flow asks for your password, attempts to close bookings and refunds, revokes sessions and removes the account and associated active database records. This includes account-owned stories, story interactions, private chat attachments and identifiable system-generated booking/enquiry snapshots linked to your account. An organizer with a trip under way or unresolved refunds may need support assistance before deletion completes.\n\nUploaded public-media files are placed in a durable cleanup queue that retries removal. The in-app success message confirms account/database deletion and that file cleanup was queued; it does not confirm immediate erasure from every storage cache or backup. Contact support about historical uploads that cannot be reliably attributed to an account, recipient copies or specific retained information.\n\nSome records may need to be retained for a specific legal obligation or unresolved dispute; support will explain any applicable exception when handling your request. Payment providers, recipient copies and provider backups may require separate handling. Uninstalling the app does not delete your account.",
  },
  {
    title: '13. Prohibited Activities',
    body: `You agree not to:\n\n• Use the App for any unlawful purpose or to promote illegal activities\n• Impersonate any person or entity\n• Attempt to gain unauthorized access to other users' accounts or our systems\n• Interfere with or disrupt the App's infrastructure\n• Use automated scripts, bots, or scrapers to access the App\n• Post false, misleading, or deceptive trip listings\n• Harass, threaten, or abuse other users through any App feature`,
  },
  {
    title: '14. Intellectual Property',
    body: `The Yatrenzo name, logo, design, and all original content, features, and functionality of the App are owned by Yatrenzo and are protected by applicable intellectual property laws.\n\nYou may not copy, modify, distribute, sell, or lease any part of the App or its content without our prior written consent.`,
  },
  {
    title: '15. Limitation of Liability',
    body: `To the maximum extent permitted by law, Yatrenzo and its affiliates, officers, employees, and agents shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from:\n\n• Your use of or inability to use the App\n• Any trip, booking, or transaction facilitated through the App\n• Unauthorized access to your data or account\n• Any third-party conduct on the App\n\nYatrenzo's total liability for any claim arising from these Terms shall not exceed the amount you paid to Yatrenzo, if any, in the twelve months preceding the claim.`,
  },
  {
    title: '16. Disclaimer of Warranties',
    body: `The App is provided on an "AS IS" and "AS AVAILABLE" basis without warranties of any kind, whether express or implied. Yatrenzo does not warrant that the App will be uninterrupted, error-free, or free of harmful components.\n\nYatrenzo is a technology platform and is not a travel agency, tour operator, or transportation provider. We do not assume responsibility for the quality, safety, or legality of trips listed by users.`,
  },
  {
    title: '17. Governing Law & Dispute Resolution',
    body: `These Terms shall be governed by and construed in accordance with the laws of India. Any disputes arising from these Terms or your use of the App shall be subject to the exclusive jurisdiction of the courts in New Delhi, India.\n\nBefore initiating any formal legal proceedings, you agree to attempt to resolve disputes informally by contacting us at 1bharatgo@gmail.com.`,
  },
  {
    title: '18. Contact Us',
    body: `If you have any questions about these Terms of Service, please contact us at:\n\nEmail: 1bharatgo@gmail.com\nApp: Support section within Yatrenzo`,
  },
];

export default function TermsScreen() {
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
        <Text style={styles.headerTitle}>{t('legal.termsTitle')}</Text>
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
