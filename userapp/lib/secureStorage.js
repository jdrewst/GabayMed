import { Platform } from 'react-native';
import * as ExpoSecureStore from 'expo-secure-store';

const SecureStorage = {
  async getItemAsync(key) {
    if (Platform.OS === 'web') {
      try {
        return typeof window !== 'undefined' ? window.localStorage.getItem(key) : null;
      } catch {
        return null;
      }
    }
    return ExpoSecureStore.getItemAsync(key);
  },

  async setItemAsync(key, value) {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined') window.localStorage.setItem(key, String(value));
      } catch {}
      return;
    }
    return ExpoSecureStore.setItemAsync(key, value);
  },

  async deleteItemAsync(key) {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined') window.localStorage.removeItem(key);
      } catch {}
      return;
    }
    return ExpoSecureStore.deleteItemAsync(key);
  },
};

export const getItemAsync = SecureStorage.getItemAsync;
export const setItemAsync = SecureStorage.setItemAsync;
export const deleteItemAsync = SecureStorage.deleteItemAsync;
export default SecureStorage;

