import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  BackButton, ErrorBanner, OutlineButton, PrimaryButton, TextField, authText,
} from '../components/auth/auth-ui';
import { createPatientAuthClient } from '../lib/supabase';
import { PatientPinSettings } from '../components/patient-pin';
import AuthAPI from '../services/authApi';
import Session from '../services/session';

const validCode = value => /^\d{6}$/.test(value);

async function getAuthClient() {
  const accessToken = await Session.getAccessToken();
  const refreshToken = Session.current()?.refreshToken;
  if (!accessToken || !refreshToken) throw new Error('Please log in again.');
  const client = createPatientAuthClient();
  const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
  if (error) throw error;
  return client.auth;
}

export function MfaSettingsPage({ onBack }) {
  const [factors, setFactors] = useState(null);
  const [pending, setPending] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  async function loadFactors(auth) {
    const { data, error } = await auth.mfa.listFactors();
    if (error) throw error;
    setFactors(data.totp);
    return data.all;
  }

  async function run(action) {
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('');
    try { await action(); } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function loadSettings() {
    await loadFactors(await getAuthClient());
  }

  useEffect(() => { run(loadSettings); }, []);

  async function changePassword() {
    if (!password || password !== confirmation) throw new Error('Enter matching new passwords.');
    try {
      await AuthAPI.changePassword(await Session.getAccessToken(), { current_password: currentPassword, password });
      setStatus('Password updated.');
    } finally {
      setCurrentPassword('');
      setPassword('');
      setConfirmation('');
    }
  }

  async function enroll() {
    const auth = await getAuthClient();
    const all = await loadFactors(auth);
    for (const factor of all.filter(item => item.factor_type === 'totp' && item.status === 'unverified')) {
      const { error } = await auth.mfa.unenroll({ factorId: factor.id });
      if (error) throw error;
    }
    const { data, error } = await auth.mfa.enroll({ factorType: 'totp', issuer: 'GabayMed' });
    if (error) throw error;
    setPending(data);
  }

  async function verify(factorId) {
    if (!validCode(code)) throw new Error('Enter the six-digit authenticator code.');
    const auth = await getAuthClient();
    const { data, error } = await auth.mfa.challengeAndVerify({ factorId, code });
    setCode('');
    if (error) throw error;
    await Session.start({ ...data, expires_at: Math.floor(Date.now() / 1000) + data.expires_in, profile: Session.current().profile });
    if (removing) {
      await unenroll(removing, auth);
      return;
    }
    setPending(null);
    await loadFactors(auth);
    setStatus('Authenticator enabled.');
  }

  async function unenroll(factorId, auth) {
    auth = auth || await getAuthClient();
    const { error } = await auth.mfa.unenroll({ factorId });
    if (error?.code === 'insufficient_aal' || /aal2 required to unenroll/i.test(error?.message || '')) {
      setRemoving(factorId);
      return;
    }
    if (error) throw error;
    setPending(null);
    setRemoving(null);
    setCode('');
    await loadFactors(auth);
    setStatus('Authenticator removed.');
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <BackButton onPress={onBack} />
      <Text style={authText.title}>Account security</Text>
      <ErrorBanner message={error} />
      {status ? <Text accessibilityLiveRegion="polite">{status}</Text> : null}
      <View style={styles.section}>
        <Text style={styles.heading}>Authenticator app (MFA)</Text>
        {removing ? (
          <>
            <Text>Enter a current code to remove this authenticator. If you lost access to your codes, contact GabayMed support for an authenticator reset.</Text>
            <TextField label="Authenticator code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
            <PrimaryButton title="Verify and remove authenticator" disabled={busy} onPress={() => run(() => verify(removing))} />
            <OutlineButton title="Cancel removal" disabled={busy} onPress={() => { setRemoving(null); setCode(''); setError(''); }} />
          </>
        ) : pending ? (
          <>
            <Text>Add this setup key to your authenticator app, then enter its six-digit code.</Text>
            <Text selectable style={styles.setupKey}>{pending.totp.secret}</Text>
            <TextField label="Authenticator code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
            <PrimaryButton title="Verify and enable MFA" disabled={busy} onPress={() => run(() => verify(pending.id))} />
            <OutlineButton title="Cancel setup" disabled={busy} onPress={() => run(() => unenroll(pending.id))} />
          </>
        ) : factors === null ? (
          <OutlineButton title="Reload authenticator settings" disabled={busy} onPress={() => run(loadSettings)} />
        ) : factors.length ? (
          factors.map((factor, index) => (
            <OutlineButton key={factor.id} disabled={busy} onPress={() => run(() => unenroll(factor.id))}
              title={factors.length === 1 ? 'Remove authenticator' : `Remove authenticator ${index + 1}`} />
          ))
        ) : (
          <PrimaryButton title="Set up authenticator" disabled={busy} onPress={() => run(enroll)} />
        )}
      </View>
      <View style={styles.section}>
        <Text style={styles.heading}>Password</Text>
        <TextField label="Current password" value={currentPassword} onChangeText={setCurrentPassword} secure autoComplete="current-password" />
        <TextField label="New password" value={password} onChangeText={setPassword} secure autoComplete="new-password" />
        <TextField label="Confirm new password" value={confirmation} onChangeText={setConfirmation} secure />
        <PrimaryButton title="Change password" disabled={busy} onPress={() => run(changePassword)} />
      </View>
      <PatientPinSettings />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 22, paddingTop: 50, paddingBottom: 40, gap: 12 },
  section: { backgroundColor: '#fff', padding: 16, borderRadius: 16, gap: 8 },
  heading: { fontSize: 18, fontWeight: '700', color: '#0F172A' },
  setupKey: { fontWeight: '700', paddingVertical: 8 },
});
