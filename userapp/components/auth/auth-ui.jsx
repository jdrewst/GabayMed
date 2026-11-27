import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Image, Modal, ActivityIndicator,
  KeyboardAvoidingView, ScrollView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';
import { Eye, EyeOff, AlertCircle, ChevronLeft, ChevronRight, Check, Calendar } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';

// Shared look for the patient login, registration and onboarding screens.
// Colours match the GabayMed website login (client/src/pages/login.jsx).
export const COLORS = {
  brand: '#4C82F7',
  buttonTop: '#55C5F8',
  buttonBottom: '#3BA5EC',
  accent: '#3BA5EC',
  heading: '#2F3E4C',
  text: '#334155',
  muted: '#64748B',
  border: '#E2E8F0',
  surface: '#F7FCFF',
  error: '#DC2626',
  errorBg: '#FEF2F2',
  errorBorder: '#FECACA',
};

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function AuthLogo({ size = 40, style }) {
  return (
    <View style={[styles.logoRow, style]}>
      <Image source={require('../../assets/Logo.png')} style={{ width: size, height: size }} resizeMode="contain" />
      <Text style={[styles.logoText, { fontSize: size * 0.68 }]}>GabayMed</Text>
    </View>
  );
}

/** Soft blue wave from the website login header. */
export function WaveHeader({ height = 220 }) {
  return (
    <View pointerEvents="none" style={[styles.wave, { height }]}>
      <Svg width="100%" height="100%" viewBox="0 0 1440 380" preserveAspectRatio="none">
        <Defs>
          <SvgGradient id="wave" x1="0" y1="0" x2="1" y2="0.8">
            <Stop offset="0" stopColor="#55C9FD" />
            <Stop offset="0.5" stopColor="#6FD2FD" />
            <Stop offset="1" stopColor="#8BE0FE" />
          </SvgGradient>
        </Defs>
        <Path d="M0 0H1440V180C1320 250 1180 270 1020 220C860 170 700 160 520 220C360 275 180 265 0 180V0Z" fill="url(#wave)" opacity={0.55} />
        <Path d="M0 0H1440V160C1290 230 1140 255 980 200C820 145 660 155 490 215C320 275 160 255 0 165V0Z" fill="url(#wave)" />
      </Svg>
    </View>
  );
}

export function FieldLabel({ label, required = false, style }) {
  const { display } = useTheme();
  if (!label) return null;
  return (
    <Text style={[styles.label, { color: display.textSecondary }, style]}>
      {label}
      {required && <Text style={styles.asterisk}> *</Text>}
    </Text>
  );
}

export function PrimaryButton({ title, onPress, loading = false, disabled = false, style }) {
  const inactive = disabled || loading;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={inactive}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={[styles.primaryShadow, inactive && { opacity: 0.6 }, style]}
    >
      <LinearGradient colors={[COLORS.buttonTop, COLORS.buttonBottom]} style={styles.primary}>
        {loading && <ActivityIndicator color="#fff" size="small" />}
        <Text style={styles.primaryText}>{title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

export function OutlineButton({ title, onPress, disabled = false, style }) {
  const { display, isDark } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      style={[
        styles.outline,
        { backgroundColor: isDark ? display.subCardBg : '#fff', borderColor: display.border },
        disabled && { opacity: 0.6 },
        style,
      ]}
    >
      <Text style={[styles.outlineText, { color: display.accent }]}>{title}</Text>
    </TouchableOpacity>
  );
}

export function TextField({ label, required = false, error, secure = false, hint, style, inputRef, prefix, ...props }) {
  const { display } = useTheme();
  const [hidden, setHidden] = useState(secure);
  return (
    <View style={[styles.field, style]}>
      <FieldLabel label={label} required={required} />
      <View style={[styles.inputBox, { backgroundColor: display.cardBg, borderColor: display.border }, !!error && styles.inputError]}>
        {prefix}
        <TextInput
          ref={inputRef}
          style={[styles.input, { color: display.textPrimary }]}
          placeholderTextColor={display.placeholder}
          secureTextEntry={hidden}
          accessibilityLabel={label}
          {...props}
        />
        {secure && (
          <TouchableOpacity
            onPress={() => setHidden(!hidden)}
            hitSlop={10}
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
          >
            {hidden ? <Eye size={18} color={display.placeholder} /> : <EyeOff size={18} color={display.placeholder} />}
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * Interactive Calendar Date Picker Field (no manual text typing required).
 */
export function DatePickerField({
  label,
  required = false,
  value = '',
  onChange,
  error,
  style,
  placeholder = 'Select date of birth',
  defaultToToday = false,
}) {
  const { display, isDark } = useTheme();
  const today = new Date();
  const currentYear = today.getFullYear();

  const initialParts = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value.split('-').map(Number)
    : [defaultToToday ? currentYear : currentYear - 25, today.getMonth() + 1, 1];

  const [open, setOpen] = useState(false);
  const [pickingYear, setPickingYear] = useState(false);
  const [viewYear, setViewYear] = useState(initialParts[0]);
  const [viewMonth, setViewMonth] = useState(initialParts[1] - 1); // 0-indexed

  const openPicker = () => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split('-').map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
    setPickingYear(false);
    setOpen(true);
  };

  const formattedDisplay = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? (() => {
        const [y, m, d] = value.split('-').map(Number);
        return `${MONTHS[m - 1]} ${d}, ${y}`;
      })()
    : '';

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const years = [];
  for (let y = currentYear; y >= 1920; y--) years.push(y);

  const stepMonth = delta => {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 0) {
      nextMonth = 11;
      nextYear -= 1;
    } else if (nextMonth > 11) {
      nextMonth = 0;
      nextYear += 1;
    }
    if (nextYear >= 1920 && nextYear <= currentYear) {
      setViewMonth(nextMonth);
      setViewYear(nextYear);
    }
  };

  const selectDay = day => {
    const picked = new Date(viewYear, viewMonth, day);
    if (picked > today) return;
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    onChange(iso);
    setOpen(false);
  };

  return (
    <View style={[styles.field, style]}>
      <FieldLabel label={label} required={required} />
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={openPicker}
        style={[styles.inputBox, { backgroundColor: display.cardBg, borderColor: display.border }, !!error && styles.inputError]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={[styles.input, { color: formattedDisplay ? display.textPrimary : display.placeholder }]}>
          {formattedDisplay || placeholder}
        </Text>
        <Calendar size={18} color={display.accent} />
      </TouchableOpacity>
      {!!error && <Text style={styles.fieldError}>{error}</Text>}

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={[styles.popup, { backgroundColor: display.cardBg }]}>
            <View style={styles.calHeader}>
              <TouchableOpacity onPress={() => stepMonth(-1)} hitSlop={10} style={[styles.calNavBtn, { backgroundColor: display.subCardBg }]}>
                <ChevronLeft size={20} color={display.textPrimary} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setPickingYear(!pickingYear)} style={[styles.calTitleBtn, { backgroundColor: display.subCardBg }]}>
                <Text style={[styles.calTitleText, { color: display.accent }]}>
                  {MONTHS[viewMonth]} {viewYear} ▾
                </Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => stepMonth(1)} hitSlop={10} style={[styles.calNavBtn, { backgroundColor: display.subCardBg }]}>
                <ChevronRight size={20} color={display.textPrimary} />
              </TouchableOpacity>
            </View>

            {pickingYear ? (
              <ScrollView style={styles.yearList} contentContainerStyle={styles.yearGrid}>
                {years.map(yr => {
                  const active = yr === viewYear;
                  return (
                    <TouchableOpacity
                      key={yr}
                      onPress={() => { setViewYear(yr); setPickingYear(false); }}
                      style={[styles.yearChip, { backgroundColor: active ? display.accent : display.subCardBg, borderColor: display.border }]}
                    >
                      <Text style={[styles.yearChipText, { color: active ? '#fff' : display.textPrimary }]}>{yr}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            ) : (
              <>
                <View style={styles.weekRow}>
                  {WEEKDAYS.map(w => (
                    <Text key={w} style={[styles.weekLabel, { color: display.textSecondary }]}>{w}</Text>
                  ))}
                </View>
                <View style={styles.daysGrid}>
                  {cells.map((day, idx) => {
                    if (!day) return <View key={`empty-${idx}`} style={styles.dayCell} />;
                    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const selected = value === iso;
                    const isFuture = new Date(viewYear, viewMonth, day) > today;
                    return (
                      <TouchableOpacity
                        key={iso}
                        disabled={isFuture}
                        onPress={() => selectDay(day)}
                        style={[styles.dayCell, selected && { backgroundColor: display.accent }, isFuture && { opacity: 0.3 }]}
                      >
                        <Text style={[styles.dayText, { color: selected ? '#fff' : display.textPrimary }]}>{day}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <OutlineButton title="Close" onPress={() => setOpen(false)} style={{ marginTop: 14, height: 42 }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <AlertCircle size={16} color={COLORS.error} />
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

export function Checkbox({ checked, onPress, children, error }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.checkRow}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.checkBox, checked && styles.checkBoxOn, error && !checked && { borderColor: COLORS.error }]}>
        {checked && <Check size={14} color="#fff" strokeWidth={3} />}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </TouchableOpacity>
  );
}

export function BackButton({ onPress, color = '#94A3B8' }) {
  return (
    <TouchableOpacity onPress={onPress} hitSlop={12} accessibilityLabel="Go back" style={styles.back}>
      <ChevronLeft size={26} color={color} />
    </TouchableOpacity>
  );
}

/** Gradient circle used for popup and onboarding icons. */
export function IconBadge({ icon: Icon, size = 64, colors = ['#7DD3FC', COLORS.accent] }) {
  return (
    <LinearGradient colors={colors} style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={size * 0.5} color="#fff" strokeWidth={2} />
    </LinearGradient>
  );
}

/**
 * Centered popup card matching the website dialogs and the design mockups.
 * Pass `children` for scrollable content (e.g. Terms of Service).
 */
export function Popup({
  visible, icon, iconColors, title, message, children, actionLabel = 'Continue', onAction,
  secondaryLabel, onSecondary, onRequestClose, actionLoading = false,
}) {
  const { display } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onRequestClose || onAction} statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.popup, { backgroundColor: display.cardBg }]} accessibilityViewIsModal>
          {icon && <View style={{ alignItems: 'center', marginBottom: 12 }}><IconBadge icon={icon} size={56} colors={iconColors} /></View>}
          {!!title && <Text style={[styles.popupTitle, { color: display.accent }]}>{title}</Text>}
          {!!message && <Text style={[styles.popupMessage, { color: display.textSecondary }]}>{message}</Text>}
          {children}
          <PrimaryButton title={actionLabel} onPress={onAction} loading={actionLoading} style={{ marginTop: 20 }} />
          {!!secondaryLabel && <OutlineButton title={secondaryLabel} onPress={onSecondary} style={{ marginTop: 10 }} />}
        </View>
      </View>
    </Modal>
  );
}

export function OtpCodeInput({ value = '', onChange, error, secondsLeft = 0, resendCooldown = 0, onResend, resending = false }) {
  const { display, isDark } = useTheme();
  const inputRef = React.useRef(null);
  const clean = String(value).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6);
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <View style={{ marginVertical: 8 }}>
      <Text style={[styles.otpTimer, { color: display.accent }]}>{mm}:{ss}</Text>
      <FieldLabel label="Enter Code" required />

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => inputRef.current?.focus()}
        style={styles.otpRow}
      >
        {[0, 1, 2, 3, 4, 5].map(idx => {
          const ch = clean[idx] || '';
          const isCurrent = idx === clean.length || (clean.length === 6 && idx === 5);
          return (
            <View
              key={idx}
              style={[
                styles.otpBox,
                { backgroundColor: display.cardBg, borderColor: display.border },
                isCurrent && { borderColor: display.accent, backgroundColor: isDark ? display.subCardBg : '#F8FCFF' },
                !!error && { borderColor: COLORS.error },
              ]}
            >
              <Text style={[styles.otpChar, { color: display.textPrimary }]}>{ch}</Text>
            </View>
          );
        })}
        <TextInput
          ref={inputRef}
          value={clean}
          onChangeText={txt => onChange(txt.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 6))}
          maxLength={6}
          autoCapitalize="characters"
          autoCorrect={false}
          keyboardType="default"
          textContentType="oneTimeCode"
          style={styles.otpHiddenInput}
        />
      </TouchableOpacity>

      {!!error && <Text style={[styles.fieldError, { textAlign: 'center', marginTop: 8 }]}>{error}</Text>}

      <View style={styles.otpResendRow}>
        <Text style={[authText.small, { color: display.textSecondary }]}>Didn't Receive the OTP? </Text>
        {resendCooldown > 0 ? (
          <Text style={[authText.small, { color: display.textSecondary }]}>Resend in {resendCooldown}s</Text>
        ) : (
          <TouchableOpacity onPress={onResend} disabled={resending} hitSlop={8}>
            <Text style={[authText.small, authText.link]}>{resending ? 'Sending...' : 'Resend'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/** Keyboard-aware scrolling page with theme-aware background. */
export function AuthScreen({ children, wave = false, contentStyle, footer }) {
  const { display } = useTheme();
  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: display.bg }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {wave && <WaveHeader />}
      <ScrollView contentContainerStyle={[styles.scroll, contentStyle]} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
      {footer && <View style={[styles.footer, { backgroundColor: display.bg }]}>{footer}</View>}
    </KeyboardAvoidingView>
  );
}

export const authText = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', color: COLORS.heading, textAlign: 'center', lineHeight: 34 },
  subtitle: { fontSize: 14, color: COLORS.muted, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  link: { color: COLORS.accent, fontWeight: '600' },
  small: { fontSize: 13, color: COLORS.muted, textAlign: 'center' },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#fff' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 32 },
  footer: { paddingHorizontal: 24, paddingBottom: 32, paddingTop: 12, backgroundColor: '#fff' },
  wave: { position: 'absolute', top: 0, left: 0, right: 0 },
  logoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  logoText: { fontWeight: '700', color: COLORS.brand, letterSpacing: -0.5 },
  primaryShadow: {
    borderRadius: 999,
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.36, shadowRadius: 10, elevation: 4,
  },
  primary: { height: 48, borderRadius: 999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  outline: { height: 48, borderRadius: 999, borderWidth: 1.5, borderColor: COLORS.buttonTop, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  outlineText: { color: COLORS.accent, fontSize: 16, fontWeight: '600' },
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '500', color: COLORS.muted, marginBottom: 6, letterSpacing: 0.2 },
  asterisk: { color: COLORS.error, fontWeight: '700' },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', height: 46, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: '#fff', paddingHorizontal: 12, gap: 8,
  },
  inputError: { borderColor: COLORS.error },
  input: { flex: 1, fontSize: 15, color: '#1E293B', paddingVertical: 0 },
  fieldError: { color: COLORS.error, fontSize: 12, marginTop: 4 },
  hint: { color: '#94A3B8', fontSize: 12, marginTop: 4 },
  banner: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', padding: 12, borderRadius: 12, marginBottom: 16,
    backgroundColor: COLORS.errorBg, borderWidth: 1, borderColor: COLORS.errorBorder,
  },
  bannerText: { flex: 1, color: COLORS.error, fontSize: 13, lineHeight: 18 },
  checkRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 8 },
  checkBox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkBoxOn: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  back: { position: 'absolute', top: 52, left: 16, zIndex: 10, padding: 4 },
  overlay: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  popup: {
    width: '100%', maxWidth: 380, backgroundColor: COLORS.surface, borderRadius: 24, padding: 24,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 12,
  },
  popupTitle: { fontSize: 18, fontWeight: '700', color: COLORS.accent, textAlign: 'center' },
  popupMessage: { fontSize: 14, color: COLORS.text, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  calNavBtn: { padding: 6, borderRadius: 8, backgroundColor: '#EAF6FE' },
  calTitleBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#EAF6FE' },
  calTitleText: { fontSize: 15, fontWeight: '700', color: COLORS.accent },
  weekRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 6 },
  weekLabel: { width: '14.28%', textAlign: 'center', fontSize: 12, fontWeight: '600', color: COLORS.muted },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  dayCellSelected: { backgroundColor: COLORS.accent },
  dayText: { fontSize: 13.5, color: COLORS.heading, fontWeight: '500' },
  dayTextSelected: { color: '#fff', fontWeight: '700' },
  yearList: { maxHeight: 240 },
  yearGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', paddingVertical: 8 },
  yearChip: { width: '28%', paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', backgroundColor: '#fff' },
  yearChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  yearChipText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },
  yearChipTextActive: { color: '#fff', fontWeight: '700' },
  otpTimer: { fontSize: 14, fontWeight: '700', color: COLORS.accent, textAlign: 'center', marginBottom: 16 },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, position: 'relative' },
  otpBox: {
    flex: 1, height: 52, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  otpBoxActive: { borderColor: COLORS.accent, backgroundColor: '#F8FCFF' },
  otpChar: { fontSize: 20, fontWeight: '700', color: COLORS.heading },
  otpHiddenInput: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, opacity: 0.01, fontSize: 1,
  },
  otpResendRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 18 },
});
