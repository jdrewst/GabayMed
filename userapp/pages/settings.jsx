import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Switch, Linking,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  User, History, HelpCircle, LogOut, ChevronRight, ArrowLeft, Mail,
  Heart, Plus, Trash2, Camera, ShieldCheck, Droplets, AlertTriangle, Stethoscope, ImagePlus,
  Building2, MapPin, Bell, FileText, Lock, Globe, Sun, Moon, Type, Eye, Calendar, CreditCard, MessageCircle, Gift,
} from 'lucide-react-native';
import { AppHeader } from '../components/app-header';
import { PatientAvatar, AVATAR_PRESETS, resolveAvatarPreset } from '../components/patient-avatar';
import {
  DatePickerField, PrimaryButton, OutlineButton, ErrorBanner, Popup, OtpCodeInput,
} from '../components/auth/auth-ui';
import { TERMS_OF_SERVICE, PRIVACY_POLICY } from '../components/auth/legal';
import AuthAPI from '../services/authApi';
import ProfileAPI, {
  APP_LANGUAGES,
  THEME_MODES,
  TEXT_SIZES,
  getAppTranslations,
  getDisplayConfig,
} from '../services/profileApi';

const SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
const NAME_REGEX = /^\p{L}[\p{L}\p{M} .'-]*$/u;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Full Profile Screen (My Profile).
 * Can be opened from the top-left avatar on ANY tab (staying on that tab and returning on Back)
 * or from the Care Passport card inside Settings.
 */
export function ProfilePage({ onBack }) {
  const [profileData, setProfileData] = useState(() => ProfileAPI.getCachedProfile());
  const [saving, setSaving] = useState(false);

  // In-place editing per box (keeps the exact same card layout)
  const [editingPersonal, setEditingPersonal] = useState(false);
  const [editingMedical, setEditingMedical] = useState(false);
  const [draft, setDraft] = useState(null);
  const [errors, setErrors] = useState({});
  const [boxError, setBoxError] = useState('');

  // Email change OTP verification popup state
  const [emailOtpModal, setEmailOtpModal] = useState(false);
  const [pendingNewEmail, setPendingNewEmail] = useState('');
  const [maskedNewEmail, setMaskedNewEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [otpResendCooldown, setOtpResendCooldown] = useState(0);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);

  // Themed popups matching the rest of the app
  const [showAvatarModal, setShowAvatarModal] = useState(false);
  const [savedPopup, setSavedPopup] = useState(false);
  const [infoPopup, setInfoPopup] = useState(null);

  useEffect(() => {
    let mounted = true;
    ProfileAPI.getProfile()
      .then(data => {
        if (mounted && data) setProfileData(data);
      })
      .catch(() => {
        if (mounted && !ProfileAPI.getCachedProfile()) {
          setInfoPopup({
            icon: AlertTriangle,
            title: 'Unable to Load Profile',
            message: 'Could not load your profile details right now. Please try again.',
          });
        }
      });
    const unsub = ProfileAPI.subscribe(next => {
      if (mounted && next) setProfileData(next);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  // Countdown timer for Email OTP popup
  useEffect(() => {
    if (!emailOtpModal || (otpSecondsLeft <= 0 && otpResendCooldown <= 0)) return undefined;
    const timer = setInterval(() => {
      setOtpSecondsLeft(s => (s > 0 ? s - 1 : 0));
      setOtpResendCooldown(c => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [emailOtpModal, otpSecondsLeft, otpResendCooldown]);

  const buildDraftFromProfile = data => ({
    firstName: data.firstName || '',
    middleName: data.middleName || '',
    lastName: data.lastName || '',
    nameSuffix: data.nameSuffix || '',
    rawBirthdate: data.rawBirthdate || '',
    gender: data.gender && data.gender !== 'Not set' ? data.gender : '',
    mobileLocal: data.mobileLocal || '',
    email: data.email && data.email !== 'Not set' ? data.email : '',
    streetAddress: data.streetAddress || '',
    barangay: data.barangay || '',
    cityMunicipality: data.cityMunicipality || '',
    province: data.province || '',
    zipCode: data.zipCode || '',
    bloodType: data.bloodType && data.bloodType !== 'Not set' ? data.bloodType : '',
    allergiesList:
      Array.isArray(data.allergiesList) && data.allergiesList.length > 0
        ? [...data.allergiesList]
        : [''],
    medicalHistory:
      Array.isArray(data.medicalHistory) && data.medicalHistory.length > 0
        ? [...data.medicalHistory]
        : [''],
    avatar: data.avatar || '',
  });

  const startEditPersonal = () => {
    if (!profileData) return;
    setDraft(buildDraftFromProfile(profileData));
    setErrors({});
    setBoxError('');
    setEditingPersonal(true);
  };

  const startEditMedical = () => {
    if (!profileData) return;
    setDraft(buildDraftFromProfile(profileData));
    setErrors({});
    setBoxError('');
    setEditingMedical(true);
  };

  const setField = (key, value) => {
    setDraft(prev => ({ ...prev, [key]: value }));
    setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const validatePersonalDraft = f => {
    const e = {};
    const checkName = (key, label, req) => {
      const val = (f[key] || '').trim();
      if (!val) {
        if (req) e[key] = `${label} is required.`;
        return;
      }
      if (val.length > 50 || !NAME_REGEX.test(val)) {
        e[key] = `Enter a valid ${label.toLowerCase()}.`;
      }
    };
    checkName('firstName', 'First name', true);
    checkName('middleName', 'Middle name', false);
    checkName('lastName', 'Last name', true);

    if (!f.rawBirthdate) e.rawBirthdate = 'Please select your date of birth.';
    if (!f.gender) e.gender = 'Please select your gender.';
    if (!/^9\d{9}$/.test(f.mobileLocal)) {
      e.mobileLocal = 'Enter your 10-digit mobile number starting with 9.';
    }
    const emailTrimmed = (f.email || '').trim().toLowerCase();
    if (!emailTrimmed || !EMAIL_REGEX.test(emailTrimmed) || emailTrimmed.length > 254) {
      e.email = 'Enter a valid email address.';
    }
    if (!(f.cityMunicipality || '').trim()) {
      e.cityMunicipality = 'City or municipality is required.';
    }
    if (!(f.province || '').trim()) {
      e.province = 'Province is required.';
    }
    if ((f.zipCode || '').trim() && !/^\d{4}$/.test(f.zipCode.trim())) {
      e.zipCode = 'Enter a 4-digit ZIP code.';
    }
    return e;
  };

  const handleSavePersonalBox = async () => {
    if (!draft) return;
    const foundErrors = validatePersonalDraft(draft);
    setErrors(foundErrors);
    setBoxError('');
    if (Object.keys(foundErrors).length > 0) {
      setBoxError(Object.values(foundErrors)[0]);
      return;
    }

    const nextEmail = (draft.email || '').trim().toLowerCase();
    const currentEmail =
      profileData?.email && profileData.email !== 'Not set'
        ? profileData.email.trim().toLowerCase()
        : '';

    // If the user changed their email, require Email OTP verification via popup first
    if (nextEmail && nextEmail !== currentEmail) {
      setSaving(true);
      try {
        const otpRes = await AuthAPI.sendOtp({
          purpose: 'register',
          context: 'email_change',
          email: nextEmail,
        });
        setPendingNewEmail(nextEmail);
        setMaskedNewEmail(otpRes.masked_email || nextEmail);
        setOtpCode('');
        setOtpError('');
        setOtpSecondsLeft(otpRes.expires_in || 300);
        setOtpResendCooldown(otpRes.resend_after || 60);
        setEmailOtpModal(true);
      } catch (err) {
        setBoxError(err.message || 'Could not send verification code to that email address.');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Otherwise save Personal & Demographics directly
    setSaving(true);
    try {
      const updated = await ProfileAPI.updateProfile({
        ...draft,
        allergiesList: profileData?.allergiesList || [],
        medicalHistory: profileData?.medicalHistory || [],
        bloodType: profileData?.bloodType !== 'Not set' ? profileData?.bloodType : '',
      });
      setProfileData(updated);
      setEditingPersonal(false);
      setSavedPopup(true);
    } catch (err) {
      if (err.fields) setErrors(err.fields);
      setBoxError(err.message || 'Could not save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleResendEmailOtp = async () => {
    if (!pendingNewEmail || otpSending) return;
    setOtpSending(true);
    setOtpError('');
    try {
      const res = await AuthAPI.sendOtp({
        purpose: 'register',
        context: 'email_change',
        email: pendingNewEmail,
      });
      setOtpCode('');
      setOtpSecondsLeft(res.expires_in || 300);
      setOtpResendCooldown(res.resend_after || 60);
    } catch (err) {
      setOtpError(err.message || 'Could not resend OTP code.');
    } finally {
      setOtpSending(false);
    }
  };

  const handleVerifyAndSaveEmail = async () => {
    const cleanCode = String(otpCode || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (cleanCode.length !== 6) {
      setOtpError('Enter the 6-character code sent to your new email.');
      return;
    }
    setOtpVerifying(true);
    setOtpError('');
    try {
      const verified = await AuthAPI.verifyOtp({
        purpose: 'register',
        email: pendingNewEmail,
        code: cleanCode,
      });
      const updated = await ProfileAPI.updateProfile({
        ...draft,
        newEmail: pendingNewEmail,
        otpToken: verified.otp_token,
        allergiesList: profileData?.allergiesList || [],
        medicalHistory: profileData?.medicalHistory || [],
        bloodType: profileData?.bloodType !== 'Not set' ? profileData?.bloodType : '',
      });
      setEmailOtpModal(false);
      setProfileData(updated);
      setEditingPersonal(false);
      setSavedPopup(true);
    } catch (err) {
      setOtpError(err.message || 'Invalid verification code.');
    } finally {
      setOtpVerifying(false);
    }
  };

  const handleSaveMedicalBox = async () => {
    if (!draft) return;
    setBoxError('');
    setSaving(true);
    try {
      const cleanedAllergies = (draft.allergiesList || [])
        .map(s => String(s || '').trim())
        .filter(Boolean);
      const cleanedHistory = (draft.medicalHistory || [])
        .map(s => String(s || '').trim())
        .filter(Boolean);

      const updated = await ProfileAPI.updateMedicalRecords({
        bloodType: draft.bloodType,
        allergiesList: cleanedAllergies,
        medicalHistory: cleanedHistory,
      });
      setProfileData(updated);
      setEditingMedical(false);
      setSavedPopup(true);
    } catch (err) {
      setBoxError(err.message || 'Could not save medical records.');
    } finally {
      setSaving(false);
    }
  };

  const handlePickCustomPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setShowAvatarModal(false);
        setInfoPopup({
          icon: AlertTriangle,
          title: 'Permission Needed',
          message: 'Please allow photo library access in your phone settings to upload a profile picture.',
        });
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.3,
        base64: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const mime = asset.mimeType || 'image/jpeg';
      const dataUri = asset.base64 ? `data:${mime};base64,${asset.base64}` : asset.uri;
      await handleSelectAvatarPreset(dataUri);
    } catch {
      setInfoPopup({
        icon: AlertTriangle,
        title: 'Upload Failed',
        message: 'Could not select that image. Please try another photo.',
      });
    }
  };

  const handleSelectAvatarPreset = async avatarValue => {
    setShowAvatarModal(false);
    if (!profileData) return;
    setProfileData(prev => (prev ? { ...prev, avatar: avatarValue } : prev));
    setSaving(true);
    try {
      const updated = await ProfileAPI.updateAvatar(avatarValue);
      setProfileData(updated);
      setSavedPopup(true);
    } catch (err) {
      setInfoPopup({
        icon: AlertTriangle,
        title: 'Could Not Save Photo',
        message: err.message || 'Make sure security/patient-accounts.sql has been run in Supabase.',
      });
    } finally {
      setSaving(false);
    }
  };

  const updateListField = (listKey, index, value) => {
    setDraft(prev => ({
      ...prev,
      [listKey]: prev[listKey].map((item, idx) => (idx === index ? value : item)),
    }));
  };

  const addListField = listKey => {
    setDraft(prev => ({
      ...prev,
      [listKey]: [...(prev[listKey] || []), ''],
    }));
  };

  const removeListField = (listKey, index) => {
    setDraft(prev => {
      const filtered = (prev[listKey] || []).filter((_, idx) => idx !== index);
      return {
        ...prev,
        [listKey]: filtered.length > 0 ? filtered : [''],
      };
    });
  };

  const activeAvatarPreset = resolveAvatarPreset(profileData?.avatar, profileData?.gender);

  return (
    <View style={styles.profileScreen}>
      {/* Top Bar: Back button on left, My Profile title on top right */}
      <View style={styles.topNav}>
        <TouchableOpacity onPress={onBack} style={styles.navPillBtn}>
          <ArrowLeft size={18} color="#1e293b" />
          <Text style={styles.navPillText}>Back</Text>
        </TouchableOpacity>

        <Text style={styles.topRightProfileTitle}>My Profile</Text>
      </View>

      {!profileData ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0ea5e9" />
          <Text style={styles.loadingText}>Loading your profile...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.profileScroll}
          contentContainerStyle={{ paddingBottom: 110 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero Header: Avatar on top + Full Name below */}
          <View style={styles.heroCard}>
            <View style={styles.avatarBlobStage}>
              <PatientAvatar
                avatar={profileData.avatar}
                gender={profileData.gender}
                size={136}
                showBlob
              />
              <TouchableOpacity
                style={styles.paletteFab}
                onPress={() => setShowAvatarModal(true)}
                accessibilityLabel="Change profile photo or character"
              >
                <Camera size={17} color="#0284c7" />
              </TouchableOpacity>
            </View>

            <Text style={styles.heroBigName}>{profileData.name}</Text>
          </View>

          {/* BOX 1: Personal & Demographics — Pure text cells (no field icons) */}
          <View style={styles.bentoCard}>
            <View style={styles.bentoHeader}>
              <View style={styles.bentoTitleRow}>
                <View style={[styles.bentoIconBadge, { backgroundColor: '#E0F2FE' }]}>
                  <User size={18} color="#0284C7" />
                </View>
                <View>
                  <Text style={styles.bentoKicker}>about you</Text>
                  <Text style={styles.bentoTitle}>Personal & Demographics</Text>
                </View>
              </View>
              {!editingPersonal && (
                <TouchableOpacity onPress={startEditPersonal} hitSlop={8}>
                  <Text style={styles.cardActionLink}>Update</Text>
                </TouchableOpacity>
              )}
            </View>

            {editingPersonal && <ErrorBanner message={boxError} />}

            <View style={styles.infoGrid}>
              {/* Row 1: First Name & Middle Name */}
              <View style={styles.twoColRow}>
                <View style={[styles.infoItem, { flex: 1 }, editingPersonal && styles.infoItemEditable]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>
                      First Name{editingPersonal && <Text style={styles.reqStar}> *</Text>}
                    </Text>
                    {editingPersonal ? (
                      <TextInput
                        style={styles.cellInput}
                        value={draft?.firstName}
                        onChangeText={v => setField('firstName', v)}
                        placeholder="First name"
                        placeholderTextColor="#94A3B8"
                        multiline
                      />
                    ) : (
                      <Text style={styles.infoValue}>{profileData.firstName || 'Not set'}</Text>
                    )}
                  </View>
                </View>

                <View style={[styles.infoItem, { flex: 1 }, editingPersonal && styles.infoItemEditable]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Middle Name</Text>
                    {editingPersonal ? (
                      <TextInput
                        style={styles.cellInput}
                        value={draft?.middleName}
                        onChangeText={v => setField('middleName', v)}
                        placeholder="Optional"
                        placeholderTextColor="#94A3B8"
                        multiline
                      />
                    ) : (
                      <Text style={styles.infoValue}>{profileData.middleName || '—'}</Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Row 2: Last Name & Suffix / Extension */}
              <View style={styles.twoColRow}>
                <View style={[styles.infoItem, { flex: 1 }, editingPersonal && styles.infoItemEditable]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>
                      Last Name{editingPersonal && <Text style={styles.reqStar}> *</Text>}
                    </Text>
                    {editingPersonal ? (
                      <TextInput
                        style={styles.cellInput}
                        value={draft?.lastName}
                        onChangeText={v => setField('lastName', v)}
                        placeholder="Last name"
                        placeholderTextColor="#94A3B8"
                        multiline
                      />
                    ) : (
                      <Text style={styles.infoValue}>{profileData.lastName || 'Not set'}</Text>
                    )}
                  </View>
                </View>

                <View style={[styles.infoItem, { flex: 1 }, editingPersonal && styles.infoItemEditable]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Suffix / Extension</Text>
                    {editingPersonal ? (
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginTop: 4 }}>
                        {['', ...SUFFIXES].map(sfx => {
                          const active = draft?.nameSuffix === sfx;
                          return (
                            <TouchableOpacity
                              key={sfx || 'none'}
                              onPress={() => setField('nameSuffix', sfx)}
                              style={[styles.miniChip, active && styles.miniChipActive]}
                            >
                              <Text style={[styles.miniChipText, active && styles.miniChipTextActive]}>
                                {sfx || 'None'}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    ) : (
                      <Text style={styles.infoValue}>{profileData.nameSuffix || 'None'}</Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Row 3: Birthdate & Gender (No icon on field) */}
              <View style={styles.twoColRow}>
                <View style={[styles.infoItem, { flex: 1 }, editingPersonal && styles.infoItemEditable]}>
                  <View style={{ flex: 1 }}>
                    {editingPersonal ? (
                      <DatePickerField
                        label="Birthdate"
                        required
                        value={draft?.rawBirthdate}
                        onChange={v => setField('rawBirthdate', v)}
                        style={{ marginBottom: 0 }}
                      />
                    ) : (
                      <>
                        <Text style={styles.infoLabel}>Birthdate & Age</Text>
                        <Text style={styles.infoValue}>
                          {profileData.birthdate}
                          {profileData.age !== 'N/A' ? ` (${profileData.age} yrs)` : ''}
                        </Text>
                      </>
                    )}
                  </View>
                </View>

                <View style={[styles.infoItem, { flex: 1 }, editingPersonal && styles.infoItemEditable]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>
                      Gender{editingPersonal && <Text style={styles.reqStar}> *</Text>}
                    </Text>
                    {editingPersonal ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {GENDERS.map(g => {
                          const active = draft?.gender === g;
                          return (
                            <TouchableOpacity
                              key={g}
                              onPress={() => setField('gender', g)}
                              style={[styles.miniChip, active && styles.miniChipActive]}
                            >
                              <Text style={[styles.miniChipText, active && styles.miniChipTextActive]}>
                                {g}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ) : (
                      <Text style={styles.infoValue}>{profileData.gender}</Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Row 4: Mobile Number (No icon on field) */}
              <View style={[styles.infoItem, editingPersonal && styles.infoItemEditable]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>
                    Mobile Number{editingPersonal && <Text style={styles.reqStar}> *</Text>}
                  </Text>
                  {editingPersonal ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={{ fontSize: 13.5, fontWeight: '700', color: '#475569' }}>+63</Text>
                      <TextInput
                        style={[styles.cellInput, { flex: 1 }]}
                        value={draft?.mobileLocal}
                        onChangeText={v =>
                          setField('mobileLocal', v.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10))
                        }
                        keyboardType="phone-pad"
                        placeholder="9XX XXX XXXX"
                        placeholderTextColor="#94A3B8"
                      />
                    </View>
                  ) : (
                    <Text style={styles.infoValue}>{profileData.phone}</Text>
                  )}
                </View>
              </View>

              {/* Row 5: Registered Email (Editable with OTP Verification Popup when changed, no icon) */}
              <View style={[styles.infoItem, editingPersonal && styles.infoItemEditable]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>
                    Registered Email{editingPersonal && <Text style={styles.reqStar}> *</Text>}
                  </Text>
                  {editingPersonal ? (
                    <>
                      <TextInput
                        style={styles.cellInput}
                        value={draft?.email}
                        onChangeText={v => setField('email', v)}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholder="name@example.com"
                        placeholderTextColor="#94A3B8"
                        multiline
                      />
                      <Text style={styles.emailHintText}>
                        Changing your email will send a 6-character OTP for verification.
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.infoValue}>{profileData.email}</Text>
                  )}
                </View>
              </View>

              {/* Row 6: Street Address & Barangay */}
              <View style={styles.twoColRow}>
                <View style={[styles.infoItem, { flex: 1 }, editingPersonal && styles.infoItemEditable]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Street Address</Text>
                    {editingPersonal ? (
                      <TextInput
                        style={styles.cellInput}
                        value={draft?.streetAddress}
                        onChangeText={v => setField('streetAddress', v)}
                        placeholder="House No., Street"
                        placeholderTextColor="#94A3B8"
                        multiline
                      />
                    ) : (
                      <Text style={styles.infoValue}>{profileData.streetAddress || '—'}</Text>
                    )}
                  </View>
                </View>

                <View style={[styles.infoItem, { flex: 1 }, editingPersonal && styles.infoItemEditable]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>Barangay</Text>
                    {editingPersonal ? (
                      <TextInput
                        style={styles.cellInput}
                        value={draft?.barangay}
                        onChangeText={v => setField('barangay', v)}
                        placeholder="Barangay"
                        placeholderTextColor="#94A3B8"
                        multiline
                      />
                    ) : (
                      <Text style={styles.infoValue}>{profileData.barangay || '—'}</Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Row 7: City / Municipality & Province (Separated from ZIP Code) */}
              <View style={styles.twoColRow}>
                <View style={[styles.infoItem, { flex: 1 }, editingPersonal && styles.infoItemEditable]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>
                      City / Municipality{editingPersonal && <Text style={styles.reqStar}> *</Text>}
                    </Text>
                    {editingPersonal ? (
                      <TextInput
                        style={styles.cellInput}
                        value={draft?.cityMunicipality}
                        onChangeText={v => setField('cityMunicipality', v)}
                        placeholder="e.g. Quezon City"
                        placeholderTextColor="#94A3B8"
                        multiline
                      />
                    ) : (
                      <Text style={styles.infoValue}>{profileData.cityMunicipality || '—'}</Text>
                    )}
                  </View>
                </View>

                <View style={[styles.infoItem, { flex: 1 }, editingPersonal && styles.infoItemEditable]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.infoLabel}>
                      Province{editingPersonal && <Text style={styles.reqStar}> *</Text>}
                    </Text>
                    {editingPersonal ? (
                      <TextInput
                        style={styles.cellInput}
                        value={draft?.province}
                        onChangeText={v => setField('province', v)}
                        placeholder="Province"
                        placeholderTextColor="#94A3B8"
                        multiline
                      />
                    ) : (
                      <Text style={styles.infoValue}>{profileData.province || '—'}</Text>
                    )}
                  </View>
                </View>
              </View>

              {/* Row 8: ZIP Code (Separate box) */}
              <View style={[styles.infoItem, editingPersonal && styles.infoItemEditable]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>ZIP Code</Text>
                  {editingPersonal ? (
                    <TextInput
                      style={styles.cellInput}
                      value={draft?.zipCode}
                      onChangeText={v => setField('zipCode', v.replace(/\D/g, '').slice(0, 4))}
                      placeholder="4-digit ZIP code"
                      keyboardType="number-pad"
                      maxLength={4}
                      placeholderTextColor="#94A3B8"
                    />
                  ) : (
                    <Text style={styles.infoValue}>{profileData.zipCode || '—'}</Text>
                  )}
                </View>
              </View>
            </View>

            {editingPersonal && (
              <View style={styles.inlineActionRow}>
                <OutlineButton
                  title="Cancel"
                  onPress={() => {
                    setEditingPersonal(false);
                    setBoxError('');
                  }}
                  disabled={saving}
                  style={{ flex: 1, height: 44 }}
                />
                <PrimaryButton
                  title={saving ? 'Saving...' : 'Save'}
                  onPress={handleSavePersonalBox}
                  loading={saving}
                  style={{ flex: 1 }}
                />
              </View>
            )}
          </View>

          {/* BOX 2: Medical Records — Clean View Mode & Per-Item Fields on Update */}
          <View style={styles.bentoCard}>
            <View style={styles.bentoHeader}>
              <View style={styles.bentoTitleRow}>
                <View style={[styles.bentoIconBadge, { backgroundColor: '#FEE2E2' }]}>
                  <Heart size={18} color="#EF4444" />
                </View>
                <View>
                  <Text style={styles.bentoKicker}>health snapshot</Text>
                  <Text style={styles.bentoTitle}>Medical Records</Text>
                </View>
              </View>
              {!editingMedical && (
                <TouchableOpacity onPress={startEditMedical} hitSlop={8}>
                  <Text style={styles.cardActionLink}>Update</Text>
                </TouchableOpacity>
              )}
            </View>

            {editingMedical && <ErrorBanner message={boxError} />}

            {/* Blood Type Cell */}
            <View style={[styles.infoItem, { marginBottom: 12 }, editingMedical && styles.infoItemEditable]}>
              <View style={[styles.infoIconCircle, { backgroundColor: '#FEE2E2' }]}>
                <Droplets size={16} color="#EF4444" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.infoLabel}>Blood Type</Text>
                {editingMedical ? (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {BLOOD_TYPES.map(bt => {
                      const active = draft?.bloodType === bt;
                      return (
                        <TouchableOpacity
                          key={bt}
                          onPress={() => setField('bloodType', active ? '' : bt)}
                          style={[styles.miniChip, active && styles.miniChipActive]}
                        >
                          <Text style={[styles.miniChipText, active && styles.miniChipTextActive]}>
                            {bt}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={styles.infoValue}>{profileData.bloodType}</Text>
                )}
              </View>
            </View>

            {/* Known Allergies Sub-Card */}
            <View style={[styles.subCard, editingMedical && styles.infoItemEditable]}>
              <View style={styles.subCardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <AlertTriangle size={15} color="#F59E0B" />
                  <Text style={styles.subCardTitle}>Known Allergies</Text>
                </View>
                {editingMedical && (
                  <TouchableOpacity
                    style={styles.addChipBtn}
                    onPress={() => addListField('allergiesList')}
                  >
                    <Plus size={13} color="#0284C7" />
                    <Text style={styles.addChipBtnText}>Add Allergy</Text>
                  </TouchableOpacity>
                )}
              </View>

              {editingMedical ? (
                <View style={{ gap: 8 }}>
                  {(draft?.allergiesList || ['']).map((item, index) => (
                    <View key={`allergy-${index}`} style={styles.perItemInputRow}>
                      <TextInput
                        style={styles.perItemInput}
                        value={item}
                        onChangeText={text => updateListField('allergiesList', index, text)}
                        placeholder={`Allergy #${index + 1} (e.g. Penicillin, Peanuts)`}
                        placeholderTextColor="#94A3B8"
                        multiline
                      />
                      <TouchableOpacity
                        onPress={() => removeListField('allergiesList', index)}
                        style={styles.removeRowBtn}
                        hitSlop={8}
                      >
                        <Trash2 size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : profileData.allergiesList?.length > 0 ? (
                <View style={styles.tagWrap}>
                  {profileData.allergiesList.map((item, idx) => (
                    <View key={`${item}-${idx}`} style={styles.allergyTag}>
                      <Text style={styles.allergyTagText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyTagText}>No known allergies recorded.</Text>
              )}
            </View>

            {/* Medical History & Conditions Sub-Card */}
            <View style={[styles.subCard, { marginTop: 12 }, editingMedical && styles.infoItemEditable]}>
              <View style={styles.subCardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Stethoscope size={15} color="#0284C7" />
                  <Text style={styles.subCardTitle}>Medical History & Conditions</Text>
                </View>
                {editingMedical && (
                  <TouchableOpacity
                    style={styles.addChipBtn}
                    onPress={() => addListField('medicalHistory')}
                  >
                    <Plus size={13} color="#0284C7" />
                    <Text style={styles.addChipBtnText}>Add Condition</Text>
                  </TouchableOpacity>
                )}
              </View>

              {editingMedical ? (
                <View style={{ gap: 8 }}>
                  {(draft?.medicalHistory || ['']).map((item, index) => (
                    <View key={`history-${index}`} style={styles.perItemInputRow}>
                      <TextInput
                        style={styles.perItemInput}
                        value={item}
                        onChangeText={text => updateListField('medicalHistory', index, text)}
                        placeholder={`Condition #${index + 1} (e.g. Asthma, Hypertension)`}
                        placeholderTextColor="#94A3B8"
                        multiline
                      />
                      <TouchableOpacity
                        onPress={() => removeListField('medicalHistory', index)}
                        style={styles.removeRowBtn}
                        hitSlop={8}
                      >
                        <Trash2 size={15} color="#EF4444" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              ) : profileData.medicalHistory?.length > 0 ? (
                <View style={styles.tagWrap}>
                  {profileData.medicalHistory.map((item, idx) => (
                    <View key={`${item}-${idx}`} style={styles.conditionTag}>
                      <Text style={styles.conditionTagText}>{item}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.emptyTagText}>No medical conditions recorded yet.</Text>
              )}
            </View>

            {editingMedical && (
              <View style={styles.inlineActionRow}>
                <OutlineButton
                  title="Cancel"
                  onPress={() => {
                    setEditingMedical(false);
                    setBoxError('');
                  }}
                  disabled={saving}
                  style={{ flex: 1, height: 44 }}
                />
                <PrimaryButton
                  title={saving ? 'Saving...' : 'Save'}
                  onPress={handleSaveMedicalBox}
                  loading={saving}
                  style={{ flex: 1 }}
                />
              </View>
            )}
          </View>
        </ScrollView>
      )}

      {/* Email Change OTP Verification Popup */}
      <Popup
        visible={emailOtpModal}
        icon={Mail}
        title="Verify New Email"
        message={`Enter the 6-character verification code sent to ${maskedNewEmail || pendingNewEmail} to update your email address.`}
        actionLabel={otpVerifying ? 'Verifying...' : 'Verify & Save'}
        actionLoading={otpVerifying}
        onAction={handleVerifyAndSaveEmail}
        secondaryLabel="Cancel"
        onSecondary={() => setEmailOtpModal(false)}
        onRequestClose={() => setEmailOtpModal(false)}
      >
        <View style={{ marginTop: 10 }}>
          <OtpCodeInput
            value={otpCode}
            onChange={v => {
              setOtpCode(v);
              setOtpError('');
            }}
            error={otpError}
            secondsLeft={otpSecondsLeft}
            resendCooldown={otpResendCooldown}
            onResend={handleResendEmailOtp}
            resending={otpSending}
          />
        </View>
      </Popup>

      {/* Themed Popup for Choosing Profile Photo or Character Avatar */}
      <Popup
        visible={showAvatarModal}
        icon={Camera}
        title="Profile Picture & Avatar"
        message="Upload a photo from your device gallery or select a character style below."
        actionLabel="Use Default for My Gender"
        onAction={() => handleSelectAvatarPreset('')}
        secondaryLabel="Close"
        onSecondary={() => setShowAvatarModal(false)}
        onRequestClose={() => setShowAvatarModal(false)}
      >
        <View style={{ marginTop: 14 }}>
          <TouchableOpacity
            style={styles.uploadPhotoBtn}
            onPress={handlePickCustomPhoto}
            activeOpacity={0.85}
          >
            <ImagePlus size={18} color="#fff" />
            <Text style={styles.uploadPhotoBtnText}>Choose Photo from Gallery</Text>
          </TouchableOpacity>

          <View style={styles.avatarGrid}>
            {AVATAR_PRESETS.map(preset => {
              const selected =
                activeAvatarPreset === preset.id &&
                !/^data:image\/|^https?:\/\//i.test(profileData?.avatar || '');
              return (
                <TouchableOpacity
                  key={preset.id}
                  onPress={() => handleSelectAvatarPreset(preset.id)}
                  style={[styles.avatarGridItem, selected && styles.avatarGridItemActive]}
                >
                  <PatientAvatar avatar={preset.id} size={52} />
                  <Text
                    style={[
                      styles.avatarGridLabel,
                      selected && { color: '#0284C7', fontWeight: '700' },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </Popup>

      <Popup
        visible={savedPopup}
        icon={ShieldCheck}
        title="Profile Updated"
        message="Your records have been securely saved across GabayMed."
        actionLabel="Done"
        onAction={() => setSavedPopup(false)}
      />

      <Popup
        visible={!!infoPopup}
        icon={infoPopup?.icon || ShieldCheck}
        title={infoPopup?.title || ''}
        message={infoPopup?.message || ''}
        actionLabel="OK"
        onAction={() => setInfoPopup(null)}
      />
    </View>
  );
}

/**
 * Settings Tab Screen.
 * Shows the Care Passport summary card, Onboarding Permission Toggles,
 * Legal (Terms & Conditions, Privacy Policy), History, Help & Support, and Sign Out.
 */
export function SettingsPage({
  onOpenMfaSettings,
  onOpenMessages,
  onOpenNotifications,
  onOpenProfile,
  onSignOut,
}) {
  const cachedPerms = ProfileAPI.getCachedPermissions();
  const [profileData, setProfileData] = useState(() => ProfileAPI.getCachedProfile());
  const [insuranceConsent, setInsuranceConsent] = useState(
    cachedPerms ? !!cachedPerms.insuranceConsent : true
  );
  const [dataSharingConsent, setDataSharingConsent] = useState(
    cachedPerms ? !!cachedPerms.dataSharingConsent : true
  );
  const [locationAllowed, setLocationAllowed] = useState(
    cachedPerms ? !!cachedPerms.locationAllowed : false
  );
  const [notificationsAllowed, setNotificationsAllowed] = useState(
    cachedPerms ? !!cachedPerms.notificationsAllowed : true
  );

  // Granular notification category preferences
  const [notifyAppointments, setNotifyAppointments] = useState(
    cachedPerms && typeof cachedPerms.notifyAppointments === 'boolean'
      ? cachedPerms.notifyAppointments
      : true
  );
  const [notifyBilling, setNotifyBilling] = useState(
    cachedPerms && typeof cachedPerms.notifyBilling === 'boolean'
      ? cachedPerms.notifyBilling
      : true
  );
  const [notifyInsurance, setNotifyInsurance] = useState(
    cachedPerms && typeof cachedPerms.notifyInsurance === 'boolean'
      ? cachedPerms.notifyInsurance
      : true
  );
  const [notifyMessages, setNotifyMessages] = useState(
    cachedPerms && typeof cachedPerms.notifyMessages === 'boolean'
      ? cachedPerms.notifyMessages
      : true
  );
  const [notifyPromos, setNotifyPromos] = useState(
    cachedPerms && typeof cachedPerms.notifyPromos === 'boolean'
      ? cachedPerms.notifyPromos
      : true
  );

  // Application language & display preferences
  const [language, setLanguage] = useState(cachedPerms?.language || 'en');
  const [themeMode, setThemeMode] = useState(cachedPerms?.themeMode || 'light');
  const [textSize, setTextSize] = useState(cachedPerms?.textSize || 'medium');
  const [highContrast, setHighContrast] = useState(
    cachedPerms ? !!cachedPerms.highContrast : false
  );

  const [legalPopup, setLegalPopup] = useState(null); // 'terms' | 'privacy' | null
  const [infoPopup, setInfoPopup] = useState(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  // Delete Account + OTP Verification states
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [deleteOtpModal, setDeleteOtpModal] = useState(false);
  const [deleteTargetEmail, setDeleteTargetEmail] = useState('');
  const [deleteMaskedEmail, setDeleteMaskedEmail] = useState('');
  const [deleteOtpCode, setDeleteOtpCode] = useState('');
  const [deleteOtpError, setDeleteOtpError] = useState('');
  const [deleteOtpSecondsLeft, setDeleteOtpSecondsLeft] = useState(0);
  const [deleteOtpResendCooldown, setDeleteOtpResendCooldown] = useState(0);
  const [deleteOtpSending, setDeleteOtpSending] = useState(false);
  const [deleteOtpVerifying, setDeleteOtpVerifying] = useState(false);

  useEffect(() => {
    if (!deleteOtpModal || (deleteOtpSecondsLeft <= 0 && deleteOtpResendCooldown <= 0)) {
      return undefined;
    }
    const timer = setInterval(() => {
      setDeleteOtpSecondsLeft(s => (s > 0 ? s - 1 : 0));
      setDeleteOtpResendCooldown(c => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [deleteOtpModal, deleteOtpSecondsLeft, deleteOtpResendCooldown]);

  useEffect(() => {
    let mounted = true;
    ProfileAPI.getProfile()
      .then(data => {
        if (!mounted || !data) return;
        setProfileData(data);
      })
      .catch(() => {});

    const syncPermsState = perms => {
      if (!perms) return;
      setInsuranceConsent(!!perms.insuranceConsent);
      setDataSharingConsent(!!perms.dataSharingConsent);
      setLocationAllowed(!!perms.locationAllowed);
      setNotificationsAllowed(!!perms.notificationsAllowed);
      if (typeof perms.notifyAppointments === 'boolean') setNotifyAppointments(perms.notifyAppointments);
      if (typeof perms.notifyBilling === 'boolean') setNotifyBilling(perms.notifyBilling);
      if (typeof perms.notifyInsurance === 'boolean') setNotifyInsurance(perms.notifyInsurance);
      if (typeof perms.notifyMessages === 'boolean') setNotifyMessages(perms.notifyMessages);
      if (typeof perms.notifyPromos === 'boolean') setNotifyPromos(perms.notifyPromos);
      if (perms.language) setLanguage(perms.language);
      if (perms.themeMode) setThemeMode(perms.themeMode);
      if (perms.textSize) setTextSize(perms.textSize);
      if (typeof perms.highContrast === 'boolean') setHighContrast(perms.highContrast);
    };

    ProfileAPI.getPermissions()
      .then(perms => {
        if (!mounted || !perms) return;
        syncPermsState(perms);
      })
      .catch(() => {});

    const unsubProfile = ProfileAPI.subscribe(next => {
      if (mounted && next) {
        setProfileData(next);
      }
    });

    const unsubPerms = ProfileAPI.subscribePermissions(perms => {
      if (mounted && perms) {
        syncPermsState(perms);
      }
    });

    return () => {
      mounted = false;
      unsubProfile();
      unsubPerms();
    };
  }, []);

  const handleToggleInsurance = async nextVal => {
    setInsuranceConsent(nextVal);
    await ProfileAPI.setPermissions({ insuranceConsent: nextVal });
  };

  const handleToggleDataSharing = async nextVal => {
    setDataSharingConsent(nextVal);
    await ProfileAPI.setPermissions({ dataSharingConsent: nextVal });
  };

  const handleToggleLocation = async nextVal => {
    if (!nextVal) {
      // Turn OFF location access inside GabayMed immediately without redirecting to OS settings
      setLocationAllowed(false);
      await ProfileAPI.setPermissions({ locationAllowed: false });
      return;
    }

    // Turning ON location access: verify/request foreground permission
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status === 'granted') {
        setLocationAllowed(true);
        await ProfileAPI.setPermissions({ locationAllowed: true });
      } else {
        setLocationAllowed(false);
        await ProfileAPI.setPermissions({ locationAllowed: false });
        setInfoPopup({
          icon: MapPin,
          title: 'Location Permission Needed',
          message: 'Please allow location access for GabayMed in your phone settings to find nearby hospitals.',
          openDeviceSettings: true,
        });
      }
    } catch {
      setLocationAllowed(false);
    }
  };

  const handleToggleNotifications = async nextVal => {
    setNotificationsAllowed(nextVal);
    await ProfileAPI.setPermissions({ notificationsAllowed: nextVal });
  };

  const handleToggleSpecificNotification = async (key, nextVal) => {
    const patch = { [key]: nextVal };
    if (nextVal && !notificationsAllowed) {
      setNotificationsAllowed(true);
      patch.notificationsAllowed = true;
    }
    if (key === 'notifyAppointments') setNotifyAppointments(nextVal);
    if (key === 'notifyBilling') setNotifyBilling(nextVal);
    if (key === 'notifyInsurance') setNotifyInsurance(nextVal);
    if (key === 'notifyMessages') setNotifyMessages(nextVal);
    if (key === 'notifyPromos') setNotifyPromos(nextVal);
    await ProfileAPI.setPermissions(patch);
  };

  const handleSelectLanguage = async nextLang => {
    setLanguage(nextLang);
    await ProfileAPI.setPermissions({ language: nextLang });
  };

  const handleSelectThemeMode = async nextTheme => {
    setThemeMode(nextTheme);
    await ProfileAPI.setPermissions({ themeMode: nextTheme });
  };

  const handleSelectTextSize = async nextSize => {
    setTextSize(nextSize);
    await ProfileAPI.setPermissions({ textSize: nextSize });
  };

  const handleToggleHighContrast = async nextVal => {
    setHighContrast(nextVal);
    await ProfileAPI.setPermissions({ highContrast: nextVal });
  };

  const handleHistory = () => {
    setInfoPopup({
      icon: History,
      title: 'Medical History',
      message: 'Your consultation and appointment history is available in the Cases & Facilities tabs.',
    });
  };

  const handleHelp = () => {
    setInfoPopup({
      icon: HelpCircle,
      title: 'Help & Support',
      message: 'Need assistance? Reach out to our team at g1.gabaymed@gmail.com or call +63 2 1234 5678.',
    });
  };

  const confirmAndSignOut = async () => {
    setConfirmSignOut(false);
    try {
      await ProfileAPI.signOut();
      if (onSignOut) onSignOut();
    } catch {
      setInfoPopup({
        icon: AlertTriangle,
        title: 'Sign Out Failed',
        message: 'Could not sign out right now. Please try again.',
      });
    }
  };

  const handleStartDeleteAccountOtp = async () => {
    const email =
      profileData?.email && profileData.email !== 'Not set'
        ? profileData.email.trim().toLowerCase()
        : '';
    if (!email) {
      setConfirmDeleteAccount(false);
      setInfoPopup({
        icon: AlertTriangle,
        title: 'Email Required',
        message: 'No registered email was found on your profile to receive the verification OTP.',
      });
      return;
    }

    setDeleteOtpSending(true);
    try {
      const otpRes = await AuthAPI.sendOtp({
        purpose: 'register',
        context: 'delete_account',
        email,
      });
      setConfirmDeleteAccount(false);
      setDeleteTargetEmail(email);
      setDeleteMaskedEmail(otpRes.masked_email || email);
      setDeleteOtpCode('');
      setDeleteOtpError('');
      setDeleteOtpSecondsLeft(otpRes.expires_in || 300);
      setDeleteOtpResendCooldown(otpRes.resend_after || 60);
      setDeleteOtpModal(true);
    } catch (err) {
      setConfirmDeleteAccount(false);
      setInfoPopup({
        icon: AlertTriangle,
        title: 'Could Not Send OTP',
        message: err.message || 'Could not send the verification code right now. Please try again.',
      });
    } finally {
      setDeleteOtpSending(false);
    }
  };

  const handleResendDeleteOtp = async () => {
    if (!deleteTargetEmail || deleteOtpSending) return;
    setDeleteOtpSending(true);
    setDeleteOtpError('');
    try {
      const res = await AuthAPI.sendOtp({
        purpose: 'register',
        context: 'delete_account',
        email: deleteTargetEmail,
      });
      setDeleteOtpCode('');
      setDeleteOtpSecondsLeft(res.expires_in || 300);
      setDeleteOtpResendCooldown(res.resend_after || 60);
    } catch (err) {
      setDeleteOtpError(err.message || 'Could not resend OTP code.');
    } finally {
      setDeleteOtpSending(false);
    }
  };

  const handleVerifyAndDeleteAccount = async () => {
    const cleanCode = String(deleteOtpCode || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (cleanCode.length !== 6) {
      setDeleteOtpError('Enter the 6-character code sent to your email.');
      return;
    }
    setDeleteOtpVerifying(true);
    setDeleteOtpError('');
    try {
      const verified = await AuthAPI.verifyOtp({
        purpose: 'register',
        email: deleteTargetEmail,
        code: cleanCode,
      });
      await ProfileAPI.deleteAccount({
        email: deleteTargetEmail,
        otpToken: verified.otp_token,
      });
      setDeleteOtpModal(false);
      if (onSignOut) onSignOut();
    } catch (err) {
      setDeleteOtpError(err.message || 'Invalid verification code.');
    } finally {
      setDeleteOtpVerifying(false);
    }
  };

  const t = getAppTranslations(language);
  const display = getDisplayConfig({ themeMode, textSize, highContrast });
  const fs = size => Math.round(size * display.fontScale * 10) / 10;

  const menuItems = [
    {
      id: 'terms',
      icon: FileText,
      label: t.terms,
      action: () => setLegalPopup('terms'),
    },
    {
      id: 'privacy',
      icon: Lock,
      label: t.privacy,
      action: () => setLegalPopup('privacy'),
    },
    {
      id: 'history',
      icon: History,
      label: t.history,
      action: handleHistory,
    },
    {
      id: 'help',
      icon: HelpCircle,
      label: t.help,
      action: handleHelp,
    },
    {
      id: 'delete_account',
      icon: Trash2,
      label: t.deleteAccount,
      dangerSoft: true,
      action: () => setConfirmDeleteAccount(true),
    },
    {
      id: 'signout',
      icon: LogOut,
      label: t.signOut,
      dangerStrong: true,
      action: () => setConfirmSignOut(true),
    },
  ];

  const notificationCategoryItems = [
    {
      key: 'notifyAppointments',
      icon: Calendar,
      title: t.notifyAppointmentsTitle,
      desc: t.notifyAppointmentsDesc,
      value: notifyAppointments,
    },
    {
      key: 'notifyBilling',
      icon: CreditCard,
      title: t.notifyBillingTitle,
      desc: t.notifyBillingDesc,
      value: notifyBilling,
    },
    {
      key: 'notifyInsurance',
      icon: ShieldCheck,
      title: t.notifyInsuranceTitle,
      desc: t.notifyInsuranceDesc,
      value: notifyInsurance,
    },
    {
      key: 'notifyMessages',
      icon: MessageCircle,
      title: t.notifyMessagesTitle,
      desc: t.notifyMessagesDesc,
      value: notifyMessages,
    },
    {
      key: 'notifyPromos',
      icon: Gift,
      title: t.notifyPromosTitle,
      desc: t.notifyPromosDesc,
      value: notifyPromos,
    },
  ];

  return (
    <View style={[styles.container, { backgroundColor: display.bg }]}>
      <AppHeader
        onOpenMessages={onOpenMessages}
        onOpenNotifications={onOpenNotifications}
        onOpenProfile={onOpenProfile}
      />

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 110 }}>
        <Text style={[styles.title, { color: display.textPrimary, fontSize: fs(20) }]}>
          {t.settingsTitle}
        </Text>

        {/* Profile Card */}
        <TouchableOpacity
          style={[
            styles.profileBannerCard,
            { backgroundColor: display.cardBg, borderColor: display.isDark ? display.border : '#e0f2fe' },
          ]}
          onPress={onOpenProfile}
          activeOpacity={0.85}
        >
          <PatientAvatar
            avatar={profileData?.avatar}
            gender={profileData?.gender}
            size={60}
            showBlob
          />
          <View style={{ flex: 1 }}>
            <Text
              style={[styles.bannerName, { color: display.textPrimary, fontSize: fs(17) }]}
              numberOfLines={1}
            >
              {profileData?.name || 'My Profile'}
            </Text>
            <Text
              style={[styles.bannerSub, { color: display.textSecondary, fontSize: fs(12) }]}
              numberOfLines={1}
            >
              {profileData?.email && profileData.email !== 'Not set'
                ? profileData.email
                : t.tapToViewProfile}
            </Text>
          </View>
          <ChevronRight size={20} color="#0ea5e9" />
        </TouchableOpacity>

        {/* 1. Language & Display Preferences */}
        <Text style={[styles.sectionHeader, { color: display.textSecondary, fontSize: fs(13) }]}>
          {t.appPreferencesHeader}
        </Text>
        <View
          style={[
            styles.permissionsCard,
            { backgroundColor: display.cardBg, borderColor: display.border },
          ]}
        >
          {/* Language Preference */}
          <View style={styles.prefBlock}>
            <View style={styles.permissionLeft}>
              <Globe size={20} color="#0ea5e9" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.permissionTitle, { color: display.textPrimary, fontSize: fs(15) }]}>
                  {t.languageTitle}
                </Text>
                <Text style={[styles.permissionDesc, { color: display.textSecondary, fontSize: fs(12) }]}>
                  {t.languageDesc}
                </Text>
              </View>
            </View>
            <View style={styles.segmentedRow}>
              {APP_LANGUAGES.map(lang => {
                const active = language === lang.id;
                return (
                  <TouchableOpacity
                    key={lang.id}
                    onPress={() => handleSelectLanguage(lang.id)}
                    style={[
                      styles.segmentChip,
                      { backgroundColor: display.subCardBg, borderColor: display.border },
                      active && styles.segmentChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentChipText,
                        { color: display.textSecondary, fontSize: fs(12.5) },
                        active && styles.segmentChipTextActive,
                      ]}
                    >
                      {lang.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.permissionDivider, { backgroundColor: display.divider }]} />

          {/* Theme / Appearance Preference */}
          <View style={styles.prefBlock}>
            <View style={styles.permissionLeft}>
              {display.isDark ? (
                <Moon size={20} color="#38bdf8" />
              ) : (
                <Sun size={20} color="#0ea5e9" />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.permissionTitle, { color: display.textPrimary, fontSize: fs(15) }]}>
                  {t.themeTitle}
                </Text>
                <Text style={[styles.permissionDesc, { color: display.textSecondary, fontSize: fs(12) }]}>
                  {t.themeDesc}
                </Text>
              </View>
            </View>
            <View style={styles.segmentedRow}>
              {THEME_MODES.map(mode => {
                const active = themeMode === mode.id;
                return (
                  <TouchableOpacity
                    key={mode.id}
                    onPress={() => handleSelectThemeMode(mode.id)}
                    style={[
                      styles.segmentChip,
                      { backgroundColor: display.subCardBg, borderColor: display.border },
                      active && styles.segmentChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentChipText,
                        { color: display.textSecondary, fontSize: fs(12.5) },
                        active && styles.segmentChipTextActive,
                      ]}
                    >
                      {mode.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.permissionDivider, { backgroundColor: display.divider }]} />

          {/* Text Size Preference */}
          <View style={styles.prefBlock}>
            <View style={styles.permissionLeft}>
              <Type size={20} color="#0ea5e9" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.permissionTitle, { color: display.textPrimary, fontSize: fs(15) }]}>
                  {t.textSizeTitle}
                </Text>
                <Text style={[styles.permissionDesc, { color: display.textSecondary, fontSize: fs(12) }]}>
                  {t.textSizeDesc}
                </Text>
              </View>
            </View>
            <View style={styles.segmentedRow}>
              {TEXT_SIZES.map(sz => {
                const active = textSize === sz.id;
                return (
                  <TouchableOpacity
                    key={sz.id}
                    onPress={() => handleSelectTextSize(sz.id)}
                    style={[
                      styles.segmentChip,
                      { backgroundColor: display.subCardBg, borderColor: display.border },
                      active && styles.segmentChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentChipText,
                        { color: display.textSecondary, fontSize: fs(12.5) },
                        active && styles.segmentChipTextActive,
                      ]}
                    >
                      {sz.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.permissionDivider, { backgroundColor: display.divider }]} />

          {/* High Contrast Display Toggle */}
          <View style={styles.permissionRow}>
            <View style={styles.permissionLeft}>
              <Eye size={20} color="#0ea5e9" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.permissionTitle, { color: display.textPrimary, fontSize: fs(15) }]}>
                  {t.highContrastTitle}
                </Text>
                <Text style={[styles.permissionDesc, { color: display.textSecondary, fontSize: fs(12) }]}>
                  {t.highContrastDesc}
                </Text>
              </View>
            </View>
            <Switch
              value={highContrast}
              onValueChange={handleToggleHighContrast}
              trackColor={{ false: '#E2E8F0', true: '#7DD3FC' }}
              thumbColor={highContrast ? '#0284C7' : '#94A3B8'}
            />
          </View>
        </View>

        {/* 2. Specific Notification Preferences */}
        <Text style={[styles.sectionHeader, { color: display.textSecondary, fontSize: fs(13) }]}>
          {t.notificationsHeader}
        </Text>
        <View
          style={[
            styles.permissionsCard,
            { backgroundColor: display.cardBg, borderColor: display.border },
          ]}
        >
          {/* Master Notifications Toggle */}
          <View style={styles.permissionRow}>
            <View style={styles.permissionLeft}>
              <Bell size={20} color="#0ea5e9" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.permissionTitle, { color: display.textPrimary, fontSize: fs(15) }]}>
                  {t.allNotificationsTitle}
                </Text>
                <Text style={[styles.permissionDesc, { color: display.textSecondary, fontSize: fs(12) }]}>
                  {t.allNotificationsDesc}
                </Text>
              </View>
            </View>
            <Switch
              value={notificationsAllowed}
              onValueChange={handleToggleNotifications}
              trackColor={{ false: '#E2E8F0', true: '#7DD3FC' }}
              thumbColor={notificationsAllowed ? '#0284C7' : '#94A3B8'}
            />
          </View>

          {/* Individual Notification Category Switches */}
          {notificationCategoryItems.map(cat => {
            const CatIcon = cat.icon;
            const effectiveEnabled = notificationsAllowed && cat.value;
            return (
              <React.Fragment key={cat.key}>
                <View style={[styles.permissionDivider, { backgroundColor: display.divider }]} />
                <View style={[styles.permissionRow, !notificationsAllowed && { opacity: 0.55 }]}>
                  <View style={styles.permissionLeft}>
                    <CatIcon size={19} color={effectiveEnabled ? '#0ea5e9' : '#94a3b8'} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.permissionTitle,
                          { color: display.textPrimary, fontSize: fs(14.5) },
                        ]}
                      >
                        {cat.title}
                      </Text>
                      <Text
                        style={[
                          styles.permissionDesc,
                          { color: display.textSecondary, fontSize: fs(12) },
                        ]}
                      >
                        {cat.desc}
                      </Text>
                    </View>
                  </View>
                  <Switch
                    value={effectiveEnabled}
                    onValueChange={val => handleToggleSpecificNotification(cat.key, val)}
                    trackColor={{ false: '#E2E8F0', true: '#7DD3FC' }}
                    thumbColor={effectiveEnabled ? '#0284C7' : '#94A3B8'}
                  />
                </View>
              </React.Fragment>
            );
          })}
        </View>

        {/* 3. Onboarding Permissions & Privacy Toggles */}
        <OutlineButton title="Password, app PIN and MFA" onPress={onOpenMfaSettings} style={{ marginBottom: 12 }} />
        <Text style={[styles.sectionHeader, { color: display.textSecondary, fontSize: fs(13) }]}>
          {t.permissionsHeader}
        </Text>
        <View
          style={[
            styles.permissionsCard,
            { backgroundColor: display.cardBg, borderColor: display.border },
          ]}
        >
          <View style={styles.permissionRow}>
            <View style={styles.permissionLeft}>
              <ShieldCheck size={20} color="#0ea5e9" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.permissionTitle, { color: display.textPrimary, fontSize: fs(15) }]}>
                  {t.insuranceConsentTitle}
                </Text>
                <Text style={[styles.permissionDesc, { color: display.textSecondary, fontSize: fs(12) }]}>
                  {t.insuranceConsentDesc}
                </Text>
              </View>
            </View>
            <Switch
              value={insuranceConsent}
              onValueChange={handleToggleInsurance}
              trackColor={{ false: '#E2E8F0', true: '#7DD3FC' }}
              thumbColor={insuranceConsent ? '#0284C7' : '#94A3B8'}
            />
          </View>

          <View style={[styles.permissionDivider, { backgroundColor: display.divider }]} />

          <View style={styles.permissionRow}>
            <View style={styles.permissionLeft}>
              <Building2 size={20} color="#0ea5e9" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.permissionTitle, { color: display.textPrimary, fontSize: fs(15) }]}>
                  {t.dataSharingTitle}
                </Text>
                <Text style={[styles.permissionDesc, { color: display.textSecondary, fontSize: fs(12) }]}>
                  {t.dataSharingDesc}
                </Text>
              </View>
            </View>
            <Switch
              value={dataSharingConsent}
              onValueChange={handleToggleDataSharing}
              trackColor={{ false: '#E2E8F0', true: '#7DD3FC' }}
              thumbColor={dataSharingConsent ? '#0284C7' : '#94A3B8'}
            />
          </View>

          <View style={[styles.permissionDivider, { backgroundColor: display.divider }]} />

          <View style={styles.permissionRow}>
            <View style={styles.permissionLeft}>
              <MapPin size={20} color="#0ea5e9" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.permissionTitle, { color: display.textPrimary, fontSize: fs(15) }]}>
                  {t.locationTitle}
                </Text>
                <Text style={[styles.permissionDesc, { color: display.textSecondary, fontSize: fs(12) }]}>
                  {t.locationDesc}
                </Text>
              </View>
            </View>
            <Switch
              value={locationAllowed}
              onValueChange={handleToggleLocation}
              trackColor={{ false: '#E2E8F0', true: '#7DD3FC' }}
              thumbColor={locationAllowed ? '#0284C7' : '#94A3B8'}
            />
          </View>
        </View>

        <Text style={[styles.sectionHeader, { color: display.textSecondary, fontSize: fs(13) }]}>
          {t.generalHeader}
        </Text>
        <View style={styles.menuList}>
          {menuItems.map(item => {
            const Icon = item.icon;
            const isStrongRed = !!item.dangerStrong;
            const isSoftRed = !!item.dangerSoft;
            return (
              <TouchableOpacity
                key={item.id}
                onPress={item.action}
                style={[
                  styles.menuItem,
                  isStrongRed
                    ? styles.menuItemDangerStrong
                    : isSoftRed
                      ? styles.menuItemDangerSoft
                      : [
                          styles.menuItemNormal,
                          { backgroundColor: display.cardBg, borderColor: display.border },
                        ],
                ]}
              >
                <View style={styles.menuItemLeft}>
                  <Icon
                    size={20}
                    color={isStrongRed ? '#ffffff' : isSoftRed ? '#e11d48' : '#0ea5e9'}
                  />
                  <Text
                    style={[
                      styles.menuItemLabel,
                      { color: display.textPrimary, fontSize: fs(16) },
                      isStrongRed && styles.menuItemLabelDangerStrong,
                      isSoftRed && styles.menuItemLabelDangerSoft,
                    ]}
                  >
                    {item.label}
                  </Text>
                </View>
                <ChevronRight
                  size={20}
                  color={isStrongRed ? '#fee2e2' : isSoftRed ? '#fda4af' : '#9ca3af'}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Terms & Conditions / Privacy Policy Popup */}
      <Popup
        visible={!!legalPopup}
        icon={legalPopup === 'privacy' ? Lock : FileText}
        title={legalPopup === 'privacy' ? 'Privacy Policy' : 'Terms & Conditions'}
        actionLabel="Close"
        onAction={() => setLegalPopup(null)}
        onRequestClose={() => setLegalPopup(null)}
      >
        <ScrollView style={styles.legalScrollBox} contentContainerStyle={{ padding: 14 }}>
          <Text style={styles.legalBodyText}>
            {legalPopup === 'privacy' ? PRIVACY_POLICY : TERMS_OF_SERVICE}
          </Text>
        </ScrollView>
      </Popup>

      {/* Themed Info Popup (History / Help & Support / OS Location Prompt) */}
      <Popup
        visible={!!infoPopup}
        icon={infoPopup?.icon || HelpCircle}
        title={infoPopup?.title || ''}
        message={infoPopup?.message || ''}
        actionLabel={infoPopup?.openDeviceSettings ? 'Open Phone Settings' : 'OK'}
        onAction={() => {
          const shouldOpen = infoPopup?.openDeviceSettings;
          setInfoPopup(null);
          if (shouldOpen) {
            Linking.openSettings?.();
          }
        }}
        secondaryLabel={infoPopup?.openDeviceSettings ? 'Cancel' : undefined}
        onSecondary={infoPopup?.openDeviceSettings ? () => setInfoPopup(null) : undefined}
        onRequestClose={() => setInfoPopup(null)}
      />

      {/* Themed Sign Out Confirmation Popup */}
      <Popup
        visible={confirmSignOut}
        icon={LogOut}
        iconColors={['#FCA5A5', '#EF4444']}
        title="Sign Out"
        message="Are you sure you want to sign out of your GabayMed account?"
        actionLabel="Sign Out"
        onAction={confirmAndSignOut}
        secondaryLabel="Cancel"
        onSecondary={() => setConfirmSignOut(false)}
        onRequestClose={() => setConfirmSignOut(false)}
      />

      {/* Step 1: Delete Account Confirmation Popup */}
      <Popup
        visible={confirmDeleteAccount}
        icon={Trash2}
        iconColors={['#FCA5A5', '#EF4444']}
        title="Delete Account"
        message={`Are you sure you want to permanently delete your GabayMed account? We will send a 6-character OTP to ${
          profileData?.email && profileData.email !== 'Not set' ? profileData.email : 'your registered email'
        } to confirm.`}
        actionLabel={deleteOtpSending ? 'Sending OTP...' : 'Send OTP Code'}
        actionLoading={deleteOtpSending}
        onAction={handleStartDeleteAccountOtp}
        secondaryLabel="Cancel"
        onSecondary={() => setConfirmDeleteAccount(false)}
        onRequestClose={() => setConfirmDeleteAccount(false)}
      />

      {/* Step 2: Delete Account OTP Verification Popup */}
      <Popup
        visible={deleteOtpModal}
        icon={Trash2}
        iconColors={['#FCA5A5', '#EF4444']}
        title="Confirm Account Deletion"
        message={`Enter the 6-character verification code sent to ${
          deleteMaskedEmail || deleteTargetEmail
        } to permanently delete your account.`}
        actionLabel={deleteOtpVerifying ? 'Deleting...' : 'Verify & Delete Account'}
        actionLoading={deleteOtpVerifying}
        onAction={handleVerifyAndDeleteAccount}
        secondaryLabel="Cancel"
        onSecondary={() => setDeleteOtpModal(false)}
        onRequestClose={() => setDeleteOtpModal(false)}
      >
        <View style={{ marginTop: 10 }}>
          <OtpCodeInput
            value={deleteOtpCode}
            onChange={v => {
              setDeleteOtpCode(v);
              setDeleteOtpError('');
            }}
            error={deleteOtpError}
            secondsLeft={deleteOtpSecondsLeft}
            resendCooldown={deleteOtpResendCooldown}
            onResend={handleResendDeleteOtp}
            resending={deleteOtpSending}
          />
        </View>
      </Popup>
    </View>
  );
}

const styles = StyleSheet.create({
  // Settings Tab styles
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 8,
    marginBottom: 10,
  },
  profileBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#e0f2fe',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  bannerKicker: { fontSize: 10, fontWeight: '800', color: '#0284c7', letterSpacing: 1 },
  bannerName: { fontSize: 17, fontWeight: 'bold', color: '#1f2937', marginTop: 2 },
  bannerSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  permissionsCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#f3f4f6',
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 16,
  },
  permissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 12,
  },
  permissionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  permissionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1f2937',
  },
  permissionDesc: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
    lineHeight: 16,
  },
  permissionDivider: {
    height: 1,
    backgroundColor: '#f3f4f6',
  },
  prefBlock: {
    paddingVertical: 12,
    gap: 10,
  },
  segmentedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
    paddingLeft: 32,
  },
  segmentChip: {
    flex: 1,
    minWidth: 84,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentChipActive: {
    borderColor: '#0ea5e9',
    backgroundColor: '#e0f2fe',
  },
  segmentChipText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748b',
  },
  segmentChipTextActive: {
    color: '#0284c7',
    fontWeight: '700',
  },
  menuList: {
    gap: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuItemNormal: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  menuItemDangerSoft: {
    backgroundColor: '#fff1f2',
    borderWidth: 1,
    borderColor: '#fecdd3',
  },
  menuItemDangerStrong: {
    backgroundColor: '#dc2626',
    borderWidth: 1,
    borderColor: '#b91c1c',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuItemLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1f2937',
  },
  menuItemLabelDangerSoft: {
    color: '#e11d48',
    fontWeight: '600',
  },
  menuItemLabelDangerStrong: {
    color: '#ffffff',
    fontWeight: '700',
  },
  legalScrollBox: {
    maxHeight: 280,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
  },
  legalBodyText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#6b7280',
  },

  // Profile Screen
  profileScreen: { flex: 1, backgroundColor: '#F8FAFC' },
  topNav: {
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  navPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  navPillText: { fontSize: 13.5, fontWeight: '700', color: '#1E293B' },
  topRightProfileTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0284C7',
  },
  profileScroll: { flex: 1, paddingHorizontal: 16 },
  heroCard: {
    backgroundColor: '#fff',
    borderRadius: 28,
    paddingVertical: 22,
    paddingHorizontal: 16,
    marginTop: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0F2FE',
    shadowColor: '#38BDF8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 4,
  },
  heroBigName: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.3,
    textAlign: 'center',
    marginTop: 12,
  },
  avatarBlobStage: {
    position: 'relative',
    marginVertical: 4,
  },
  paletteFab: {
    position: 'absolute',
    right: -2,
    bottom: 2,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  bentoCard: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  bentoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  bentoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bentoIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bentoKicker: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  bentoTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  cardActionLink: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0EA5E9',
  },
  inlineActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  infoGrid: {
    gap: 10,
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  infoItemEditable: {
    backgroundColor: '#FFFFFF',
    borderColor: '#7DD3FC',
    borderWidth: 1.5,
  },
  infoIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  reqStar: {
    color: '#DC2626',
    fontWeight: '700',
  },
  infoValue: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2,
  },
  cellInput: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0284C7',
    paddingVertical: 2,
    marginTop: 2,
    borderBottomWidth: 1,
    borderBottomColor: '#BAE6FD',
  },
  emailHintText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  miniChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  miniChipActive: {
    borderColor: '#0EA5E9',
    backgroundColor: '#E0F2FE',
  },
  miniChipText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  miniChipTextActive: {
    color: '#0284C7',
    fontWeight: '700',
  },
  subCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  subCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  subCardTitle: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  addChipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  addChipBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0284C7',
  },
  perItemInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  perItemInput: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  removeRowBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  allergyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  allergyTagText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400E',
  },
  conditionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  conditionTagText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0369A1',
  },
  emptyTagText: {
    fontSize: 12.5,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  uploadPhotoBtn: {
    backgroundColor: '#0EA5E9',
    height: 44,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 14,
  },
  uploadPhotoBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  avatarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  avatarGridItem: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  avatarGridItemActive: {
    borderColor: '#0EA5E9',
    backgroundColor: '#F0F9FF',
  },
  avatarGridLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
    marginTop: 4,
    textAlign: 'center',
  },
});
