import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList, ScrollView, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Compass, Receipt, Smartphone, ShieldCheck, Building2, Bell, MapPin, HeartCrack, CheckCircle2,
} from 'lucide-react-native';
import {
  AuthLogo, PrimaryButton, OutlineButton, BackButton, IconBadge, Popup, ErrorBanner, COLORS, authText,
} from '../../components/auth/auth-ui';
import * as Location from 'expo-location';
import { CONSENTS } from '../../components/auth/legal';
import AuthAPI from '../../services/authApi';
import ProfileAPI from '../../services/profileApi';
import Session from '../../services/session';

// Three intro slides (AI wording removed per US-3.0 notes).
const INTRO_SLIDES = [
  {
    key: 'care',
    kicker: 'Guiding you to the',
    title: 'Right Care',
    subtitle: 'Get the care you deserve through a streamlined medical platform built around your needs.',
    icon: Compass,
  },
  {
    key: 'billing',
    kicker: 'No More',
    title: 'Billing Shocks',
    subtitle: 'Get real-time cost estimates with insurance deductions before you proceed.',
    icon: Receipt,
  },
  {
    key: 'connected',
    kicker: 'Connected Healthcare',
    title: 'Right at Your Hands',
    subtitle: 'Compare accredited facilities, book appointments, and coordinate your care in one place.',
    icon: Smartphone,
  },
];

export function OnboardingPage({ onComplete }) {
  const { width } = useWindowDimensions();
  const listRef = useRef(null);
  const [slideIndex, setSlideIndex] = useState(0);
  // Stages: 'carousel' -> 'welcome' -> 'insurance' -> 'sharing' -> 'location' -> 'notifications' -> 'done'
  const [stage, setStage] = useState('carousel');
  const [consents, setConsents] = useState({
    insurance_consent: false,
    data_sharing_consent: false,
    location_allowed: false,
    notifications_allowed: false,
  });
  const [declinedStage, setDeclinedStage] = useState(null);
  const [showLocationPopup, setShowLocationPopup] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const goToSlide = index => {
    setSlideIndex(index);
    listRef.current?.scrollToIndex({ index, animated: true });
  };

  const finishOnboarding = async nextConsents => {
    setSaving(true);
    setError('');
    try {
      await ProfileAPI.setPermissions({
        insuranceConsent: !!nextConsents.insurance_consent,
        dataSharingConsent: !!nextConsents.data_sharing_consent,
        locationAllowed: !!nextConsents.location_allowed,
        notificationsAllowed: !!nextConsents.notifications_allowed,
      });
      const token = await Session.getAccessToken();
      const res = await AuthAPI.completeOnboarding(token, {
        insurance_consent: nextConsents.insurance_consent,
        data_sharing_consent: nextConsents.data_sharing_consent,
      });
      if (res?.profile) Session.setProfile(res.profile);
      setStage('done');
    } catch (err) {
      setError(err.message || 'Could not save your preferences. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Declined consent screen ("This feature requires your consent.")
  if (declinedStage) {
    return (
      <View style={styles.screen}>
        <BackButton onPress={() => setDeclinedStage(null)} />
        <View style={styles.centerContent}>
          <IconBadge icon={HeartCrack} size={76} colors={['#67C6FA', '#3BA5EC']} />
          <Text style={[authText.title, { marginTop: 24, fontSize: 22 }]}>
            This feature requires{'\n'}your consent.
          </Text>
          <Text style={[authText.subtitle, { marginTop: 12, paddingHorizontal: 16 }]}>
            To fully access all of <Text style={{ color: COLORS.accent, fontWeight: '600' }}>GabayMed</Text>'s features, you must allow its features to be enabled on your account and device.
          </Text>
        </View>
        <View style={styles.bottomActions}>
          <PrimaryButton title="Return to Previous Page" onPress={() => setDeclinedStage(null)} />
          <OutlineButton
            title="Continue Without Enabling"
            onPress={() => {
              const target = declinedStage;
              setDeclinedStage(null);
              if (target === 'insurance') setStage('sharing');
              else if (target === 'sharing') setStage('location');
              else if (target === 'location') setStage('notifications');
              else if (target === 'notifications') finishOnboarding(consents);
            }}
            style={{ marginTop: 10 }}
          />
        </View>
      </View>
    );
  }

  // Stage 1: 3-slide introductory carousel
  if (stage === 'carousel') {
    const isLast = slideIndex === INTRO_SLIDES.length - 1;
    return (
      <View style={styles.screen}>
        <FlatList
          ref={listRef}
          data={INTRO_SLIDES}
          keyExtractor={item => item.key}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={e => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / width);
            setSlideIndex(idx);
          }}
          renderItem={({ item }) => {
            const SlideIcon = item.icon;
            return (
              <View style={{ width, flex: 1 }}>
                <LinearGradient colors={['#67C9FD', '#8BE0FE']} style={styles.heroHeader}>
                  <View style={styles.heroHeart} />
                  <Text style={styles.heroKicker}>{item.kicker}</Text>
                  <Text style={styles.heroTitle}>{item.title}</Text>
                </LinearGradient>
                <View style={styles.slideBody}>
                  <View style={styles.illustrationCircle}>
                    <IconBadge icon={SlideIcon} size={92} colors={['#55C5F8', '#3BA5EC']} />
                  </View>
                  <Text style={styles.slideSubtitle}>{item.subtitle}</Text>
                </View>
              </View>
            );
          }}
        />

        <View style={styles.carouselFooter}>
          <View style={styles.dots}>
            {INTRO_SLIDES.map((s, idx) => (
              <View key={s.key} style={[styles.dot, idx === slideIndex && styles.dotActive]} />
            ))}
          </View>

          {isLast ? (
            <PrimaryButton title="START" onPress={() => setStage('welcome')} />
          ) : (
            <View style={styles.carouselNavRow}>
              <TouchableOpacity onPress={() => setStage('welcome')} hitSlop={12}>
                <Text style={styles.skipText}>Skip</Text>
              </TouchableOpacity>
              <OutlineButton
                title="Next"
                onPress={() => goToSlide(slideIndex + 1)}
                style={{ width: 120, height: 42 }}
              />
            </View>
          )}
        </View>
      </View>
    );
  }

  // Stage 2: "Let's set up your Care Profile!"
  if (stage === 'welcome') {
    return (
      <View style={styles.screen}>
        <BackButton onPress={() => setStage('carousel')} />
        <View style={styles.centerContent}>
          <AuthLogo size={42} style={{ marginBottom: 24 }} />
          <Text style={authText.title}>
            Let's set up your{'\n'}<Text style={{ color: COLORS.accent }}>Care</Text> Profile!
          </Text>
          <Text style={[authText.subtitle, { marginTop: 10, paddingHorizontal: 18 }]}>
            Review a few quick permissions so we can tailor your healthcare experience.
          </Text>
          <PrimaryButton title="Proceed" onPress={() => setStage('insurance')} style={{ width: '100%', marginTop: 28 }} />
        </View>
      </View>
    );
  }

  // Stage 3 & 4: Insurance Data Processing & Hospital Data Sharing consents
  if (stage === 'insurance' || stage === 'sharing') {
    const isInsurance = stage === 'insurance';
    const item = CONSENTS[isInsurance ? 0 : 1];
    const ConsentIcon = isInsurance ? ShieldCheck : Building2;
    return (
      <View style={styles.screen}>
        <BackButton onPress={() => setStage(isInsurance ? 'welcome' : 'insurance')} />
        <View style={styles.consentContainer}>
          <View style={{ alignItems: 'center', marginBottom: 14 }}>
            <IconBadge icon={ConsentIcon} size={68} />
          </View>
          <Text style={styles.consentTitle}>{item.title}</Text>
          <ScrollView style={styles.consentBox} contentContainerStyle={{ padding: 16 }}>
            <Text style={styles.consentText}>{item.body}</Text>
          </ScrollView>
        </View>
        <View style={styles.bottomActions}>
          <PrimaryButton
            title="Allow"
            onPress={() => {
              const key = isInsurance ? 'insurance_consent' : 'data_sharing_consent';
              setConsents(c => ({ ...c, [key]: true }));
              setStage(isInsurance ? 'sharing' : 'location');
            }}
          />
          <OutlineButton
            title="Do not allow"
            onPress={() => {
              const key = isInsurance ? 'insurance_consent' : 'data_sharing_consent';
              setConsents(c => ({ ...c, [key]: false }));
              setDeclinedStage(stage);
            }}
            style={{ marginTop: 10 }}
          />
        </View>
      </View>
    );
  }

  // Stage 5: Location access prompt + modal popup
  if (stage === 'location') {
    return (
      <View style={styles.screen}>
        <BackButton onPress={() => setStage('sharing')} />
        <View style={styles.centerContent}>
          <IconBadge icon={Building2} size={74} />
          <Text style={[styles.consentTitle, { marginTop: 20 }]}>Looking for a hospital?</Text>
          <Text style={[authText.subtitle, { paddingHorizontal: 16 }]}>
            Allow location access to enable smart hospital routing, nearby facility suggestions, and proximity-based service availability.
          </Text>
        </View>
        <View style={styles.bottomActions}>
          <PrimaryButton title="Allow" onPress={() => setShowLocationPopup(true)} />
          <OutlineButton
            title="Do not allow"
            onPress={() => {
              setConsents(c => ({ ...c, location_allowed: false }));
              setDeclinedStage('location');
            }}
            style={{ marginTop: 10 }}
          />
        </View>

        <Popup
          visible={showLocationPopup}
          icon={MapPin}
          title="Location Access"
          message="To locate nearby hospitals, enable location access in your phone settings."
          actionLabel="Allow access"
          onAction={async () => {
            setShowLocationPopup(false);
            let granted = true;
            try {
              const perm = await Location.requestForegroundPermissionsAsync();
              granted = perm.status === 'granted';
            } catch {}
            setConsents(c => ({ ...c, location_allowed: granted }));
            setStage('notifications');
          }}
        />
      </View>
    );
  }

  // Stage 6: Notifications prompt
  if (stage === 'notifications') {
    return (
      <View style={styles.screen}>
        <BackButton onPress={() => setStage('location')} />
        <View style={styles.centerContent}>
          <IconBadge icon={Bell} size={74} />
          <Text style={[styles.consentTitle, { marginTop: 20 }]}>Allow notifications</Text>
          <Text style={[authText.subtitle, { paddingHorizontal: 16 }]}>
            Allow notifications to receive real-time updates on billing changes, insurance coverage, and important service alerts.
          </Text>
          <View style={{ width: '100%', marginTop: 16 }}>
            <ErrorBanner message={error} />
          </View>
        </View>
        <View style={styles.bottomActions}>
          <PrimaryButton
            title="Allow"
            loading={saving}
            onPress={() => {
              const next = { ...consents, notifications_allowed: true };
              setConsents(next);
              finishOnboarding(next);
            }}
          />
          <OutlineButton
            title="Do not allow"
            disabled={saving}
            onPress={() => {
              setConsents(c => ({ ...c, notifications_allowed: false }));
              setDeclinedStage('notifications');
            }}
            style={{ marginTop: 10 }}
          />
        </View>
      </View>
    );
  }

  // Stage 7: "You're All Set!"
  return (
    <LinearGradient colors={['#E0F4FF', '#FFFFFF', '#E0F4FF']} style={styles.screen}>
      <View style={styles.centerContent}>
        <AuthLogo size={46} style={{ marginBottom: 20 }} />
        <IconBadge icon={CheckCircle2} size={68} />
        <Text style={styles.allSetTitle}>You're All{'\n'}Set!</Text>
        <Text style={[authText.subtitle, { marginBottom: 28, paddingHorizontal: 24 }]}>
          Your care profile is ready. Explore accredited hospitals and medical services near you.
        </Text>
        <PrimaryButton title="Start Seeking Care" onPress={onComplete} style={{ width: '80%' }} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  heroHeader: {
    paddingTop: 68, paddingBottom: 44, paddingHorizontal: 24,
    borderBottomLeftRadius: 160, borderBottomRightRadius: 160,
    alignItems: 'center',
  },
  heroHeart: {
    width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.85)', marginBottom: 14,
  },
  heroKicker: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center' },
  heroTitle: { color: '#fff', fontSize: 30, fontWeight: '800', textAlign: 'center', marginTop: 4 },
  slideBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  illustrationCircle: {
    width: 170, height: 170, borderRadius: 85, backgroundColor: '#F0F9FF',
    alignItems: 'center', justifyContent: 'center', marginBottom: 28,
    borderWidth: 1, borderColor: '#E0F2FE',
  },
  slideSubtitle: { fontSize: 14, color: COLORS.muted, textAlign: 'center', lineHeight: 21 },
  carouselFooter: { paddingHorizontal: 28, paddingBottom: 36, paddingTop: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 22 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#CBD5E1' },
  dotActive: { width: 18, backgroundColor: COLORS.accent },
  carouselNavRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  skipText: { fontSize: 14, color: COLORS.muted, fontWeight: '500', paddingHorizontal: 8 },
  centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  consentContainer: { flex: 1, paddingTop: 96, paddingHorizontal: 24, paddingBottom: 12 },
  consentTitle: { fontSize: 20, fontWeight: '700', color: COLORS.heading, textAlign: 'center', marginBottom: 14 },
  consentBox: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 16, backgroundColor: '#F8FAFC',
  },
  consentText: { fontSize: 13.5, color: COLORS.text, lineHeight: 21, textAlign: 'justify' },
  bottomActions: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 12 },
  allSetTitle: {
    fontSize: 38, fontWeight: '800', color: '#60B6F7', textAlign: 'center', lineHeight: 44, marginTop: 18,
  },
});
