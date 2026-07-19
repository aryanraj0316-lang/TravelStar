import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  TouchableOpacity,
  TextInput,
  useColorScheme,
  Alert,
  Text,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Plus,
  Compass,
  MapPin,
  Calendar,
  IndianRupee,
  Users,
  Eye,
  Check,
} from 'lucide-react-native';
import { useApp } from '@/store/AppContext';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import GlassCard from '@/components/ui/GlassCard';
import { Spacing } from '@/constants/theme';
import { useRouter } from 'expo-router';

export default function CreateTripScreen() {
  const isDark = useColorScheme() === 'dark';
  const router = useRouter();
  const { addTrip } = useApp();

  const [tripName, setTripName] = useState('');
  const [citiesInput, setCitiesInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [budget, setBudget] = useState('');
  const [totalSeats, setTotalSeats] = useState('');
  const [meetingPoint, setMeetingPoint] = useState('');
  const [guideIncluded, setGuideIncluded] = useState(false);
  const [foodIncluded, setFoodIncluded] = useState(false);
  const [privacy, setPrivacy] = useState<'PUBLIC' | 'PRIVATE' | 'INVITE_ONLY'>('PUBLIC');

  const handleCreate = () => {
    if (!tripName || !citiesInput || !startDate || !budget || !totalSeats) {
      Alert.alert('Missing Fields', 'Please fill in all required fields.');
      return;
    }

    const cities = citiesInput.split(',').map((c) => c.trim()).filter((c) => c !== '');
    if (cities.length < 2) {
      Alert.alert('Route Error', 'Please enter at least 2 cities (comma separated).');
      return;
    }

    const newTrip = {
      id: `trip-${Date.now()}`,
      name: tripName,
      creator: 'Aarav Sharma (Organizer)',
      cities,
      startDate,
      endDate: endDate || startDate,
      budget: parseFloat(budget),
      availableSeats: parseInt(totalSeats),
      totalSeats: parseInt(totalSeats),
      meetingPoint,
      guideIncluded,
      foodIncluded,
      privacy,
      membersCount: 1,
    };

    addTrip(newTrip);
    Alert.alert('Success', 'Your trip route has been published!', [
      {
        text: 'OK',
        onPress: () => {
          // Clear inputs
          setTripName('');
          setCitiesInput('');
          setStartDate('');
          setEndDate('');
          setBudget('');
          setTotalSeats('');
          setMeetingPoint('');
          // Redirect
          router.replace('/');
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={[styles.safeArea, { backgroundColor: isDark ? '#121214' : '#FAFAFC' }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        
        <View style={styles.header}>
          <ThemedText type="subtitle" style={{ fontWeight: '700' }}>Create New Trip Route</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Set up details for your upcoming group tour.
          </ThemedText>
        </View>

        {/* Create Form */}
        <GlassCard style={styles.formCard}>
          
          {/* Trip Name */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Trip Name *</Text>
            <TextInput
              placeholder="e.g. Rajasthan Royal Explorer"
              placeholderTextColor="#888"
              style={[styles.input, { color: isDark ? '#FFF' : '#000' }]}
              value={tripName}
              onChangeText={setTripName}
            />
          </View>

          {/* Route path (comma-separated cities) */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Route Sequence (Cities, comma separated) *</Text>
            <TextInput
              placeholder="e.g. Delhi, Jaipur, Jodhpur, Udaipur"
              placeholderTextColor="#888"
              style={[styles.input, { color: isDark ? '#FFF' : '#000' }]}
              value={citiesInput}
              onChangeText={setCitiesInput}
            />
            <ThemedText style={styles.inputHelper} themeColor="textSecondary">
              Order matters! Users can midway join these segments.
            </ThemedText>
          </View>

          {/* Date Picker Mocks */}
          <View style={styles.rowGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Start Date *</Text>
              <TextInput
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#888"
                style={[styles.input, { color: isDark ? '#FFF' : '#000' }]}
                value={startDate}
                onChangeText={setStartDate}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.label}>End Date</Text>
              <TextInput
                placeholder="YYYY-MM-DD"
                placeholderTextColor="#888"
                style={[styles.input, { color: isDark ? '#FFF' : '#000' }]}
                value={endDate}
                onChangeText={setEndDate}
              />
            </View>
          </View>

          {/* Budget & Seats */}
          <View style={styles.rowGrid}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Budget (₹) *</Text>
              <TextInput
                placeholder="e.g. 12000"
                placeholderTextColor="#888"
                keyboardType="numeric"
                style={[styles.input, { color: isDark ? '#FFF' : '#000' }]}
                value={budget}
                onChangeText={setBudget}
              />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.label}>Total Slots *</Text>
              <TextInput
                placeholder="e.g. 10"
                placeholderTextColor="#888"
                keyboardType="numeric"
                style={[styles.input, { color: isDark ? '#FFF' : '#000' }]}
                value={totalSeats}
                onChangeText={setTotalSeats}
              />
            </View>
          </View>

          {/* Meeting Point */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Meeting Point</Text>
            <TextInput
              placeholder="e.g. Terminal 3 Airport Exit gate"
              placeholderTextColor="#888"
              style={[styles.input, { color: isDark ? '#FFF' : '#000' }]}
              value={meetingPoint}
              onChangeText={setMeetingPoint}
            />
          </View>

          {/* Inclusions */}
          <View style={styles.switchContainer}>
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => setGuideIncluded(!guideIncluded)}
            >
              <View style={[styles.checkbox, guideIncluded && styles.checkboxActive]}>
                {guideIncluded && <Check size={12} color="#FFF" />}
              </View>
              <ThemedText style={{ marginLeft: 8 }} type="smallBold">Verified Guide Included</ThemedText>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.toggleRow, { marginTop: Spacing.two }]}
              onPress={() => setFoodIncluded(!foodIncluded)}
            >
              <View style={[styles.checkbox, foodIncluded && styles.checkboxActive]}>
                {foodIncluded && <Check size={12} color="#FFF" />}
              </View>
              <ThemedText style={{ marginLeft: 8 }} type="smallBold">Meals/Food Included</ThemedText>
            </TouchableOpacity>
          </View>

          {/* Privacy Selectors */}
          <View style={styles.privacySection}>
            <Text style={styles.label}>Privacy Settings</Text>
            <View style={styles.privacyGrid}>
              {(['PUBLIC', 'PRIVATE', 'INVITE_ONLY'] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    styles.privacyTab,
                    privacy === p && styles.privacyTabActive,
                    privacy !== p && { backgroundColor: isDark ? '#2D2E35' : '#F0F0F3' },
                  ]}
                  onPress={() => setPrivacy(p)}
                >
                  <Text style={[styles.privacyTabText, privacy === p && styles.privacyTabTextActive]}>
                    {p.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Submit */}
          <TouchableOpacity style={styles.submitBtn} onPress={handleCreate}>
            <Plus size={18} color="#FFF" style={{ marginRight: 6 }} />
            <Text style={styles.submitBtnText}>Publish Trip Route</Text>
          </TouchableOpacity>

        </GlassCard>
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: 110,
  },
  header: {
    marginBottom: Spacing.four,
  },
  formCard: {
    padding: Spacing.four,
  },
  inputGroup: {
    marginBottom: Spacing.three,
  },
  label: {
    fontSize: 10,
    color: '#888',
    fontWeight: 'bold',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    paddingHorizontal: Spacing.three,
    fontSize: 13,
  },
  inputHelper: {
    fontSize: 9,
    marginTop: 4,
  },
  rowGrid: {
    flexDirection: 'row',
    marginBottom: Spacing.three,
  },
  switchContainer: {
    paddingVertical: Spacing.two,
    borderTopWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.08)',
    marginBottom: Spacing.four,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#0066FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#0066FF',
  },
  privacySection: {
    marginBottom: Spacing.four,
  },
  privacyGrid: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: 4,
  },
  privacyTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  privacyTabActive: {
    backgroundColor: '#0066FF',
  },
  privacyTabText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#888',
  },
  privacyTabTextActive: {
    color: '#FFF',
  },
  submitBtn: {
    backgroundColor: '#0066FF',
    height: 48,
    borderRadius: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.two,
    shadowColor: '#0066FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  submitBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
