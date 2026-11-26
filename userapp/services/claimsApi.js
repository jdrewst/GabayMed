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

export const CLAIM_STATUS_LABELS = {
  SUBMITTED: 'Submitted',
  IN_REVIEW: 'In Review',
  APPROVED: 'Approved',
  PAID: 'Paid',
  DENIED: 'Denied',
};

export function formatPeso(value) {
  const n = Number(value) || 0;
  return `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const ClaimsAPI = {
  /**
   * Fetch submitted digital claims, status summary, and eligible charges for the logged-in patient.
   * @param {{ status?: 'SUBMITTED'|'IN_REVIEW'|'APPROVED'|'DENIED' }} options
   */
  async getMyClaims(options = {}) {
    const token = await Session.getAccessToken();
    if (!token) throw new Error('Please log in again to view your digital claims.');

    const query = options.status ? `?status=${encodeURIComponent(options.status)}` : '';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await fetch(`${API_URL}/api/patient-claims${query}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
    } catch {
      throw new Error('Unable to reach the claims service. Check your connection and try again.');
    } finally {
      clearTimeout(timer);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Unable to load your claims.');
    }

    return {
      summary: data.summary || {
        totalClaims: 0, submitted: 0, inReview: 0, approved: 0, denied: 0,
        totalClaimedAmount: 0, eligibleCount: 0,
      },
      claims: Array.isArray(data.claims) ? data.claims : [],
      eligibleCharges: Array.isArray(data.eligibleCharges) ? data.eligibleCharges : [],
      insurancePlans: Array.isArray(data.insurancePlans) ? data.insurancePlans : [],
    };
  },

  /**
   * Submit a digital claim for an eligible healthcare charge.
   * @param {{ ledgerId: string|number, insuranceId?: string|number, notes?: string }} payload
   */
  async submitClaim(payload) {
    const token = await Session.getAccessToken();
    if (!token) throw new Error('Please log in again to submit a claim.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);

    let response;
    try {
      response = await fetch(`${API_URL}/api/patient-claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch {
      throw new Error('Unable to reach the claims service. Check your connection and try again.');
    } finally {
      clearTimeout(timer);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Unable to submit your claim.');
    }

    return data;
  },
};

export default ClaimsAPI;
