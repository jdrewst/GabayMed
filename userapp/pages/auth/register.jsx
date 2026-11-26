import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ChevronLeft, User, Phone, KeyRound, FileText, ShieldCheck, ShieldAlert, Check, HeartPulse, MailCheck,
} from 'lucide-react-native';
import {
  TextField, DatePickerField, FieldLabel, PrimaryButton, ErrorBanner, Checkbox, Popup, OtpCodeInput, authText, COLORS,
} from '../../components/auth/auth-ui';
import { TERMS_OF_SERVICE, PRIVACY_POLICY } from '../../components/auth/legal';
import AuthAPI from '../../services/authApi';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME = /^\p{L}[\p{L}\p{M} .'-]*$/u;
const SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'V'];
const GENDERS = ['Male', 'Female', 'Other', 'Prefer not to say'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

const STEPS = [
  { title: 'Create your Account', icon: KeyRound },
  { title: 'Personal Details', icon: User },
  { title: 'Contact & Address', icon: Phone },
  { title: 'Medical Information', icon: HeartPulse },
  { title: 'OTP Verification', icon: MailCheck },
  { title: 'Terms of Service and Privacy Policy Notice', icon: FileText },
];

const FIELD_STEP = {
  email: 0, password: 0,
  first_name: 1, middle_name: 1, last_name: 1, name_suffix: 1, date_of_birth: 1, gender: 1,
  mobile_number: 2, street_address: 2, barangay: 2, city_municipality: 2, province: 2, zip_code: 2,
  blood_type: 3, allergies: 3, medical_history: 3,
  otp: 4,
  consent: 5,
};

// Mirrors the server policy in server/lib/patient-auth.js.
const PASSWORD_RULES = [
  { label: '12 to 128 characters', test: p => p.length >= 12 && p.length <= 128 },
  { label: 'Uppercase and lowercase letters', test: p => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'At least one number', test: p => /\d/.test(p) },
  { label: 'At least one symbol', test: p => /[^A-Za-z0-9]/.test(p) },
];

function validBirthdate(value) {
  const s = value.trim();
  if (!s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d && dt <= new Date() && y >= 1900;
}

function validateStep(step, f) {
  const e = {};
  if (step === 0) {
    if (!EMAIL.test(f.email.trim()) || f.email.trim().length > 254) e.email = 'Enter a valid email address.';
    if (!PASSWORD_RULES.every(rule => rule.test(f.password))) e.password = 'Password does not meet all the requirements below.';
    if (!f.confirm) e.confirm = 'Re-enter your password.';
    else if (f.confirm !== f.password) e.confirm = 'Passwords do not match.';
  }
  if (step === 1) {
    const name = (key, label, required) => {
      const v = f[key].trim();
      if (!v) { if (required) e[key] = `${label} is required.`; return; }
      if (v.length > 50 || !NAME.test(v)) e[key] = `Enter a valid ${label.toLowerCase()}.`;
    };
    name('first_name', 'First name', true);
    name('middle_name', 'Middle name', false);
    name('last_name', 'Last name', true);
    if (!f.date_of_birth.trim()) e.date_of_birth = 'Please select your date of birth.';
    else if (!validBirthdate(f.date_of_birth)) e.date_of_birth = 'Please select a valid date of birth.';
    if (!f.gender) e.gender = 'Please select your gender.';
  }
  if (step === 2) {
    if (!/^9\d{9}$/.test(f.mobile_number)) e.mobile_number = 'Enter your 10-digit mobile number starting with 9.';
    if (!f.city_municipality.trim()) e.city_municipality = 'City or municipality is required.';
    if (!f.province.trim()) e.province = 'Province is required.';
    if (f.zip_code.trim() && !/^\d{4}$/.test(f.zip_code.trim())) e.zip_code = 'Enter a 4-digit ZIP code.';
  }
  if (step === 4) {
    if (f.otp.replace(/[^A-Za-z0-9]/g, '').length !== 6) e.otp = 'Enter the 6-character OTP code sent to your email.';
  }
  if (step === 5) {
    if (!f.accept_terms || !f.accept_privacy) e.consent = 'Please accept both to create your account.';
  }
  return e;
}

export function RegisterPage({ onBack, onRegistered }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    email: '', password: '', confirm: '',
    first_name: '', middle_name: '', last_name: '', name_suffix: '',
    date_of_birth: '', gender: '',
    mobile_number: '',
    street_address: '', barangay: '', city_municipality: '', province: '', zip_code: '',
    blood_type: '', allergies: '', medical_history: '',
    otp: '', otp_token: '',
    accept_terms: false, accept_privacy: false,
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [otpSeconds, setOtpSeconds] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [legal, setLegal] = useState(null); // 'terms' | 'privacy'
  const [done, setDone] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (otpSeconds <= 0 && resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setOtpSeconds(s => Math.max(0, s - 1));
      setResendCooldown(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpSeconds > 0, resendCooldown > 0]);

  const set = (key, value) => {
    setForm(f => ({
      ...f,
      [key]: value,
      ...(key === 'email' ? { otp: '', otp_token: '' } : {}),
    }));
    setErrors(e => ({ ...e, [key]: '', ...(key.startsWith('accept') ? { consent: '' } : {}) }));
  };

  const sendOtpToEmail = async (isResend = false) => {
    if (isResend) setResending(true);
    else setLoading(true);
    setError('');
    try {
      const res = await AuthAPI.sendOtp({ purpose: 'register', email: form.email.trim() });
      setOtpSeconds(res.expires_in || 300);
      setResendCooldown(res.resend_after || 60);
      setForm(f => ({ ...f, otp: '', otp_token: '' }));
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      if (isResend) setResending(false);
      else setLoading(false);
    }
  };

  const goBack = () => {
    setError('');
    if (step === 0) onBack();
    else setStep(step - 1);
  };

  const next = async () => {
    const found = validateStep(step, form);
    setErrors(found);
    setError('');
    if (Object.keys(found).length) return;

    // Moving from Step 3 (Medical Information) -> Step 4 (OTP Verification): send OTP email first
    if (step === 3) {
      if (!form.otp_token) {
        const sent = await sendOtpToEmail(false);
        if (!sent) return;
      }
      setStep(4);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }

    // Step 4 (OTP Verification): verify the 6-character code with the backend
    if (step === 4) {
      setLoading(true);
      try {
        const res = await AuthAPI.verifyOtp({
          purpose: 'register',
          email: form.email.trim(),
          code: form.otp,
        });
        setForm(f => ({ ...f, otp_token: res.otp_token }));
        setStep(5);
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (step < STEPS.length - 1) {
      setStep(step + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
      return;
    }

    // Final step (Step 5): Submit registration with the verified single-use otp_token
    setLoading(true);
    try {
      await AuthAPI.register({
        email: form.email.trim(),
        password: form.password,
        first_name: form.first_name.trim(),
        middle_name: form.middle_name.trim(),
        last_name: form.last_name.trim(),
        name_suffix: form.name_suffix,
        date_of_birth: form.date_of_birth.trim(),
        gender: form.gender,
        mobile_number: form.mobile_number,
        street_address: form.street_address.trim(),
        barangay: form.barangay.trim(),
        city_municipality: form.city_municipality.trim(),
        province: form.province.trim(),
        zip_code: form.zip_code.trim(),
        blood_type: form.blood_type,
        allergies: form.allergies.trim(),
        medical_history: form.medical_history.trim(),
        otp_token: form.otp_token,
        accept_terms: form.accept_terms,
        accept_privacy: form.accept_privacy,
      });
      setForm(f => ({ ...f, password: '', confirm: '', otp: '', otp_token: '' }));
      setDone(true);
    } catch (err) {
      const fields = err.fields || {};
      const first = Object.keys(fields).sort((a, b) => (FIELD_STEP[a] ?? 9) - (FIELD_STEP[b] ?? 9))[0];
      if (first && FIELD_STEP[first] !== undefined) {
        setStep(FIELD_STEP[first]);
        setErrors(fields);
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const StepIcon = STEPS[step].icon;
  const actionLabel =
    step === 0 ? 'Sign up' :
    step === 3 ? 'Get OTP' :
    step === 4 ? 'Submit' :
    step === STEPS.length - 1 ? 'Accept' : 'Continue';

  return (
    <View style={styles.root}>
      <LinearGradient colors={[COLORS.buttonTop, COLORS.buttonBottom]} style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={12} accessibilityLabel="Go back" style={styles.headerBack}>
          <ChevronLeft size={26} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sign up</Text>
        <View style={{ width: 34 }} />
      </LinearGradient>

      <KeyboardAvoidingView style={styles.sheet} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.progress} accessibilityLabel={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((_, i) => <View key={i} style={[styles.progressBar, i <= step && styles.progressOn]} />)}
          </View>

          <View style={styles.stepTitleRow}>
            <StepIcon size={22} color={COLORS.heading} />
            <Text style={styles.stepTitle}>{STEPS[step].title}</Text>
          </View>

          <ErrorBanner message={error} />

          {step === 0 && (
            <>
              <TextField
                label="Email"
                required
                value={form.email}
                onChangeText={v => set('email', v)}
                error={errors.email}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
              />
              <TextField
                label="Password"
                required
                value={form.password}
                onChangeText={v => set('password', v)}
                error={errors.password}
                secure
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
              />
              <View style={styles.rules}>
                {PASSWORD_RULES.map(rule => {
                  const ok = rule.test(form.password);
                  return (
                    <View key={rule.label} style={styles.rule}>
                      <View style={[styles.ruleDot, ok && styles.ruleDotOn]}>{ok && <Check size={10} color="#fff" strokeWidth={3} />}</View>
                      <Text style={[styles.ruleText, ok && { color: COLORS.text }]}>{rule.label}</Text>
                    </View>
                  );
                })}
              </View>
              <TextField
                label="Re-enter Password"
                required
                value={form.confirm}
                onChangeText={v => set('confirm', v)}
                error={errors.confirm}
                secure
                autoCapitalize="none"
                autoComplete="new-password"
                textContentType="newPassword"
              />
            </>
          )}

          {step === 1 && (
            <>
              <TextField
                label="First Name"
                required
                value={form.first_name}
                onChangeText={v => set('first_name', v)}
                error={errors.first_name}
                autoCapitalize="words"
                autoComplete="name-given"
                textContentType="givenName"
              />
              <TextField
                label="Middle Name"
                value={form.middle_name}
                onChangeText={v => set('middle_name', v)}
                error={errors.middle_name}
                autoCapitalize="words"
                autoComplete="name-middle"
                textContentType="middleName"
              />
              <TextField
                label="Last Name"
                required
                value={form.last_name}
                onChangeText={v => set('last_name', v)}
                error={errors.last_name}
                autoCapitalize="words"
                autoComplete="name-family"
                textContentType="familyName"
              />

              <FieldLabel label="Extension" style={{ marginBottom: 8 }} />
              <View style={[styles.chips, { marginBottom: 14 }]}>
                {['', ...SUFFIXES].map(s => {
                  const on = form.name_suffix === s;
                  return (
                    <TouchableOpacity key={s || 'none'} onPress={() => set('name_suffix', s)} style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="radio" accessibilityState={{ selected: on }}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{s || 'Not applicable'}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!!errors.name_suffix && <Text style={styles.fieldError}>{errors.name_suffix}</Text>}

              <DatePickerField
                label="Date of Birth"
                required
                value={form.date_of_birth}
                onChange={v => set('date_of_birth', v)}
                error={errors.date_of_birth}
              />

              <FieldLabel label="Gender" required style={{ marginBottom: 8 }} />
              <View style={styles.chips}>
                {GENDERS.map(g => {
                  const on = form.gender === g;
                  return (
                    <TouchableOpacity key={g} onPress={() => set('gender', g)} style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="radio" accessibilityState={{ selected: on }}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{g}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {!!errors.gender && <Text style={styles.fieldError}>{errors.gender}</Text>}
            </>
          )}

          {step === 2 && (
            <>
              <TextField
                label="Mobile Number"
                required
                value={form.mobile_number}
                onChangeText={v => set('mobile_number', v.replace(/\D/g, '').replace(/^0+/, '').slice(0, 10))}
                error={errors.mobile_number}
                hint="We'll use this to contact you about your appointments."
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                placeholder="9XX XXX XXXX"
                prefix={<View style={styles.prefix}><Text style={styles.prefixText}>+63</Text></View>}
              />
              <TextField
                label="Street Address"
                value={form.street_address}
                onChangeText={v => set('street_address', v)}
                error={errors.street_address}
                placeholder="House No., Street, Subdivision"
                autoCapitalize="words"
              />
              <TextField
                label="Barangay"
                value={form.barangay}
                onChangeText={v => set('barangay', v)}
                error={errors.barangay}
                placeholder="Barangay"
                autoCapitalize="words"
              />
              <TextField
                label="City / Municipality"
                required
                value={form.city_municipality}
                onChangeText={v => set('city_municipality', v)}
                error={errors.city_municipality}
                placeholder="e.g. Quezon City"
                autoCapitalize="words"
              />
              <View style={styles.rowFields}>
                <View style={{ flex: 2 }}>
                  <TextField
                    label="Province"
                    required
                    value={form.province}
                    onChangeText={v => set('province', v)}
                    error={errors.province}
                    placeholder="e.g. Metro Manila"
                    autoCapitalize="words"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <TextField
                    label="ZIP Code"
                    value={form.zip_code}
                    onChangeText={v => set('zip_code', v.replace(/\D/g, '').slice(0, 4))}
                    error={errors.zip_code}
                    placeholder="1100"
                    keyboardType="number-pad"
                    maxLength={4}
                  />
                </View>
              </View>
            </>
          )}

          {step === 3 && (
            <>
              <Text style={[authText.subtitle, { textAlign: 'left', marginTop: 0, marginBottom: 14 }]}>
                Sharing your medical details helps clinics prepare for your visits.
              </Text>
              <FieldLabel label="Blood Type" style={{ marginBottom: 8 }} />
              <View style={[styles.chips, { marginBottom: 16 }]}>
                {BLOOD_TYPES.map(bt => {
                  const on = form.blood_type === bt;
                  return (
                    <TouchableOpacity key={bt} onPress={() => set('blood_type', on ? '' : bt)} style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="radio" accessibilityState={{ selected: on }}>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{bt}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TextField
                label="Allergies"
                value={form.allergies}
                onChangeText={v => set('allergies', v)}
                error={errors.allergies}
                placeholder="e.g. Penicillin, Peanuts, None"
              />
              <TextField
                label="Medical History / Existing Conditions"
                value={form.medical_history}
                onChangeText={v => set('medical_history', v)}
                error={errors.medical_history}
                placeholder="e.g. Asthma, Hypertension (comma-separated)"
              />
            </>
          )}

          {step === 4 && (
            <>
              <Text style={[authText.subtitle, { marginTop: 0, marginBottom: 16 }]}>
                Enter the <Text style={{ fontWeight: '700', color: COLORS.heading }}>One Time Password (OTP)</Text> sent to{' '}
                <Text style={{ fontWeight: '700', color: COLORS.heading }}>{form.email.trim()}</Text>.
              </Text>
              <OtpCodeInput
                value={form.otp}
                onChange={code => set('otp', code)}
                error={errors.otp}
                secondsLeft={otpSeconds}
                resendCooldown={resendCooldown}
                resending={resending}
                onResend={() => sendOtpToEmail(true)}
              />
            </>
          )}

          {step === 5 && (
            <>
              <Text style={[authText.subtitle, { textAlign: 'left', marginTop: 0, marginBottom: 12 }]}>
                After carefully reading and agreeing to the terms and policies, please check the following boxes:
              </Text>
              <Checkbox checked={form.accept_privacy} onPress={() => set('accept_privacy', !form.accept_privacy)} error={!!errors.consent}>
                <Text style={styles.checkText}>
                  By ticking, you confirm that you have read, understood, and agree to the{' '}
                  <Text style={authText.link} onPress={() => setLegal('privacy')}>Privacy Policy</Text>
                  <Text style={styles.asterisk}> *</Text>
                </Text>
              </Checkbox>
              <Checkbox checked={form.accept_terms} onPress={() => set('accept_terms', !form.accept_terms)} error={!!errors.consent}>
                <Text style={styles.checkText}>
                  By ticking, you confirm that you have read, understood, and agree to be bound by the{' '}
                  <Text style={authText.link} onPress={() => setLegal('terms')}>Terms of Service</Text>
                  <Text style={styles.asterisk}> *</Text>
                </Text>
              </Checkbox>
              {!!errors.consent && <Text style={styles.fieldError}>{errors.consent}</Text>}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            title={
              loading
                ? step === 3 ? 'Sending OTP...' : step === 4 ? 'Verifying...' : 'Creating account...'
                : actionLabel
            }
            onPress={next}
            loading={loading}
          />
          <View style={styles.loginRow}>
            <Text style={authText.small}>Have an account? </Text>
            <TouchableOpacity onPress={onBack} hitSlop={8} accessibilityRole="link">
              <Text style={[authText.small, authText.link]}>Log in</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Popup
        visible={!!legal}
        icon={legal === 'terms' ? FileText : ShieldAlert}
        title={legal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
        actionLabel="I Agree"
        onRequestClose={() => setLegal(null)}
        onAction={() => {
          set(legal === 'terms' ? 'accept_terms' : 'accept_privacy', true);
          setLegal(null);
        }}
      >
        <ScrollView style={styles.legalBox} contentContainerStyle={{ padding: 14 }}>
          <Text style={styles.legalText}>{legal === 'terms' ? TERMS_OF_SERVICE : PRIVACY_POLICY}</Text>
        </ScrollView>
      </Popup>

      <Popup
        visible={done}
        icon={ShieldCheck}
        title="Account Created"
        message="Your GabayMed account is ready. You can now log in to access your account."
        actionLabel="Log In"
        onAction={() => { setDone(false); onRegistered(form.email.trim()); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.buttonBottom },
  header: { paddingTop: 52, paddingBottom: 40, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerBack: { padding: 4 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '600' },
  sheet: { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 32, borderTopRightRadius: 32, marginTop: -24, overflow: 'hidden' },
  content: { padding: 24, paddingTop: 20 },
  progress: { flexDirection: 'row', gap: 6, marginBottom: 24 },
  progressBar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: '#E2E8F0' },
  progressOn: { backgroundColor: COLORS.buttonTop },
  stepTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 24, paddingHorizontal: 8 },
  stepTitle: { fontSize: 20, fontWeight: '700', color: COLORS.heading, textAlign: 'center', flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
  chipOn: { borderColor: COLORS.accent, backgroundColor: '#EAF6FE' },
  chipText: { fontSize: 13, color: COLORS.muted },
  chipTextOn: { color: COLORS.accent, fontWeight: '600' },
  rowFields: { flexDirection: 'row', gap: 10 },
  fieldError: { color: COLORS.error, fontSize: 12, marginTop: 6 },
  asterisk: { color: COLORS.error, fontWeight: '700' },
  prefix: { borderRightWidth: 1, borderRightColor: COLORS.border, paddingRight: 10, marginRight: 2 },
  prefixText: { fontSize: 15, color: COLORS.text, fontWeight: '500' },
  rules: { marginTop: -6, marginBottom: 14, gap: 6 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  ruleDotOn: { backgroundColor: '#22C55E', borderColor: '#22C55E' },
  ruleText: { fontSize: 12, color: '#94A3B8' },
  checkText: { fontSize: 13, color: COLORS.text, lineHeight: 19 },
  footer: { paddingHorizontal: 24, paddingBottom: 28, paddingTop: 8, backgroundColor: '#fff' },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
  legalBox: { maxHeight: 300, marginTop: 14, borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: '#fff' },
  legalText: { fontSize: 13, color: COLORS.text, lineHeight: 20, textAlign: 'justify' },
});
