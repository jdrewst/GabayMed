import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from '../lib/secureStorage';
import { AuthScreen, ErrorBanner, OutlineButton, PrimaryButton, TextField, authText } from './auth/auth-ui';
import Session from '../services/session';
import AuthAPI from '../services/authApi';

const pinKey = id => `gabay_app_pin_${id}`;
const isPin = value => /^\d{6}$/.test(value);
const MAX_PIN_ATTEMPTS = 5;
const pinLockedMessage = 'Too many incorrect PIN attempts. Verify your account to set a new PIN.';

async function readPin(id) {
  const value = await SecureStore.getItemAsync(pinKey(id));
  return value ? JSON.parse(value) : null;
}

async function verifyPin(id, pin) {
  const saved = await readPin(id);
  if (!saved) return;
  if (saved.attempts >= MAX_PIN_ATTEMPTS) throw new Error(pinLockedMessage);
  if (saved.pin === pin) {
    await SecureStore.setItemAsync(pinKey(id), JSON.stringify({ pin, attempts: 0 }));
    return;
  }
  const attempts = (saved.attempts || 0) + 1;
  await SecureStore.setItemAsync(pinKey(id), JSON.stringify({ ...saved, attempts }));
  if (attempts >= MAX_PIN_ATTEMPTS) throw new Error(pinLockedMessage);
  const remaining = MAX_PIN_ATTEMPTS - attempts;
  throw new Error(`Incorrect PIN. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} left before verification is required.`);
}

function PinField({ label, value, onChangeText }) {
  return <TextField label={label} value={value} onChangeText={onChangeText} secure keyboardType="number-pad" maxLength={6} />;
}

export function PatientPinSettings() {
  const id = Session.getUserId();
  const [enabled, setEnabled] = useState(null);
  const [current, setCurrent] = useState('');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    readPin(id).then(saved => setEnabled(Boolean(saved))).catch(err => setError(err.message));
  }, [id]);

  async function save(remove) {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      if (!remove && (!isPin(pin) || pin !== confirmation)) throw new Error('Enter and confirm a six-digit PIN.');
      await verifyPin(id, current);
      if (remove) await SecureStore.deleteItemAsync(pinKey(id));
      else await SecureStore.setItemAsync(pinKey(id), JSON.stringify({ pin, attempts: 0 }));
      setEnabled(!remove);
      setStatus(remove ? 'App PIN removed.' : 'App PIN saved.');
      setPin('');
      setConfirmation('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCurrent('');
      setBusy(false);
    }
  }

  if (resetting) return (
    <ResetAppPin embedded patientId={id} onCancel={() => setResetting(false)} onReset={() => {
      setEnabled(true);
      setResetting(false);
      setCurrent('');
      setPin('');
      setConfirmation('');
      setStatus('App PIN reset.');
    }} />
  );

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>App PIN</Text>
      <Text>Use a six-digit PIN when reopening GabayMed with a saved session on this device.</Text>
      <ErrorBanner message={error} />
      {status ? <Text accessibilityLiveRegion="polite">{status}</Text> : null}
      {enabled !== null && <>
        {enabled && <PinField label="Current PIN" value={current} onChangeText={setCurrent} />}
        <PinField label="New PIN" value={pin} onChangeText={setPin} />
        <PinField label="Confirm new PIN" value={confirmation} onChangeText={setConfirmation} />
        <PrimaryButton title={enabled ? 'Change app PIN' : 'Set app PIN'} loading={busy} onPress={() => save(false)} />
        {enabled && <OutlineButton title="Remove app PIN" disabled={busy} onPress={() => save(true)} />}
        {enabled && <OutlineButton title="Forgot current PIN?" disabled={busy} onPress={() => {
          setError('');
          setStatus('');
          setResetting(true);
        }} />}
      </>}
    </View>
  );
}

export function UnlockPatientApp({ children, patientId, requiresPin }) {
  const [locked, setLocked] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!requiresPin) {
      setLocked(false);
      return;
    }
    let mounted = true;
    readPin(patientId).then(saved => {
      if (mounted) setLocked(Boolean(saved));
    }).catch(() => {
      if (mounted) {
        setLocked(true);
        setError('Could not read the app PIN. Verify your account to reset it.');
      }
    });
    return () => { mounted = false; };
  }, [patientId, requiresPin]);

  async function unlock() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await verifyPin(patientId, pin);
      setLocked(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setPin('');
      setBusy(false);
    }
  }

  if (locked === null) return <View style={styles.loading}><ActivityIndicator /></View>;
  if (!locked) return children;
  if (resetting) return (
    <ResetAppPin patientId={patientId} onCancel={() => setResetting(false)} onReset={() => {
      setResetting(false);
      setLocked(false);
    }} />
  );
  return (
    <AuthScreen contentStyle={styles.content}>
      <Text style={authText.title}>Unlock GabayMed</Text>
      <ErrorBanner message={error} />
      <PinField label="App PIN" value={pin} onChangeText={setPin} />
      <PrimaryButton title="Unlock" disabled={!isPin(pin)} loading={busy} onPress={() => unlock()} />
      <OutlineButton title="Sign out" disabled={busy} onPress={() => Session.signOut()} />
      <OutlineButton title="Forgot PIN? Verify and reset" disabled={busy} onPress={() => {
        setPin('');
        setError('');
        setResetting(true);
      }} />
    </AuthScreen>
  );
}

function ResetAppPin({ patientId, onCancel, onReset, embedded = false }) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState('password');
  const [pin, setPin] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (stage === 'pin') {
        if (!isPin(pin) || pin !== confirmation) throw new Error('Enter and confirm a six-digit PIN.');
        if (Session.getUserId() !== patientId) throw new Error('Your session changed. Please try again.');
        await SecureStore.setItemAsync(pinKey(patientId), JSON.stringify({ pin, attempts: 0 }));
        onReset();
        return;
      }
      const email = Session.current()?.profile?.email;
      if (!email) throw new Error('Your session expired. Please sign in again.');
      const result = await AuthAPI.login(email, password, stage === 'mfa' ? code : undefined);
      // Revoke the session created for verification and keep the current session active.
      AuthAPI.logout(result.access_token).catch(() => {});
      if (result.profile?.id !== patientId || Session.getUserId() !== patientId) {
        throw new Error('Your session changed. Please try again.');
      }
      setPassword('');
      setCode('');
      setStage('pin');
    } catch (err) {
      if (err.code === 'mfa_required' || err.code === 'mfa_invalid') {
        setStage('mfa');
        setCode('');
        if (err.code === 'mfa_invalid') setError(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const fields = (
    <>
      <Text style={embedded ? styles.heading : authText.title}>Reset app PIN</Text>
      <ErrorBanner message={error} />
      {stage === 'password' && <TextField label="Account password" value={password} onChangeText={setPassword} secure autoComplete="current-password" />}
      {stage === 'mfa' && (
        <TextField label="Authenticator code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
      )}
      {stage === 'pin' && <>
        <PinField label="New PIN" value={pin} onChangeText={setPin} />
        <PinField label="Confirm new PIN" value={confirmation} onChangeText={setConfirmation} />
      </>}
      <PrimaryButton title={stage === 'pin' ? 'Save new PIN' : 'Verify account'} loading={busy}
        disabled={(stage === 'password' && !password) || (stage === 'mfa' && !isPin(code))}
        onPress={submit} />
      <OutlineButton title={embedded ? 'Cancel PIN reset' : 'Back to app lock'} disabled={busy} onPress={onCancel} />
    </>
  );

  return embedded
    ? <View style={styles.section}>{fields}</View>
    : <AuthScreen contentStyle={styles.content}>{fields}</AuthScreen>;
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', paddingHorizontal: 22, paddingTop: 32, paddingBottom: 32, gap: 12 },
  loading: { flex: 1, justifyContent: 'center' },
  section: { backgroundColor: '#fff', padding: 16, borderRadius: 16, gap: 8 },
  heading: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
});
