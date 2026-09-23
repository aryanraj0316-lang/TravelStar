import { Redirect } from 'expo-router';

// Password reset is now a single screen (forgot-password.tsx): mobile number,
// then the 6-digit code emailed to the account, then the new password. Old
// `travelstar://reset-password?token=...` links land here and are sent there.
export default function ResetPasswordScreen() {
  return <Redirect href="/forgot-password" />;
}
