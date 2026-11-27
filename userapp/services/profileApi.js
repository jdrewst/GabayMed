import { Appearance } from 'react-native';
import * as SecureStore from '../lib/secureStorage';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import Session from './session';
import AuthAPI from './authApi';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const APP_LANGUAGES = [
  { id: 'en', label: 'English', nativeLabel: 'English' },
  { id: 'fil', label: 'Filipino', nativeLabel: 'Tagalog' },
];

export const THEME_MODES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
];

export const TEXT_SIZES = [
  { id: 'small', label: 'Compact', scale: 0.92 },
  { id: 'medium', label: 'Standard', scale: 1.0 },
  { id: 'large', label: 'Large', scale: 1.15 },
];

export const SERVICE_TRANSLATIONS = {
  en: {
    'General Physician': 'General Physician',
    'Neurologist': 'Neurologist',
    'Cardiologist': 'Cardiologist',
    'Dentist': 'Dentist',
    'Ophthalmologist': 'Ophthalmologist',
    'ENT Specialist': 'ENT Specialist',
    'Orthopedic': 'Orthopedic',
    'Dermatologist': 'Dermatologist',
    'Pulmonologist': 'Pulmonologist',
    'Pharmacist': 'Pharmacist',
    'Hematologist': 'Hematologist',
    'Pediatrician': 'Pediatrician',
  },
  fil: {
    'General Physician': 'Doktor Panlahat',
    'Neurologist': 'Espesyalista sa Utak',
    'Cardiologist': 'Espesyalista sa Puso',
    'Dentist': 'Dentista',
    'Ophthalmologist': 'Doktor sa Mata',
    'ENT Specialist': 'Doktor sa Tainga, Ilong, Lalamunan',
    'Orthopedic': 'Doktor sa Buto',
    'Dermatologist': 'Doktor sa Balat',
    'Pulmonologist': 'Doktor sa Baga',
    'Pharmacist': 'Parmasyutiko',
    'Hematologist': 'Espesyalista sa Dugo',
    'Pediatrician': 'Doktor ng mga Bata',
  },
};

export function getLocalizedService(label, language = 'en') {
  if (!label) return '';
  const langMap = SERVICE_TRANSLATIONS[language] || SERVICE_TRANSLATIONS.en;
  return langMap[label] || label;
}

const TRANSLATIONS = {
  en: {
    // Navigation
    navHome: 'Home',
    navCases: 'Cases',
    navFacilities: 'Facilities',
    navSettings: 'Settings',

    // App Header & Greetings
    greetingMorning: 'Good morning',
    greetingAfternoon: 'Good afternoon',
    greetingEvening: 'Good evening',
    guest: 'Guest',
    messages: 'Messages',
    notifications: 'Notifications',

    // Home Page
    upcomingAppointment: 'Upcoming Appointment',
    schedule: 'Schedule',
    viewCancelAppointment: 'View / Cancel Appointment',
    noUpcomingAppointments: 'No upcoming appointments',
    scheduleAnAppointment: 'Schedule an appointment',
    myAppointments: 'My Appointments',
    healthRecordVault: 'Health Record Vault',
    healthRecordVaultDesc: 'Keep lab results, prescriptions and scans in one place',
    files: 'files',
    file: 'file',
    latest: 'Latest',
    updated: 'Updated',
    seekMedicalCare: 'Seek Medical Care',
    browseByServices: 'Browse by Services',
    showLess: 'Show Less',
    seeAll: 'See All',

    // Seek Medical Care & Hospital Search
    searchHospital: 'Search hospital',
    searchCityLocation: 'Search city or location',
    searchServices: 'Search services (e.g. Cardiology)',
    allHospitals: 'All Hospitals',
    gabayClinics: 'Gabay Clinics',
    publicHospitals: 'Public Hospitals',
    privateHospitals: 'Private Hospitals',
    nearby: 'Nearby',
    bookAppointment: 'Book Appointment',
    directions: 'Directions',
    noHospitalsFound: 'No facilities found matching your criteria',
    viewDetails: 'View Details',
    callFacility: 'Call',
    servicesOffered: 'Services Offered',
    emergency: 'Emergency',

    // Facilities & Billing Ledger
    myFacilitiesTitle: 'My Facilities & Records',
    allCharges: 'All Charges',
    pending: 'Pending',
    paid: 'Paid',
    totalBalance: 'Total Outstanding Balance',
    insuranceCovered: 'Covered by Insurance / HMO',
    patientDue: 'Patient Portion Due',
    payNow: 'Pay Now',
    paymentHistory: 'Payment History',
    billingLedger: 'Billing Ledger',
    recentActivity: 'Recent Activity',
    makePayment: 'Make a Payment',
    selectPaymentMethod: 'Select Payment Method',
    amountToPay: 'Amount to Pay',
    receipts: 'Receipts',

    // Messages
    messagesTitle: 'Messages',
    searchConversations: 'Search hospitals and clinics',
    noMessages: 'No messages yet',
    startConversation: 'Start a conversation',
    unableToLoadConversations: 'Unable to load conversations.',
    noMatchingHospitals: 'No matching hospitals or clinics.',
    noLinkedHospitals: 'No linked hospitals or clinics yet.',
    tryAgain: 'Try again',
    typeMessage: 'Type a message...',
    send: 'Send',

    // Notifications
    notificationsTitle: 'Notifications',
    markAll: 'Mark all',
    markAllRead: 'Mark all as read',
    noNotifications: 'No notifications yet',
    clearAll: 'Clear all',
    on: 'On',
    off: 'Off',

    // Common Action Buttons & Labels
    cancel: 'Cancel',
    confirm: 'Confirm',
    save: 'Save',
    saved: 'Saved',
    close: 'Close',
    back: 'Back',
    loading: 'Loading...',
    done: 'Done',
    edit: 'Edit',
    delete: 'Delete',
    refresh: 'Refresh',
    compact: 'Compact',
    standard: 'Standard',
    large: 'Large',

    // Settings
    settingsTitle: 'Settings',
    tapToViewProfile: 'Tap to view & update your personal and medical records',
    appPreferencesHeader: 'Language & Display Preferences',
    languageTitle: 'App Language',
    languageDesc: 'Choose your preferred language across GabayMed',
    themeTitle: 'Appearance & Theme',
    themeDesc: 'Switch between Light, Dark, or System display mode',
    textSizeTitle: 'Text Size',
    textSizeDesc: 'Adjust reading size for comfortable viewing',
    highContrastTitle: 'High Contrast Display',
    highContrastDesc: 'Increase text and border contrast for better visibility',
    notificationsHeader: 'Notification Preferences',
    allNotificationsTitle: 'Allow Push & In-App Notifications',
    allNotificationsDesc: 'Master switch for all GabayMed alerts and updates',
    notifyAppointmentsTitle: 'Appointment Reminders',
    notifyAppointmentsDesc: 'Upcoming consultations, confirmations, and schedule changes',
    notifyBillingTitle: 'Billing & Payment Alerts',
    notifyBillingDesc: 'Ledger charges, due dates, and payment receipts',
    notifyInsuranceTitle: 'Insurance & Coverage Updates',
    notifyInsuranceDesc: 'PhilHealth & HMO policy renewals and claim status',
    notifyMessagesTitle: 'Direct Facility Messages',
    notifyMessagesDesc: 'New chat messages and replies from healthcare providers',
    notifyPromosTitle: 'Promotions & Health Tips',
    notifyPromosDesc: 'Partner hospital offers, check-up packages, and advisories',
    permissionsHeader: 'Permissions & Privacy',
    insuranceConsentTitle: 'Insurance Data Processing',
    insuranceConsentDesc: 'Estimate real-time PhilHealth & HMO coverage deductions',
    dataSharingTitle: 'Hospital Data Sharing',
    dataSharingDesc: 'Share medical forms and the vault files you mark as shared with your clinic. Off keeps them all private.',
    locationTitle: 'Location Access',
    locationDesc: 'Enable smart hospital routing and nearby facility suggestions',
    generalHeader: 'General & Legal',
    accountSecurity: 'Password, app PIN, and MFA',
    terms: 'Terms & Conditions',
    privacy: 'Privacy Policy',
    healthVault: 'Health Record Vault',
    history: 'History',
    help: 'Help & Support',
    deleteAccount: 'Delete Account',
    signOut: 'Sign Out',
  },
  fil: {
    // Navigation
    navHome: 'Tahanan',
    navCases: 'Mga Kaso',
    navFacilities: 'Pasilidad',
    navSettings: 'Mga Setting',

    // App Header & Greetings
    greetingMorning: 'Magandang umaga',
    greetingAfternoon: 'Magandang hapon',
    greetingEvening: 'Magandang gabi',
    guest: 'Bisita',
    messages: 'Mga Mensahe',
    notifications: 'Mga Abiso',

    // Home Page
    upcomingAppointment: 'Nakatakdang Konsultasyon',
    schedule: 'Mag-iskedyul',
    viewCancelAppointment: 'Tingnan / Kanselahin ang Appointment',
    noUpcomingAppointments: 'Walang nakatakdang appointment',
    scheduleAnAppointment: 'Mag-iskedyul ng appointment',
    myAppointments: 'Aking mga Appointment',
    healthRecordVault: 'Health Record Vault (Mga Rekord)',
    healthRecordVaultDesc: 'Itago ang lab results, reseta at scan sa isang ligtas na lugar',
    files: 'mga file',
    file: 'file',
    latest: 'Pinakabago',
    updated: 'Na-update noong',
    seekMedicalCare: 'Maghanap ng Kalinga',
    browseByServices: 'Mag-browse ayon sa Serbisyo',
    showLess: 'Mas Kaunti',
    seeAll: 'Tingnan Lahat',

    // Seek Medical Care & Hospital Search
    searchHospital: 'Maghanap ng ospital',
    searchCityLocation: 'Maghanap ng lungsod o lokasyon',
    searchServices: 'Maghanap ng serbisyo (hal. Cardiology)',
    allHospitals: 'Lahat ng Ospital',
    gabayClinics: 'Mga Klinika ng Gabay',
    publicHospitals: 'Pampublikong Ospital',
    privateHospitals: 'Pribadong Ospital',
    nearby: 'Malapit',
    bookAppointment: 'Mag-book ng Konsultasyon',
    directions: 'Ruta at Direksyon',
    noHospitalsFound: 'Walang pasilidad na tumutugma sa iyong hinahanap',
    viewDetails: 'Tingnan ang Detalye',
    callFacility: 'Tawagan',
    servicesOffered: 'Mga Serbisyong Iniaalok',
    emergency: 'Emerhensiya',

    // Facilities & Billing Ledger
    myFacilitiesTitle: 'Aking Mga Pasilidad at Rekord',
    allCharges: 'Lahat ng Singil',
    pending: 'Nakabinbin',
    paid: 'Bayad Na',
    totalBalance: 'Kabuuang Natitirang Balanse',
    insuranceCovered: 'Sagot ng Insurance / HMO',
    patientDue: 'Babasahing Babayaran ng Pasyente',
    payNow: 'Magbayad Ngayon',
    paymentHistory: 'Kasaysayan ng Pagbabayad',
    billingLedger: 'Ledger ng Singil',
    recentActivity: 'Kamakailang Aktibidad',
    makePayment: 'Magsagawa ng Bayad',
    selectPaymentMethod: 'Pumili ng Paraan ng Pagbabayad',
    amountToPay: 'Halagang Babayaran',
    receipts: 'Mga Resibo',

    // Messages
    messagesTitle: 'Mga Mensahe',
    searchConversations: 'Maghanap ng ospital at klinika',
    noMessages: 'Wala pang mga mensahe',
    startConversation: 'Magsimula ng pag-uusap',
    unableToLoadConversations: 'Hindi mai-load ang mga pag-uusap.',
    noMatchingHospitals: 'Walang tumutugmang ospital o klinika.',
    noLinkedHospitals: 'Wala pang nakakabit na ospital o klinika.',
    tryAgain: 'Subukang muli',
    typeMessage: 'Mag-type ng mensahe...',
    send: 'Ipadala',

    // Notifications
    notificationsTitle: 'Mga Abiso',
    markAll: 'Markahan lahat',
    markAllRead: 'Markahan lahat bilang nabasa',
    noNotifications: 'Wala pang mga abiso',
    clearAll: 'Linisin lahat',
    on: 'Naka-on',
    off: 'Naka-off',

    // Common Action Buttons & Labels
    cancel: 'Kanselahin',
    confirm: 'Kumpirmahin',
    save: 'I-save',
    saved: 'Nai-save na',
    close: 'Isara',
    back: 'Bumalik',
    loading: 'Naglo-load...',
    done: 'Tapos na',
    edit: 'I-edit',
    delete: 'Burahin',
    refresh: 'I-refresh',
    compact: 'Maliit',
    standard: 'Katamtaman',
    large: 'Malaki',

    // Settings
    settingsTitle: 'Mga Setting',
    tapToViewProfile: 'I-tap upang tingnan at i-update ang iyong rekord medikal',
    appPreferencesHeader: 'Wika at Display',
    languageTitle: 'Wika ng App',
    languageDesc: 'Piliin ang gustong wika sa paggamit ng GabayMed',
    themeTitle: 'Hitsura at Tema',
    themeDesc: 'Pumili sa Light, Dark, o System display mode',
    textSizeTitle: 'Laki ng Teksto',
    textSizeDesc: 'I-adjust ang laki ng letra para sa mas malinaw na pagbasa',
    highContrastTitle: 'High Contrast Display',
    highContrastDesc: 'Patitingkarin ang kulay at linya para sa mas malinaw na screen',
    notificationsHeader: 'Mga Abiso (Notifications)',
    allNotificationsTitle: 'Payagan ang Lahat ng Abiso',
    allNotificationsDesc: 'Pangkalahatang switch para sa lahat ng alerto ng GabayMed',
    notifyAppointmentsTitle: 'Paalala sa Appointment',
    notifyAppointmentsDesc: 'Mga nakatakdang konsultasyon, kumpirmasyon, at pagbabago',
    notifyBillingTitle: 'Alerto sa Bayarin at Billing',
    notifyBillingDesc: 'Mga singil sa ledger, takdang araw ng bayad, at resibo',
    notifyInsuranceTitle: 'Update sa Insurance at HMO',
    notifyInsuranceDesc: 'Pag-renew ng PhilHealth o HMO at status ng claim',
    notifyMessagesTitle: 'Mensahe mula sa Pasilidad',
    notifyMessagesDesc: 'Mga bagong chat at sagot mula sa doktor o ospital',
    notifyPromosTitle: 'Promosyon at Payong Pangkalusugan',
    notifyPromosDesc: 'Diskwento sa partner na ospital at mga health tip',
    permissionsHeader: 'Pahintulot at Privacy',
    insuranceConsentTitle: 'Pagproseso ng Insurance Data',
    insuranceConsentDesc: 'Kalkulahin ang bawas mula sa PhilHealth at HMO',
    dataSharingTitle: 'Pagbahagi ng Data sa Ospital',
    dataSharingDesc: 'Ibahagi sa iyong klinika ang medical form at mga file sa vault na minarkahan mong ibahagi. Kapag naka-off, lahat ay pribado.',
    locationTitle: 'Access sa Lokasyon',
    locationDesc: 'Maghanap ng pinakamalapit na ospital at ruta sa mapa',
    generalHeader: 'Pangkalahatan at Legal',
    accountSecurity: 'Password, PIN ng app, at MFA',
    terms: 'Mga Tuntunin at Kondisyon',
    privacy: 'Patakaran sa Privacy',
    healthVault: 'Health Record Vault (Mga Rekord)',
    history: 'Kasaysayan (History)',
    help: 'Tulong at Suporta',
    deleteAccount: 'Burahin ang Account',
    signOut: 'Mag-sign Out',
  },
};

export function getAppTranslations(language = 'en') {
  return TRANSLATIONS[language] || TRANSLATIONS.en;
}

export function getDisplayConfig(perms = {}) {
  const systemDark = Appearance.getColorScheme() === 'dark';
  const isDark = perms?.themeMode === 'dark' || (perms?.themeMode === 'system' && systemDark);
  const highContrast = !!perms?.highContrast;
  const textSizeObj = (Array.isArray(TEXT_SIZES) ? TEXT_SIZES.find(t => t.id === perms?.textSize) : null) || { scale: 1.0 };
  const fontScale = textSizeObj.scale;

  if (isDark) {
    return {
      isDark: true,
      highContrast,
      fontScale,
      bg: highContrast ? '#020617' : '#0f172a',
      cardBg: highContrast ? '#0f172a' : '#1e293b',
      subCardBg: highContrast ? '#1e293b' : '#334155',
      textPrimary: '#f8fafc',
      textSecondary: highContrast ? '#e2e8f0' : '#94a3b8',
      border: highContrast ? '#475569' : '#334155',
      divider: '#334155',
      inputBg: highContrast ? '#0f172a' : '#1e293b',
      inputText: '#f8fafc',
      placeholder: '#94a3b8',
      accent: '#38bdf8',
      statusBarStyle: 'light',
    };
  }

  return {
    isDark: false,
    highContrast,
    fontScale,
    bg: '#ffffff',
    cardBg: '#ffffff',
    subCardBg: '#f8fafc',
    textPrimary: highContrast ? '#000000' : '#1f2937',
    textSecondary: highContrast ? '#1e293b' : '#6b7280',
    border: highContrast ? '#94a3b8' : '#f3f4f6',
    divider: highContrast ? '#cbd5e1' : '#f3f4f6',
    inputBg: '#f9fafb',
    inputText: '#1f2937',
    placeholder: '#9ca3af',
    accent: '#0ea5e9',
    statusBarStyle: 'dark',
  };
}

function formatReadableDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return 'Not set';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return `${MONTHS[m - 1] || ''} ${d}, ${y}`;
}

function computeAge(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return 'N/A';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  const today = new Date();
  let age = today.getFullYear() - y;
  const md = today.getMonth() + 1 - m;
  if (md < 0 || (md === 0 && today.getDate() < d)) age--;
  return age >= 0 ? String(age) : 'N/A';
}

function normalizePhoneLocal(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.startsWith('63') && digits.length === 12) return digits.slice(2);
  if (digits.startsWith('09') && digits.length === 11) return digits.slice(1);
  if (digits.startsWith('9') && digits.length === 10) return digits;
  return digits.slice(-10);
}

function normalizeRowToUi(raw) {
  const isoDob = raw.date_of_birth ? String(raw.date_of_birth).slice(0, 10) : '';
  const nameParts = (raw.full_name || '').trim().split(/\s+/);
  const firstName = raw.first_name || nameParts[0] || '';
  const lastName = raw.last_name || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');
  const fullName =
    raw.full_name ||
    [firstName, raw.middle_name, lastName, raw.name_suffix].filter(Boolean).join(' ') ||
    'Patient';

  const allergiesRaw = raw.allergies && raw.allergies !== 'None' ? String(raw.allergies) : '';
  const historyRaw = raw.medical_history ? String(raw.medical_history) : '';

  const addressCombined =
    raw.address ||
    [raw.street_address, raw.barangay, raw.city_municipality, raw.province, raw.zip_code]
      .filter(Boolean)
      .join(', ');

  return {
    id: raw.id,
    firstName,
    middleName: raw.middle_name || '',
    lastName,
    nameSuffix: raw.name_suffix || '',
    name: fullName,
    age: raw.age && raw.age !== 'N/A' ? String(raw.age) : computeAge(isoDob),
    birthdate: formatReadableDate(isoDob),
    rawBirthdate: isoDob,
    gender: raw.gender || 'Not set',
    phone: raw.phone_number || 'Not set',
    mobileLocal: normalizePhoneLocal(raw.phone_number),
    email: raw.email || 'Not set',
    streetAddress: raw.street_address || '',
    barangay: raw.barangay || '',
    cityMunicipality: raw.city_municipality || '',
    province: raw.province || '',
    zipCode: raw.zip_code || '',
    address: addressCombined || 'Not set',
    bloodType: raw.blood_type || 'Not set',
    allergies: allergiesRaw || 'None',
    allergiesList: allergiesRaw
      ? allergiesRaw
        .split(/[\n,;]+/)
        .map(s => s.trim())
        .filter(s => s && s.toLowerCase() !== 'none')
      : [],
    medicalHistory: historyRaw
      ? historyRaw
        .split(/[\n,;]+/)
        .map(s => s.trim())
        .filter(s => s && s.toLowerCase() !== 'none')
      : [],
    avatar: raw.avatar_url || '',
    insuranceConsent:
      typeof raw.insurance_consent === 'boolean' ? raw.insurance_consent : true,
    // Health data is shared with clinics only after an explicit opt-in (US-4.0); unset means restricted.
    dataSharingConsent:
      typeof raw.data_sharing_consent === 'boolean' ? raw.data_sharing_consent : false,
  };
}

let cachedProfile = null;
const profileListeners = new Set();
let cachedPermissions = null;
const permissionListeners = new Set();

function getPermissionsKey() {
  const uid = Session.getUserId() || 'default';
  return `gabay_permissions_v1_${uid}`;
}

let realtimeChannel = null;
let realtimeUserId = null;

function stopRealtimeProfileSync() {
  if (realtimeChannel) {
    try { supabase.removeChannel(realtimeChannel); } catch { }
    realtimeChannel = null;
    realtimeUserId = null;
  }
}

function ensureRealtimeProfileSync() {
  const userId = Session.getUserId();
  if (!userId) {
    stopRealtimeProfileSync();
    return;
  }
  if (realtimeChannel && realtimeUserId === userId) return;
  stopRealtimeProfileSync();
  realtimeUserId = userId;
  try {
    realtimeChannel = supabase
      .channel(`profile-sync-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        payload => {
          if (payload?.new) {
            const formatted = normalizeRowToUi(payload.new);
            Session.setProfile({
              id: formatted.id,
              firstName: formatted.firstName,
              lastName: formatted.lastName,
              fullName: formatted.name,
              email: formatted.email,
              avatar: formatted.avatar,
              gender: formatted.gender,
              onboardingCompleted: true,
            });
            notifyProfileChanged(formatted);
          }
        }
      )
      .subscribe();
  } catch { }
}

function notifyProfileChanged(profile) {
  cachedProfile = profile;
  profileListeners.forEach(fn => {
    try { fn(profile); } catch { }
  });
}

function notifyPermissionsChanged(perms) {
  cachedPermissions = perms;
  permissionListeners.forEach(fn => {
    try { fn(perms); } catch { }
  });
}

const ProfileAPI = {
  clearCache() {
    cachedProfile = null;
    cachedPermissions = null;
    stopRealtimeProfileSync();
  },

  subscribe(listener) {
    profileListeners.add(listener);
    ensureRealtimeProfileSync();
    return () => {
      profileListeners.delete(listener);
      if (profileListeners.size === 0) stopRealtimeProfileSync();
    };
  },

  subscribePermissions(listener) {
    permissionListeners.add(listener);
    return () => permissionListeners.delete(listener);
  },

  /**
   * Synchronously returns the cached profile in memory (if already loaded),
   * avoiding any default icon/name flash when switching tabs or opening Profile.
   */
  getCachedProfile() {
    if (cachedProfile) return cachedProfile;
    const sessionProfile = Session.current()?.profile;
    if (sessionProfile) {
      return {
        id: sessionProfile.id,
        firstName: sessionProfile.firstName || '',
        middleName: '',
        lastName: sessionProfile.lastName || '',
        nameSuffix: '',
        name:
          sessionProfile.fullName ||
          [sessionProfile.firstName, sessionProfile.lastName].filter(Boolean).join(' ') ||
          'Patient',
        age: 'N/A',
        birthdate: 'Not set',
        rawBirthdate: '',
        gender: sessionProfile.gender || 'Not set',
        phone: 'Not set',
        mobileLocal: '',
        email: sessionProfile.email || 'Not set',
        streetAddress: '',
        barangay: '',
        cityMunicipality: '',
        province: '',
        zipCode: '',
        address: 'Not set',
        bloodType: 'Not set',
        allergies: 'None',
        allergiesList: [],
        medicalHistory: [],
        avatar: sessionProfile.avatar || '',
        insuranceConsent: true,
        dataSharingConsent: false,
      };
    }
    return null;
  },

  getCachedPermissions() {
    return cachedPermissions;
  },

  /**
   * Reads the user's 4 onboarding/settings permissions (`insuranceConsent`, `dataSharingConsent`,
   * `locationAllowed`, `notificationsAllowed`), combining device SecureStore state, OS location status,
   * and database profile consents.
   */
  async getPermissions({ forceRefresh = false } = {}) {
    if (cachedPermissions && !forceRefresh) {
      return cachedPermissions;
    }
    let stored = {};
    try {
      const raw = await SecureStore.getItemAsync(getPermissionsKey());
      if (raw) stored = JSON.parse(raw) || {};
    } catch { }

    let osLocationGranted = false;
    try {
      const perm = await Location.getForegroundPermissionsAsync();
      osLocationGranted = perm?.status === 'granted';
    } catch { }

    const resolved = {
      insuranceConsent:
        typeof stored.insuranceConsent === 'boolean'
          ? stored.insuranceConsent
          : typeof cachedProfile?.insuranceConsent === 'boolean'
            ? cachedProfile.insuranceConsent
            : true,
      dataSharingConsent:
        typeof stored.dataSharingConsent === 'boolean'
          ? stored.dataSharingConsent
          : typeof cachedProfile?.dataSharingConsent === 'boolean'
            ? cachedProfile.dataSharingConsent
            : false,
      // Location is ON only when both the app toggle is allowed AND OS permission is granted
      locationAllowed:
        typeof stored.locationAllowed === 'boolean'
          ? stored.locationAllowed && osLocationGranted
          : osLocationGranted,
      notificationsAllowed:
        typeof stored.notificationsAllowed === 'boolean'
          ? stored.notificationsAllowed
          : true,
      // Specific notification category toggles
      notifyAppointments:
        typeof stored.notifyAppointments === 'boolean'
          ? stored.notifyAppointments
          : true,
      notifyBilling:
        typeof stored.notifyBilling === 'boolean'
          ? stored.notifyBilling
          : true,
      notifyInsurance:
        typeof stored.notifyInsurance === 'boolean'
          ? stored.notifyInsurance
          : true,
      notifyMessages:
        typeof stored.notifyMessages === 'boolean'
          ? stored.notifyMessages
          : true,
      notifyPromos:
        typeof stored.notifyPromos === 'boolean'
          ? stored.notifyPromos
          : true,
      // Application Language & Display Preferences
      language: stored.language === 'fil' ? 'fil' : 'en',
      themeMode: stored.themeMode || 'light',
      textSize: stored.textSize || 'medium',
      highContrast:
        typeof stored.highContrast === 'boolean'
          ? stored.highContrast
          : false,
    };
    cachedPermissions = resolved;
    return resolved;
  },

  /**
   * Updates one or more permissions (`insuranceConsent`, `dataSharingConsent`, `locationAllowed`, `notificationsAllowed`),
   * persists them immediately on device (`SecureStore`), notifies active screens (Map, Settings, Notifications),
   * and syncs database consents (`insurance_consent`, `data_sharing_consent`).
   */
  async setPermissions(patch = {}) {
    const currentPerms = cachedPermissions || (await this.getPermissions());
    let stored = {};
    try {
      const raw = await SecureStore.getItemAsync(getPermissionsKey());
      if (raw) stored = JSON.parse(raw) || {};
    } catch { }

    const next = {
      ...currentPerms,
      ...stored,
      ...patch,
    };

    try {
      await SecureStore.setItemAsync(getPermissionsKey(), JSON.stringify(next));
    } catch { }

    notifyPermissionsChanged(next);

    // Sync insurance_consent and data_sharing_consent to Supabase in background if changed
    if (
      typeof patch.insuranceConsent === 'boolean' ||
      typeof patch.dataSharingConsent === 'boolean'
    ) {
      const dbPatch = {};
      if (typeof patch.insuranceConsent === 'boolean') {
        dbPatch.insurance_consent = patch.insuranceConsent;
      }
      if (typeof patch.dataSharingConsent === 'boolean') {
        dbPatch.data_sharing_consent = patch.dataSharingConsent;
      }

      if (cachedProfile) {
        notifyProfileChanged({
          ...cachedProfile,
          ...(typeof patch.insuranceConsent === 'boolean'
            ? { insuranceConsent: patch.insuranceConsent }
            : {}),
          ...(typeof patch.dataSharingConsent === 'boolean'
            ? { dataSharingConsent: patch.dataSharingConsent }
            : {}),
        });
      }

      try {
        const token = await Session.getAccessToken();
        if (token) {
          const res = await AuthAPI.updateConsents(token, dbPatch);
          if (res?.profile) {
            notifyProfileChanged(normalizeRowToUi({ ...res.profile, ...dbPatch }));
            return next;
          }
        }
      } catch { }

      try {
        const userId = Session.getUserId();
        if (userId) {
          const { data } = await supabase
            .from('profiles')
            .update(dbPatch)
            .eq('id', userId)
            .select('*')
            .single();
          if (data) notifyProfileChanged(normalizeRowToUi({ ...data, ...dbPatch }));
        }
      } catch { }
    }

    return next;
  },

  /**
   * READ: Fetches the current patient's personal, demographic, and medical profile.
   * Uses in-memory cache immediately when already loaded unless `forceRefresh: true`.
   */
  async getProfile({ forceRefresh = false } = {}) {
    if (cachedProfile && !forceRefresh) {
      return cachedProfile;
    }
    try {
      const token = await Session.getAccessToken();
      if (token) {
        try {
          const res = await AuthAPI.getProfile(token);
          if (res?.profile) {
            const formatted = normalizeRowToUi(res.profile);
            notifyProfileChanged(formatted);
            return formatted;
          }
        } catch { }
      }

      // Direct Supabase fallback
      const userId = Session.getUserId();
      if (!userId) throw new Error('User not logged in');

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      const formatted = normalizeRowToUi(profile);
      notifyProfileChanged(formatted);
      return formatted;
    } catch (error) {
      console.error('Get Profile Error:', error);
      throw error;
    }
  },

  /**
   * Updates ONLY the patient's profile picture or character preset without touching or requiring other fields.
   */
  async updateAvatar(avatarValue) {
    const cleanAvatar = avatarValue || '';
    const token = await Session.getAccessToken();
    if (token) {
      try {
        const res = await AuthAPI.updateAvatar(token, cleanAvatar);
        if (res?.profile) {
          const formatted = normalizeRowToUi(res.profile);
          notifyProfileChanged(formatted);
          return formatted;
        }
      } catch { }
    }

    const userId = Session.getUserId();
    if (!userId) throw new Error('User not logged in');

    const { data, error } = await supabase
      .from('profiles')
      .update({ avatar_url: cleanAvatar || null })
      .eq('id', userId)
      .select('*')
      .single();

    if (error) throw error;
    const formatted = normalizeRowToUi(data);
    notifyProfileChanged(formatted);
    return formatted;
  },

  /**
   * Updates ONLY the patient's medical records (blood type, allergies list, medical history list)
   * and synchronizes them to all linked facility patient records without overwriting personal details.
   */
  async updateMedicalRecords({ bloodType, allergiesList, medicalHistory }) {
    const bt = bloodType && bloodType !== 'Not set' ? String(bloodType).trim() : '';
    const allergiesStr = (allergiesList || []).map(s => String(s || '').trim()).filter(Boolean).join(', ');
    const historyStr = (medicalHistory || []).map(s => String(s || '').trim()).filter(Boolean).join(', ');

    const token = await Session.getAccessToken();
    if (token) {
      try {
        const res = await AuthAPI.updateMedical(token, {
          blood_type: bt,
          allergies: allergiesStr,
          medical_history: historyStr,
        });
        if (res?.profile) {
          const formatted = normalizeRowToUi(res.profile);
          notifyProfileChanged(formatted);
          return formatted;
        }
      } catch (err) {
        if (err?.status && err.status !== 404) throw err;
      }
    }

    const userId = Session.getUserId();
    if (!userId) throw new Error('User not logged in');

    const { data: prevProfile } = await supabase
      .from('profiles')
      .select('blood_type, allergies, medical_history')
      .eq('id', userId)
      .maybeSingle();

    const { data, error } = await supabase
      .from('profiles')
      .update({
        blood_type: bt || null,
        allergies: allergiesStr || null,
        medical_history: historyStr || null,
      })
      .eq('id', userId)
      .select('*')
      .single();

    if (error) throw error;

    const { error: syncError } = await supabase
      .from('patients')
      .update({ medical_history: historyStr || null })
      .eq('profile_id', userId);

    if (syncError) {
      if (prevProfile) {
        try {
          await supabase
            .from('profiles')
            .update({
              blood_type: prevProfile.blood_type ?? null,
              allergies: prevProfile.allergies ?? null,
              medical_history: prevProfile.medical_history ?? null,
            })
            .eq('id', userId);
        } catch { }
      }
      throw new Error(
        'Could not synchronize your medical records with linked clinics. No changes were saved. Please try again.'
      );
    }

    const formatted = normalizeRowToUi(data);
    notifyProfileChanged(formatted);
    return formatted;
  },

  /**
   * Updates onboarding permission consents (`insurance_consent`, `data_sharing_consent`).
   */
  async updateConsents({ insuranceConsent, dataSharingConsent }) {
    const patch = {};
    if (typeof insuranceConsent === 'boolean') patch.insurance_consent = insuranceConsent;
    if (typeof dataSharingConsent === 'boolean') patch.data_sharing_consent = dataSharingConsent;

    const token = await Session.getAccessToken();
    if (token) {
      try {
        const res = await AuthAPI.updateConsents(token, patch);
        if (res?.profile) {
          const formatted = normalizeRowToUi(res.profile);
          notifyProfileChanged(formatted);
          return formatted;
        }
      } catch { }
    }

    const userId = Session.getUserId();
    if (!userId) throw new Error('User not logged in');

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('*')
      .single();

    if (error) throw error;
    const formatted = normalizeRowToUi(data);
    notifyProfileChanged(formatted);
    return formatted;
  },

  /**
   * UPDATE:
   * Validates and updates ONLY personal, contact, and demographic details via the backend,
   * synchronizing them across linked facility records without overwriting medical records.
   * Supports OTP-verified email update via `newEmail` + `otpToken`.
   */
  async updateProfile(updates) {
    const payload = {
      first_name: (updates.firstName || '').trim(),
      middle_name: (updates.middleName || '').trim(),
      last_name: (updates.lastName || '').trim(),
      name_suffix: (updates.nameSuffix || '').trim(),
      date_of_birth: (updates.rawBirthdate || '').trim(),
      gender: updates.gender && updates.gender !== 'Not set' ? updates.gender : '',
      phone_number: updates.mobileLocal || updates.phone || '',
      street_address: (updates.streetAddress || '').trim(),
      barangay: (updates.barangay || '').trim(),
      city_municipality: (updates.cityMunicipality || '').trim(),
      province: (updates.province || '').trim(),
      zip_code: (updates.zipCode || '').trim(),
    };

    if (updates.newEmail) {
      payload.new_email = String(updates.newEmail).trim().toLowerCase();
      payload.otp_token = updates.otpToken || '';
    }

    const token = await Session.getAccessToken();
    if (token) {
      try {
        const res = await AuthAPI.updateProfile(token, payload);
        if (res?.profile) {
          const formatted = normalizeRowToUi(res.profile);
          Session.setProfile({
            id: formatted.id,
            firstName: formatted.firstName,
            lastName: formatted.lastName,
            fullName: formatted.name,
            email: formatted.email,
            onboardingCompleted: true,
          });
          notifyProfileChanged(formatted);
          return formatted;
        }
      } catch (err) {
        if (err?.status && err.status !== 404) throw err;
      }
    }

    // Fallback direct update only if local backend server is unreachable
    const userId = Session.getUserId();
    if (!userId) throw new Error('User not logged in');

    const full_name = [
      payload.first_name,
      payload.middle_name,
      payload.last_name,
      payload.name_suffix,
    ]
      .filter(Boolean)
      .join(' ');
    const address = [
      payload.street_address,
      payload.barangay,
      payload.city_municipality,
      payload.province,
      payload.zip_code,
    ]
      .filter(Boolean)
      .join(', ');
    const phoneDigits = String(payload.phone_number).replace(/\D/g, '').replace(/^0+/, '');
    const normalizedPhone = phoneDigits.startsWith('63') ? `+${phoneDigits}` : `+63${phoneDigits}`;

    const dbUpdates = {
      first_name: payload.first_name,
      middle_name: payload.middle_name || null,
      last_name: payload.last_name,
      name_suffix: payload.name_suffix || null,
      full_name,
      date_of_birth: payload.date_of_birth || null,
      gender: payload.gender || null,
      phone_number: normalizedPhone,
      street_address: payload.street_address || null,
      barangay: payload.barangay || null,
      city_municipality: payload.city_municipality || null,
      province: payload.province || null,
      zip_code: payload.zip_code || null,
      address: address || null,
    };

    if (payload.new_email) {
      dbUpdates.email = payload.new_email;
    }

    const { data: prevProfile } = await supabase
      .from('profiles')
      .select(
        'first_name, middle_name, last_name, name_suffix, full_name, email, date_of_birth, gender, phone_number, street_address, barangay, city_municipality, province, zip_code, address'
      )
      .eq('id', userId)
      .maybeSingle();

    const { data, error } = await supabase
      .from('profiles')
      .update(dbUpdates)
      .eq('id', userId)
      .select('*')
      .single();

    if (error) throw error;

    const ageStr = calculateAge(payload.date_of_birth);
    const ageNum = ageStr !== 'N/A' && !Number.isNaN(Number(ageStr)) ? Number(ageStr) : null;
    const { error: syncError } = await supabase
      .from('patients')
      .update({
        full_name,
        first_name: payload.first_name,
        middle_name: payload.middle_name || null,
        last_name: payload.last_name,
        phone_number: normalizedPhone,
        address: address || null,
        date_of_birth: payload.date_of_birth || null,
        gender: payload.gender || null,
        age: ageNum,
      })
      .eq('profile_id', userId);

    if (syncError) {
      if (prevProfile) {
        try {
          await supabase.from('profiles').update(prevProfile).eq('id', userId);
        } catch { }
      }
      throw new Error(
        'Could not synchronize your profile with linked clinics. No changes were saved. Please try again.'
      );
    }

    const formatted = normalizeRowToUi(data);
    Session.setProfile({
      id: formatted.id,
      firstName: formatted.firstName,
      lastName: formatted.lastName,
      fullName: formatted.name,
      email: formatted.email,
      onboardingCompleted: true,
    });
    notifyProfileChanged(formatted);
    return formatted;
  },

  /**
   * DELETE / Clear medical field (`allergies`, `medical_history`, or `all`).
   */
  async clearMedicalRecord(field = 'all') {
    const token = await Session.getAccessToken();
    if (token) {
      try {
        const res = await AuthAPI.clearMedicalField(token, field);
        if (res?.profile) {
          const formatted = normalizeRowToUi(res.profile);
          notifyProfileChanged(formatted);
          return formatted;
        }
      } catch (err) {
        if (err?.status && err.status !== 404) throw err;
      }
    }
    const userId = Session.getUserId();
    if (!userId) throw new Error('User not logged in');
    const patch =
      field === 'allergies'
        ? { allergies: null }
        : field === 'medical_history'
          ? { medical_history: null }
          : { blood_type: null, allergies: null, medical_history: null };

    const { data: prevProfile } = await supabase
      .from('profiles')
      .select('blood_type, allergies, medical_history')
      .eq('id', userId)
      .maybeSingle();

    const { data, error } = await supabase
      .from('profiles')
      .update(patch)
      .eq('id', userId)
      .select('*')
      .single();
    if (error) throw error;

    if (Object.prototype.hasOwnProperty.call(patch, 'medical_history')) {
      const { error: syncError } = await supabase
        .from('patients')
        .update({ medical_history: null })
        .eq('profile_id', userId);
      if (syncError) {
        if (prevProfile) {
          try {
            await supabase.from('profiles').update(prevProfile).eq('id', userId);
          } catch { }
        }
        throw new Error(
          'Could not synchronize your medical record with linked clinics. No changes were saved. Please try again.'
        );
      }
    }

    const formatted = normalizeRowToUi(data);
    notifyProfileChanged(formatted);
    return formatted;
  },

  /**
   * Permanently deletes the signed-in patient's account after OTP verification.
   */
  async deleteAccount({ email, otpToken }) {
    const token = await Session.getAccessToken();
    const userId = Session.getUserId();

    if (token) {
      try {
        const res = await AuthAPI.deleteAccount(token, {
          email: (email || '').trim().toLowerCase(),
          otp_token: otpToken,
        });
        if (res?.deleted) {
          notifyProfileChanged(null);
          await Session.signOut();
          return { deleted: true };
        }
      } catch (err) {
        if (err.status === 401) throw err;
      }
    }

    // Fallback if local server wasn't restarted after OTP was already verified
    if (!userId) throw new Error('User not logged in');
    try {
      await supabase.from('patients').update({ profile_id: null }).eq('profile_id', userId);
    } catch { }
    await supabase.from('profiles').delete().eq('id', userId);
    notifyProfileChanged(null);
    await Session.signOut();
    return { deleted: true };
  },

  async signOut() {
    stopRealtimeProfileSync();
    notifyProfileChanged(null);
    return Session.signOut();
  },
};

export default ProfileAPI;
