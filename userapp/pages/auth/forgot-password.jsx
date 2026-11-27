import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ShieldCheck, Check } from 'lucide-react-native';
import {
  AuthScreen, AuthLogo, TextField, PrimaryButton, OutlineButton, BackButton, ErrorBanner, Popup, OtpCodeInput, authText, COLORS,
} from '../../components/auth/auth-ui';
import AuthAPI from '../../services/authApi';
import { useTheme } from '../../context/ThemeContext';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RULES = [
  { label: '12 to 128 characters', test: p => p.length >= 12 && p.length <= 128 },
  { label: 'Uppercase and lowercase letters', test: p => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { label: 'At least one number', test: p => /\d/.test(p) },
  { label: 'At least one symbol', test: p => /[^A-Za-z0-9]/.test(p) },
];

export function ForgotPasswordPage({ onBack, onResetDone }) {
  const { display } = useTheme();
  // step: 'identify' -> 'otp' -> 'reset'
  const [step, setStep] = useState('identify');
  const [email, setEmail] = useState('');
  const [resolvedEmail, setResolvedEmail] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [otpSeconds, setOtpSeconds] = useState(0);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [updatedPopup, setUpdatedPopup] = useState(false);

  useEffect(() => {
    if (otpSeconds <= 0 && resendCooldown <= 0) return undefined;
    const timer = setInterval(() => {
      setOtpSeconds(s => Math.max(0, s - 1));
      setResendCooldown(s => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [otpSeconds > 0, resendCooldown > 0]);

  const requestResetOtp = async (isResend = false) => {
    setErrors({});
    setError('');
    if (!EMAIL.test(email.trim())) {
      setErrors({ email: 'Enter a valid email address.' });
      return;
    }

    if (isResend) setResending(true);
    else setLoading(true);
    try {
      const res = await AuthAPI.sendOtp({ purpose: 'reset', email: email.trim() });
      setResolvedEmail(res.email || email.trim());
      setMaskedEmail(res.masked_email || res.email || email.trim());
      setOtpSeconds(res.expires_in || 300);
      setResendCooldown(res.resend_after || 60);
      setOtp('');
      setOtpToken('');
      setStep('otp');
    } catch (err) {
      setError(err.message);
    } finally {
      if (isResend) setResending(false);
      else setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const clean = otp.replace(/[^A-Za-z0-9]/g, '');
    if (clean.length !== 6) {
      setErrors({ otp: 'Enter the 6-character OTP code sent to your email.' });
      return;
    }
    setErrors({});
    setError('');
    setLoading(true);
    try {
      const res = await AuthAPI.verifyOtp({
        purpose: 'reset',
        email: resolvedEmail,
        code: clean,
      });
      setOtpToken(res.otp_token);
      setStep('reset');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    const next = {};
    if (!PASSWORD_RULES.every(r => r.test(password))) {
      next.password = 'Password does not meet all the requirements below.';
    }
    if (!confirm) next.confirm = 'Re-enter your new password.';
    else if (confirm !== password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    setError('');
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      await AuthAPI.resetPassword({
        email: resolvedEmail,
        otp_token: otpToken,
        password,
      });
      setPassword('');
      setConfirm('');
      setUpdatedPopup(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen wave contentStyle={{ justifyContent: 'center', paddingVertical: 40 }}>
      {step === 'otp' && <BackButton onPress={() => { setError(''); setStep('identify'); }} color={display.textPrimary} />}
      <View style={[styles.card, { backgroundColor: display.cardBg, borderColor: display.border }]}>
        <AuthLogo size={44} style={{ marginBottom: 20 }} />

        {step === 'identify' && (
          <>
            <Text style={[authText.title, { color: display.textPrimary }]}>Forgot Password</Text>
            <Text style={[authText.subtitle, { color: display.textSecondary, marginTop: 8, marginBottom: 24 }]}>
              Enter your registered email address. We will send you a verification code to reset your access.
            </Text>

            <ErrorBanner message={error} />

            <TextField
              label="Email"
              required
              value={email}
              onChangeText={v => { setEmail(v); setErrors({}); }}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              placeholder="name@example.com"
            />

            <PrimaryButton
              title={loading ? 'Sending OTP...' : 'Next'}
              onPress={() => requestResetOtp(false)}
              loading={loading}
              style={{ marginTop: 8 }}
            />

            <View style={styles.bottomRow}>
              <Text style={[authText.small, { color: display.textSecondary }]}>Remember your password? </Text>
              <TouchableOpacity onPress={onBack} hitSlop={8} accessibilityRole="link">
                <Text style={[authText.small, authText.link]}>Back to Login</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 'otp' && (
          <>
            <Text style={[authText.title, { color: display.textPrimary }]}>OTP Verification</Text>
            <Text style={[authText.subtitle, { color: display.textSecondary, marginTop: 8, marginBottom: 16 }]}>
              Enter the <Text style={{ fontWeight: '700', color: display.textPrimary }}>One Time Password (OTP)</Text> sent to the{' '}
              <Text style={{ fontWeight: '700', color: display.textPrimary }}>e-mail address</Text> ({maskedEmail}) you registered with us.
            </Text>

            <ErrorBanner message={error} />

            <OtpCodeInput
              value={otp}
              onChange={code => { setOtp(code); setErrors({}); }}
              error={errors.otp}
              secondsLeft={otpSeconds}
              resendCooldown={resendCooldown}
              resending={resending}
              onResend={() => requestResetOtp(true)}
            />

            <PrimaryButton
              title={loading ? 'Verifying...' : 'Submit'}
              onPress={handleVerifyOtp}
              loading={loading}
              style={{ marginTop: 22 }}
            />

            <View style={styles.bottomRow}>
              <Text style={[authText.small, { color: display.textSecondary }]}>Remember your password? </Text>
              <TouchableOpacity onPress={onBack} hitSlop={8} accessibilityRole="link">
                <Text style={[authText.small, authText.link]}>Back to Login</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {step === 'reset' && (
          <>
            <Text style={[authText.title, { color: display.textPrimary, marginBottom: 20 }]}>Reset your password</Text>

            <ErrorBanner message={error} />

            <TextField
              label="Password"
              required
              value={password}
              onChangeText={v => { setPassword(v); setErrors(e => ({ ...e, password: '' })); }}
              error={errors.password}
              secure
              autoCapitalize="none"
              autoComplete="new-password"
            />
            <View style={styles.rules}>
              {PASSWORD_RULES.map(rule => {
                const ok = rule.test(password);
                return (
                  <View key={rule.label} style={styles.rule}>
                    <View style={[styles.ruleDot, ok && styles.ruleDotOn]}>
                      {ok && <Check size={10} color="#fff" strokeWidth={3} />}
                    </View>
                    <Text style={[styles.ruleText, ok && { color: COLORS.text }]}>{rule.label}</Text>
                  </View>
                );
              })}
            </View>

            <TextField
              label="Re-enter Password"
              required
              value={confirm}
              onChangeText={v => { setConfirm(v); setErrors(e => ({ ...e, confirm: '' })); }}
              error={errors.confirm}
              secure
              autoCapitalize="none"
              autoComplete="new-password"
            />

            <PrimaryButton
              title={loading ? 'Updating...' : 'Submit'}
              onPress={handleReset}
              loading={loading}
              style={{ marginTop: 8 }}
            />
            <OutlineButton
              title="Cancel"
              onPress={onBack}
              disabled={loading}
              style={{ marginTop: 10 }}
            />
          </>
        )}
      </View>

      <Popup
        visible={updatedPopup}
        icon={ShieldCheck}
        title="Password Updated"
        message="Password Reset Successful. You can now log in to access your GABAY account."
        actionLabel="Continue"
        onAction={() => {
          setUpdatedPopup(false);
          onResetDone(resolvedEmail);
        }}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 32,
    paddingHorizontal: 22,
    paddingVertical: 32,
    borderWidth: 1,
    borderColor: '#E9F4FE',
    shadowColor: '#38BDF8',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  bottomRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 22 },
  rules: { marginTop: -6, marginBottom: 14, gap: 6 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleDot: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  ruleDotOn: { backgroundColor: '#22C55E', borderColor: '#22C55E' },
  ruleText: { fontSize: 12, color: '#94A3B8' },
});
