import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthScreen, ErrorBanner, OutlineButton, PrimaryButton, TextField, authText } from './auth/auth-ui';
import Session from '../services/session';

const pinKey = id => `gabay_app_pin_${id}`;
const isPin = value => /^\d{6}$/.test(value);

async function readPin(id) {
  const value = await SecureStore.getItemAsync(pinKey(id));
  return value ? JSON.parse(value) : null;
}

async function verifyPin(id, pin) {
  const saved = await readPin(id);
  if (!saved) return;
  if (saved.pin === pin) {
    await SecureStore.setItemAsync(pinKey(id), JSON.stringify({ pin, attempts: 0 }));
    return;
  }
  const attempts = (saved.attempts || 0) + 1;
  await SecureStore.setItemAsync(pinKey(id), JSON.stringify({ ...saved, attempts }));
  if (attempts >= 5) await Session.signOut();
  throw new Error(`Incorrect PIN. ${Math.max(0, 5 - attempts)} attempts left before sign-out.`);
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

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>App PIN</Text>
      <Text>Use a six-digit PIN when opening GabayMed after an app restart or sign-in on this device.</Text>
      <ErrorBanner message={error} />
      {status ? <Text accessibilityLiveRegion="polite">{status}</Text> : null}
      {enabled !== null && <>
        {enabled && <PinField label="Current PIN" value={current} onChangeText={setCurrent} />}
        <PinField label="New PIN" value={pin} onChangeText={setPin} />
        <PinField label="Confirm new PIN" value={confirmation} onChangeText={setConfirmation} />
        <PrimaryButton title={enabled ? 'Change app PIN' : 'Set app PIN'} loading={busy} onPress={() => save(false)} />
        {enabled && <OutlineButton title="Remove app PIN" disabled={busy} onPress={() => save(true)} />}
      </>}
    </View>
  );
}

export function UnlockPatientApp({ children, patientId }) {
  const [locked, setLocked] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    readPin(patientId).then(saved => {
      if (mounted) setLocked(Boolean(saved));
    }).catch(() => {
      if (mounted) {
        setLocked(true);
        setError('Could not read the app PIN. Sign out and reset it.');
      }
    });
    return () => { mounted = false; };
  }, [patientId]);

  async function unlock(reset = false) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (reset) {
        await Session.signOut({ requireLocalRemoval: true });
        await SecureStore.deleteItemAsync(pinKey(patientId));
      } else {
        await verifyPin(patientId, pin);
        setLocked(false);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setPin('');
      setBusy(false);
    }
  }

  if (locked === null) return <View style={styles.loading}><ActivityIndicator /></View>;
  if (!locked) return children;
  return (
    <AuthScreen contentStyle={styles.content}>
      <Text style={authText.title}>Unlock GabayMed</Text>
      <ErrorBanner message={error} />
      <PinField label="App PIN" value={pin} onChangeText={setPin} />
      <PrimaryButton title="Unlock" disabled={!isPin(pin)} loading={busy} onPress={() => unlock()} />
      <OutlineButton title="Sign out" disabled={busy} onPress={() => Session.signOut()} />
      <OutlineButton title="Forgot PIN? Sign out and reset" disabled={busy} onPress={() => unlock(true)} />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 50, gap: 12 },
  loading: { flex: 1, justifyContent: 'center' },
  section: { backgroundColor: '#fff', padding: 16, borderRadius: 16, gap: 8 },
  heading: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
});
