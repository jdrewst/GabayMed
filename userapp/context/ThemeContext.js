import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import { Appearance } from 'react-native';
import ProfileAPI, { getDisplayConfig, getAppTranslations } from '../services/profileApi';

const DEFAULT_DISPLAY = {
  isDark: false,
  highContrast: false,
  fontScale: 1,
  bg: '#ffffff',
  cardBg: '#ffffff',
  subCardBg: '#f8fafc',
  textPrimary: '#1f2937',
  textSecondary: '#6b7280',
  border: '#f3f4f6',
  divider: '#f3f4f6',
  inputBg: '#f9fafb',
  inputText: '#1f2937',
  placeholder: '#9ca3af',
  accent: '#0ea5e9',
  statusBarStyle: 'dark',
};

export const ThemeContext = createContext({
  perms: {},
  display: DEFAULT_DISPLAY,
  isDark: false,
  themeMode: 'light',
  language: 'en',
  textSize: 'medium',
  t: getAppTranslations('en'),
  fs: size => size,
  setThemeMode: async () => { },
  setLanguage: async () => { },
  setTextSize: async () => { },
});

export function ThemeProvider({ children }) {
  const [perms, setPerms] = useState(() => ProfileAPI.getCachedPermissions() || {});
  const [colorScheme, setColorScheme] = useState(() => Appearance.getColorScheme());

  useEffect(() => {
    ProfileAPI.getPermissions()
      .then(p => {
        if (p) setPerms(p);
      })
      .catch(() => { });

    const unsubscribe = ProfileAPI.subscribePermissions(next => {
      if (next) setPerms(next);
    });

    const subscription = Appearance.addChangeListener(({ colorScheme: nextScheme }) => {
      setColorScheme(nextScheme);
    });

    return () => {
      unsubscribe();
      subscription?.remove?.();
    };
  }, []);

  const themeMode = perms?.themeMode || 'light';
  const language = perms?.language || 'en';
  const textSize = perms?.textSize || 'medium';

  const display = useMemo(() => {
    return getDisplayConfig(perms);
  }, [perms, colorScheme]);

  const isDark = display.isDark;

  const t = useMemo(() => {
    return getAppTranslations(language);
  }, [language]);

  const fs = useCallback(
    size => Math.round(size * (display.fontScale || 1) * 10) / 10,
    [display.fontScale]
  );

  const setThemeMode = useCallback(async nextMode => {
    setPerms(prev => ({ ...prev, themeMode: nextMode }));
    await ProfileAPI.setPermissions({ themeMode: nextMode });
  }, []);

  const setLanguage = useCallback(async nextLang => {
    setPerms(prev => ({ ...prev, language: nextLang }));
    await ProfileAPI.setPermissions({ language: nextLang });
  }, []);

  const setTextSize = useCallback(async nextSize => {
    setPerms(prev => ({ ...prev, textSize: nextSize }));
    await ProfileAPI.setPermissions({ textSize: nextSize });
  }, []);

  const value = useMemo(
    () => ({
      perms,
      display,
      isDark,
      themeMode,
      language,
      textSize,
      t,
      fs,
      setThemeMode,
      setLanguage,
      setTextSize,
    }),
    [perms, display, isDark, themeMode, language, textSize, t, fs, setThemeMode, setLanguage, setTextSize]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context && context.display) {
    return context;
  }
  const cached = ProfileAPI.getCachedPermissions() || {};
  const display = getDisplayConfig(cached);
  const language = cached.language || 'en';
  const textSize = cached.textSize || 'medium';
  return {
    perms: cached,
    display,
    isDark: display.isDark,
    themeMode: cached.themeMode || 'light',
    language,
    textSize,
    t: getAppTranslations(language),
    fs: s => Math.round(s * (display.fontScale || 1) * 10) / 10,
    setThemeMode: mode => ProfileAPI.setPermissions({ themeMode: mode }),
    setLanguage: lang => ProfileAPI.setPermissions({ language: lang }),
    setTextSize: size => ProfileAPI.setPermissions({ textSize: size }),
  };
}
