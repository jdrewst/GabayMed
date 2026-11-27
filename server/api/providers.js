const { createClient } = require('@supabase/supabase-js');
const { createProviderAccount, resetProviderPassword, syncProviderEmail, changeOwnPassword } = require('../lib/provider-accounts');
const { isAllowedOrigin } = require('../lib/origin');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  if (origin) {
    if (!isAllowedOrigin(origin, req.headers.host)) {
      return res.status(403).json({ error: 'Origin is not allowed.' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(503).json({ error: 'Provider account creation is not configured on the server.' });
  }
  try {
    const token = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || '')?.[1];
    const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    if (req.body?.action === 'reset_password') {
      const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await resetProviderPassword(admin, token, req.body, { auth });
      return res.status(200).json(result);
    }
    if (req.body?.action === 'change_own_password') {
      const auth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await changeOwnPassword(admin, auth, token, req.body);
      return res.status(200).json(result);
    }
    if (req.body?.action === 'sync_email') {
      const result = await syncProviderEmail(admin, token, req.body);
      return res.status(200).json(result);
    }
    if (req.body?.action === 'update_insurance_plan') {
      if (!token) return res.status(401).json({ error: 'Authentication required.' });
      const { data: { user }, error: authErr } = await admin.auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Invalid session.' });
      const { planId, planData } = req.body;
      if (!planId || !planData?.planName) return res.status(400).json({ error: 'Plan ID and Plan Name are required.' });
      const { data: updated, error: updErr } = await admin
        .from('insurance_plans')
        .update({
          plan_name: planData.planName,
          type: planData.type,
          renewal_month: planData.renewalMonth,
          deductible: planData.deductible,
          max_limit: planData.maxLimit,
          copay_amount: planData.coPayAmount,
          copay_type: planData.coPayType
        })
        .eq('insurance_id', planId)
        .select();
      if (updErr) return res.status(400).json({ error: updErr.message });
      return res.status(200).json({ success: true, data: updated?.[0] || null });
    }
    if (req.body?.action === 'update_insurance_carrier') {
      if (!token) return res.status(401).json({ error: 'Authentication required.' });
      const { data: { user }, error: authErr } = await admin.auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Invalid session.' });
      const { carrierId, carrierData } = req.body;
      if (!carrierId || !carrierData?.carrierName) return res.status(400).json({ error: 'Carrier ID and Carrier Name are required.' });
      const { data: updated, error: updErr } = await admin
        .from('carrier')
        .update({
          name: carrierData.carrierName,
          street_address: carrierData.streetAddress,
          city: carrierData.city,
          province: carrierData.province,
          zip_code: carrierData.zipCode,
          payer_id: carrierData.payerId,
          accreditation_number: carrierData.accreditationNumber,
          accreditation_expiration: carrierData.expirationDate,
          type: carrierData.planName
        })
        .eq('carrier_id', carrierId)
        .select();
      if (updErr) return res.status(400).json({ error: updErr.message });
      return res.status(200).json({ success: true, data: updated?.[0] || null });
    }
    if (req.body?.action === 'delete_insurance_plan') {
      if (!token) return res.status(401).json({ error: 'Authentication required.' });
      const { data: { user }, error: authErr } = await admin.auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Invalid session.' });
      const { planId } = req.body;
      if (!planId) return res.status(400).json({ error: 'Plan ID is required.' });
      const { error: delErr } = await admin
        .from('insurance_plans')
        .delete()
        .eq('insurance_id', planId);
      if (delErr) {
        if (delErr.code === '23503') {
          return res.status(400).json({ error: 'This plan is linked to patient insurance records or fee schedules and cannot be deleted.' });
        }
        return res.status(400).json({ error: delErr.message });
      }
      return res.status(200).json({ success: true, id: planId });
    }
    if (req.body?.action === 'delete_insurance_carrier') {
      if (!token) return res.status(401).json({ error: 'Authentication required.' });
      const { data: { user }, error: authErr } = await admin.auth.getUser(token);
      if (authErr || !user) return res.status(401).json({ error: 'Invalid session.' });
      const { carrierId } = req.body;
      if (!carrierId) return res.status(400).json({ error: 'Carrier ID is required.' });
      // Delete associated insurance_plans first if none are referenced by patients/schedules
      await admin.from('insurance_plans').delete().eq('carrier_id', carrierId);
      const { error: delErr } = await admin
        .from('carrier')
        .delete()
        .eq('carrier_id', carrierId);
      if (delErr) {
        if (delErr.code === '23503') {
          return res.status(400).json({ error: 'This carrier has plans linked to patient insurance records or fee schedules and cannot be deleted.' });
        }
        return res.status(400).json({ error: delErr.message });
      }
      return res.status(200).json({ success: true, id: carrierId });
    }
    const result = await createProviderAccount(admin, token, req.body);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(error.status || 500).json({ error: error.status ? error.message : 'Provider account creation failed.' });
  }
};
