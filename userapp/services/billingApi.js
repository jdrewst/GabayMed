import Constants from 'expo-constants';
import { Platform } from 'react-native';
import Session from './session';

function resolveApiUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(window.location.origin)) {
    return window.location.origin;
  }
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    Constants.manifest?.debuggerHost;
  if (hostUri) {
    const lanHost = hostUri.split(':')[0];
    if (lanHost && lanHost !== 'localhost' && lanHost !== '127.0.0.1') {
      return `http://${lanHost}:3000`;
    }
  }
  return Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
}

const API_URL = resolveApiUrl();

export const PAYMENT_STATUS_LABELS = {
  PAID: 'Paid',
  PARTIALLY_PAID: 'Partially Paid',
  UNPAID: 'Unpaid',
  OVERDUE: 'Overdue',
  WAIVED: 'Waived',
};

export function formatPeso(value) {
  const n = Number(value) || 0;
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const BillingAPI = {
  /**
   * Fetch the logged-in patient's transaction history, charge breakdowns and payment statuses.
   * The backend identifies the patient from the access token, so no patient ID is sent.
   * @param {{ status?: 'UNPAID'|'PARTIALLY_PAID'|'PAID'|'OUTSTANDING' }} options
   */
  async getMyBilling(options = {}) {
    const token = await Session.getAccessToken();
    if (!token) throw new Error('Please log in again to view your billing.');

    const query = options.status ? `?status=${encodeURIComponent(options.status)}` : '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await fetch(`${API_URL}/api/patient-billing${query}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } catch (error) {
      throw new Error('Unable to reach the billing service. Check your connection and try again.');
    } finally {
      clearTimeout(timer);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Unable to load your billing records.');
    }

    return {
      summary: data.summary || {
        totalCharges: 0, totalCoverage: 0, totalPayable: 0, totalPaid: 0,
        outstandingBalance: 0, counts: { paid: 0, partiallyPaid: 0, unpaid: 0 },
      },
      charges: Array.isArray(data.charges) ? data.charges : [],
      payments: Array.isArray(data.payments) ? data.payments : [],
      transactions: Array.isArray(data.transactions) ? data.transactions : [],
    };
  },
};

export default BillingAPI;
