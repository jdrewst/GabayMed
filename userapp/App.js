import './global.css';
import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { HomePage } from './pages/home';
import { SettingsPage, ProfilePage } from './pages/settings';
import { MfaSettingsPage } from './pages/mfa-settings';
import { UnlockPatientApp } from './components/patient-pin';
import { MessagesPage } from './pages/message';
import { SeekMedicalCare } from './pages/seekmedicalcare';
import { MyFacilities } from './pages/facilities';
import { NotificationsPage } from './pages/notifications';
import { BottomNav } from './components/bottom-nav';
import { AppointmentBooking } from './components/appointment';
import { MyAppointmentsModal } from './components/my-appointments';
import { BillingPaymentsModal } from './components/billing-payments';
import { DigitalClaimsModal } from './components/digital-claims';
import { HealthRecordVaultModal } from './components/health-record-vault';
import { LoginPage } from './pages/auth/login';
import { RegisterPage } from './pages/auth/register';
import { ForgotPasswordPage } from './pages/auth/forgot-password';
import { OnboardingPage } from './pages/auth/onboarding';
import Session from './services/session';
import ProfileAPI from './services/profileApi';
import 'react-native-url-polyfill/auto';

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(() => Session.current());
  const [authScreen, setAuthScreen] = useState('login'); // 'login' | 'register'
  const [prefillEmail, setPrefillEmail] = useState('');
  const [activeTab, setActiveTab] = useState('home');
  const [showMfaSettings, setShowMfaSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showMessages, setShowMessages] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showAppointment, setShowAppointment] = useState(false);
  const [preselectedService, setPreselectedService] = useState(null);
  const [showMyAppointments, setShowMyAppointments] = useState(false);
  const [showBilling, setShowBilling] = useState(false);
  const [showClaims, setShowClaims] = useState(false);
  const [showRecordVault, setShowRecordVault] = useState(false);
  const [vaultRefreshKey, setVaultRefreshKey] = useState(0);
  const [appointmentRefreshKey, setAppointmentRefreshKey] = useState(0);

  const triggerAppointmentRefresh = () => {
    setAppointmentRefreshKey(k => k + 1);
  };

  const handleOpenProfilePage = () => {
    setShowProfile(true);
  };

  useEffect(() => {
    const unsubscribe = Session.subscribe(next => {
      setSession(next);
      if (next) {
        ProfileAPI.getProfile({ forceRefresh: true }).catch(() => {});
        ProfileAPI.getPermissions({ forceRefresh: true }).catch(() => {});
      } else {
        ProfileAPI.clearCache();
        setShowMfaSettings(false);
        setShowProfile(false);
        setShowMessages(false);
        setShowNotifications(false);
        setShowAppointment(false);
        setShowMyAppointments(false);
        setShowBilling(false);
        setShowClaims(false);
        setShowRecordVault(false);
        setActiveTab('home');
      }
    });
    Session.restore()
      .then(restored => {
        if (restored) {
          return Promise.all([
            ProfileAPI.getProfile().catch(() => {}),
            ProfileAPI.getPermissions().catch(() => {}),
          ]);
        }
        return null;
      })
      .catch(() => {})
      .finally(() => setBooting(false));
    return unsubscribe;
  }, []);

  if (booting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#3BA5EC" />
        <StatusBar style="dark" />
      </View>
    );
  }

  // 1. Unauthenticated: Login, Registration, or Forgot Password flow
  if (!session) {
    return (
      <View style={styles.container}>
        {authScreen === 'register' ? (
          <RegisterPage
            onBack={() => setAuthScreen('login')}
            onRegistered={registeredEmail => {
              setPrefillEmail(registeredEmail || '');
              setAuthScreen('login');
            }}
          />
        ) : authScreen === 'forgot' ? (
          <ForgotPasswordPage
            onBack={() => setAuthScreen('login')}
            onResetDone={resetEmail => {
              setPrefillEmail(resetEmail || '');
              setAuthScreen('login');
            }}
          />
        ) : (
          <LoginPage
            initialEmail={prefillEmail}
            onSignUp={() => setAuthScreen('register')}
            onForgotPassword={() => setAuthScreen('forgot')}
          />
        )}
        <StatusBar style="dark" />
      </View>
    );
  }

  const lock = screen => (
    <UnlockPatientApp key={session.profile.id} patientId={session.profile.id} requiresPin={session.requiresPin}>
      {screen}
    </UnlockPatientApp>
  );

  // 2. First-time user: Onboarding walkthrough + care profile setup
  if (!session.profile?.onboardingCompleted) {
    return lock(
      <View style={styles.container}>
        <OnboardingPage
          onComplete={() => {
            Session.setProfile({ ...session.profile, onboardingCompleted: true });
          }}
        />
        <StatusBar style="dark" />
      </View>
    );
  }

  // 3. Authenticated & onboarded: Main patient app
  if (showMfaSettings) return lock(<MfaSettingsPage onBack={() => setShowMfaSettings(false)} />);
  if (showMessages) {
    return lock(<MessagesPage onBack={() => setShowMessages(false)} />);
  }

  if (showNotifications) {
    return lock(<NotificationsPage onBack={() => setShowNotifications(false)} />);
  }

  return lock(
    <View style={styles.container}>
      {showProfile ? (
        <ProfilePage onBack={() => setShowProfile(false)} />
      ) : (
        <View style={styles.container}>
          <View style={[styles.tabLayer, activeTab !== 'home' && styles.hiddenTab]}>
            <HomePage
              isActive={activeTab === 'home'}
              onOpenMessages={() => setShowMessages(true)}
              onOpenNotifications={() => setShowNotifications(true)}
              onOpenProfile={handleOpenProfilePage}
              onOpenAppointmentBooking={serviceLabel => {
                setPreselectedService(typeof serviceLabel === 'string' ? serviceLabel : null);
                setShowAppointment(true);
              }}
              onOpenMyAppointments={() => setShowMyAppointments(true)}
              onNavigateToCases={() => setActiveTab('cases')}
              onOpenRecordVault={() => setShowRecordVault(true)}
              vaultRefreshTrigger={vaultRefreshKey}
              refreshTrigger={appointmentRefreshKey}
            />
          </View>
          <View style={[styles.tabLayer, activeTab !== 'cases' && styles.hiddenTab]}>
            <SeekMedicalCare
              isActive={activeTab === 'cases'}
              onOpenMessages={() => setShowMessages(true)}
              onOpenNotifications={() => setShowNotifications(true)}
              onOpenProfile={handleOpenProfilePage}
              onAppointmentBooked={triggerAppointmentRefresh}
            />
          </View>
          <View style={[styles.tabLayer, activeTab !== 'facilities' && styles.hiddenTab]}>
            <MyFacilities
              onOpenMessages={() => setShowMessages(true)}
              onOpenNotifications={() => setShowNotifications(true)}
              onOpenProfile={handleOpenProfilePage}
              onOpenMyAppointments={() => setShowMyAppointments(true)}
              refreshTrigger={appointmentRefreshKey}
            />
          </View>
          <View style={[styles.tabLayer, activeTab !== 'settings' && styles.hiddenTab]}>
            <SettingsPage
              onOpenMessages={() => setShowMessages(true)}
              onOpenNotifications={() => setShowNotifications(true)}
              onOpenProfile={handleOpenProfilePage}
              onOpenBilling={() => setShowBilling(true)}
              onOpenClaims={() => setShowClaims(true)}
              onOpenMfaSettings={() => setShowMfaSettings(true)}
              onOpenRecordVault={() => setShowRecordVault(true)}
              onSignOut={() => setAuthScreen('login')}
            />
          </View>
        </View>
      )}
      <BottomNav
        activeTab={activeTab}
        onTabChange={tab => {
          setShowProfile(false);
          setActiveTab(tab);
        }}
      />
      <AppointmentBooking
        visible={showAppointment}
        initialService={preselectedService}
        onBooked={triggerAppointmentRefresh}
        onClose={() => {
          setShowAppointment(false);
          setPreselectedService(null);
          triggerAppointmentRefresh();
        }}
      />
      <MyAppointmentsModal
        visible={showMyAppointments}
        onChanged={triggerAppointmentRefresh}
        onClose={() => {
          setShowMyAppointments(false);
          triggerAppointmentRefresh();
        }}
        onScheduleNew={() => setShowAppointment(true)}
      />
      <BillingPaymentsModal visible={showBilling} onClose={() => setShowBilling(false)} />
      <DigitalClaimsModal visible={showClaims} onClose={() => setShowClaims(false)} />
      <HealthRecordVaultModal
        visible={showRecordVault}
        onChanged={() => setVaultRefreshKey(k => k + 1)}
        onClose={() => setShowRecordVault(false)}
      />
      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabLayer: { flex: 1 },
  hiddenTab: { display: 'none' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
