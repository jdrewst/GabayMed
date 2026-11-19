import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Lock } from 'lucide-react-native';
import {
  AuthScreen, AuthLogo, TextField, PrimaryButton, OutlineButton, ErrorBanner, Popup, authText, COLORS,
} from '../../components/auth/auth-ui';
import AuthAPI from '../../services/authApi';
import Session from '../../services/session';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function formatWait(seconds) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function LoginPage({ onSignUp, onForgotPassword, initialEmail = '', notice = '' }) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(notice);
  const [loading, setLoading] = useState(false);
  const [lockSeconds, setLockSeconds] = useState(0);
  const [showLock, setShowLock] = useState(false);
  const passwordRef = useRef(null);

  useEffect(() => {
    if (lockSeconds <= 0) return undefined;
    const timer = setInterval(() => setLockSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [lockSeconds > 0]);

  const handleLogin = async () => {
    if (loading || lockSeconds > 0) return;
    const next = {};
    if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!password) next.password = 'Enter your password.';
    if (needsMfa && !/^\d{6}$/.test(code)) next.code = 'Enter your six-digit authenticator code.';
    setErrors(next);
    setError('');
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const result = await AuthAPI.login(email.trim(), password, needsMfa ? code : undefined);
      setPassword('');
      await Session.start(result);
    } catch (err) {
      if (err.code === 'mfa_required' || err.code === 'mfa_invalid') {
        setNeedsMfa(true);
        setCode('');
        if (err.code === 'mfa_invalid') setError(err.message);
        return;
      }
      if (!needsMfa) setPassword('');
      if (err.status === 429 && err.retryAfter > 0) {
        setLockSeconds(err.retryAfter);
        setShowLock(true);
      } else {
        setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const locked = lockSeconds > 0;

  return (
    <AuthScreen wave contentStyle={{ justifyContent: 'center', paddingVertical: 40 }}>
      <View style={styles.card}>
        <AuthLogo size={44} style={{ marginBottom: 20 }} />
        <Text style={authText.title}>
          Choose Healthcare{'\n'}that's <Text style={styles.highlight}>Right</Text> for You
        </Text>

        <View style={{ marginTop: 28 }}>
          <ErrorBanner message={error} />
          {needsMfa ? (
            <TextField label="Authenticator code" value={code} onChangeText={setCode}
              error={errors.code} keyboardType="number-pad" maxLength={6} autoFocus
              onSubmitEditing={handleLogin} />
          ) : <>
            <TextField
              label="Email"
              required
              value={email}
              onChangeText={text => { setEmail(text); setErrors(e => ({ ...e, email: '' })); }}
              error={errors.email}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <TextField
              label="Password"
              required
              inputRef={passwordRef}
              value={password}
              onChangeText={text => { setPassword(text); setErrors(e => ({ ...e, password: '' })); }}
              error={errors.password}
              secure
              autoCapitalize="none"
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={onForgotPassword} style={styles.forgotBtn} hitSlop={8} accessibilityRole="link">
              <Text style={[authText.small, authText.link]}>Forgot Password</Text>
            </TouchableOpacity>
          </>}
        </View>

        <PrimaryButton
          title={locked ? `Try again in ${formatWait(lockSeconds)}` : loading ? 'Logging in...' : needsMfa ? 'Verify and log in' : 'Log In'}
          onPress={handleLogin}
          loading={loading}
          disabled={locked}
          style={{ marginTop: 8 }}
        />

        {needsMfa ? (
          <OutlineButton title="Back to sign in" onPress={() => {
            setNeedsMfa(false); setPassword(''); setCode(''); setErrors({}); setError('');
          }} disabled={loading} />
        ) : <View style={styles.signupRow}>
          <Text style={authText.small}>Don't have an account? </Text>
          <TouchableOpacity onPress={onSignUp} hitSlop={8} accessibilityRole="link">
            <Text style={[authText.small, authText.link]}>Sign up</Text>
          </TouchableOpacity>
        </View>}
      </View>

      <Popup
        visible={showLock}
        icon={Lock}
        title="Too Many Attempts"
        message={`For your security, logging in to this account is paused. Please try again in ${formatWait(lockSeconds)}.`}
        actionLabel="OK"
        onAction={() => setShowLock(false)}
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
  highlight: { color: COLORS.accent },
  forgotBtn: { alignSelf: 'flex-end', marginTop: -4, marginBottom: 8 },
  signupRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 22 },
});
