export function localDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
}

export function feeScheduleStatus(schedule, schedules, today = localDate()) {
  if (schedule.effectiveFrom > today) return 'Upcoming'
  if (schedule.effectiveTo && today >= schedule.effectiveTo) return 'Expired'
  const newer = schedules.some(s => s.facilityId === schedule.facilityId && s.insuranceId === schedule.insuranceId
    && s.effectiveFrom <= today && (!s.effectiveTo || today < s.effectiveTo)
    && s.effectiveFrom > schedule.effectiveFrom)
  return newer ? 'Superseded' : 'Active'
}

export function buildFeeForm(procedures, schedules, schedule, today = localDate()) {
  const standard = schedules.filter(s => !s.insuranceId && s.effectiveFrom <= today && (!s.effectiveTo || today < s.effectiveTo))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]
  // Keep any stored procedure even if a catalog row is unavailable.
  const catalog = [...procedures]
  for (const item of schedule?.procedureFees || []) {
    if (!catalog.some(p => String(p.id) === String(item.code))) catalog.push({ id: item.code, description: `Procedure ${item.code}`, price: 0, officeFee: 0 })
  }
  return {
    id: schedule?.id ?? null, scheduleName: schedule?.scheduleName || '',
    insuranceId: schedule?.insuranceId || '', effectiveFrom: schedule?.effectiveFrom || today,
    effectiveTo: schedule?.effectiveTo || '',
    procedureFees: catalog.map(p => {
      const saved = schedule?.procedureFees.find(i => String(i.code) === String(p.id))
      const standardPrice = standard?.procedureFees.find(i => String(i.code) === String(p.id))?.scheduleFee
      const referenceFee = standardPrice ?? Number((Number(p.price) + Number(p.officeFee)).toFixed(2))
      return { code: p.id, name: p.description, referenceFee,
        included: schedule ? !!saved : true, scheduleFee: String(saved?.scheduleFee ?? referenceFee) }
    })
  }
}

export function feeFormPayload(form) {
  if (!form.scheduleName.trim()) throw new Error('Enter a schedule name.')
  if (!form.effectiveFrom || (form.effectiveTo && form.effectiveTo <= form.effectiveFrom)) throw new Error('End date must be later than the required start date.')
  const items = form.procedureFees.filter(p => p.included)
  if (!items.length) throw new Error('Include at least one procedure.')
  for (const item of items) {
    if (!/^\d+(\.\d{1,2})?$/.test(String(item.scheduleFee)) || !Number.isFinite(Number(item.scheduleFee)) || Number(item.scheduleFee) > 9999999999.99) {
      throw new Error(`Enter a non-negative price with at most two decimal places for ${item.name}.`)
    }
  }
  return { ...form, scheduleName: form.scheduleName.trim(), procedureFees: items.map(p => ({ code: p.code, scheduleFee: p.scheduleFee })) }
}
