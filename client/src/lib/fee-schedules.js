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
    if (!catalog.some(p => String(p.id) === String(item.code))) {
      catalog.push({ 
        id: item.code, 
        description: `Procedure #${item.code}`, 
        phCaseRate: 0,
        price: 0, 
        officeFee: 0 
      })
    }
  }
  return {
    id: schedule?.id ?? null, 
    scheduleName: schedule?.scheduleName || '',
    insuranceId: schedule?.insuranceId || '', 
    effectiveFrom: schedule?.effectiveFrom || today,
    effectiveTo: schedule?.effectiveTo || '',
    procedureFees: catalog.map(p => {
      const saved = schedule?.procedureFees?.find(i => String(i.code) === String(p.id))
      const standardItem = standard?.procedureFees?.find(i => String(i.code) === String(p.id))
      const standardPrice = standardItem?.scheduleFee ?? standardItem?.currentFee

      // Reference Rate: based on the PHcase_rate column of procedures table (fallback to office/base if absent)
      //const phRate = p.phCaseRate ?? p.PHcase_rate ?? p.ph_case_rate
      //const referenceFee = phRate != null 
        //? Number(phRate) 
        //: (standardPrice ?? Number((Number(p.price || 0) + Number(p.officeFee || 0)).toFixed(2)))

      // Current Fee: based on current_fee column of fee_schedule_items table
      let currentFeeVal = saved?.current_fee ?? saved?.currentFee ?? saved?.scheduleFee

      // If not found in saved, check active standard schedule
      if (currentFeeVal == null || Number(currentFeeVal) === 0) {
        currentFeeVal = standardItem?.current_fee ?? standardItem?.currentFee ?? standardItem?.scheduleFee
      }

      // If not in active standard, look across any schedule for this procedure's current_fee
      if (currentFeeVal == null || Number(currentFeeVal) === 0) {
        for (const s of (schedules || [])) {
          const match = s.procedureFees?.find(i => String(i.code) === String(p.id))
          const fee = match?.current_fee ?? match?.currentFee ?? match?.scheduleFee
          if (fee != null && Number(fee) > 0) {
            currentFeeVal = fee
            break
          }
        }
      }

      // If still not found, check procedure's own currentFee (from fee_schedule_items) or price
      if (currentFeeVal == null || Number(currentFeeVal) === 0) {
        const procFee = p.currentFee ?? p.current_fee ?? (p.price != null ? Number(p.price) + Number(p.officeFee || 0) : 0)
        if (procFee != null && Number(procFee) > 0) {
          currentFeeVal = procFee
        }
      }

      const currentFee = Number(currentFeeVal || 0)
      const desc = p.description || p.name || `Procedure #${p.id}`
      const defaultNewFee = saved?.newFee ?? saved?.scheduleFee ?? standardPrice ?? (currentFee > 0 ? currentFee : referenceFee)

      return { 
        code: p.id, 
        name: desc, 
        referenceFee,
        currentFee: Number(currentFee),
        current_fee: Number(currentFee),
        included: schedule ? !!saved : true, 
        scheduleFee: String(defaultNewFee),
        newFee: String(defaultNewFee)
      }
    })
  }
}

export function feeFormPayload(form) {
  if (!form.scheduleName.trim()) throw new Error('Enter a schedule name.')
  if (!form.effectiveFrom || (form.effectiveTo && form.effectiveTo <= form.effectiveFrom)) throw new Error('End date must be later than the required start date.')
  const items = form.procedureFees.filter(p => p.included)
  if (!items.length) throw new Error('Include at least one procedure.')
  for (const item of items) {
    const feeVal = item.newFee ?? item.scheduleFee
    if (!/^\d+(\.\d{1,2})?$/.test(String(feeVal)) || !Number.isFinite(Number(feeVal)) || Number(feeVal) > 9999999999.99) {
      throw new Error(`Enter a non-negative price with at most two decimal places for ${item.name}.`)
    }
  }
  return { 
    ...form, 
    scheduleName: form.scheduleName.trim(), 
    procedureFees: items.map(p => ({ 
      code: p.code, 
      scheduleFee: p.newFee ?? p.scheduleFee,
      newFee: p.newFee ?? p.scheduleFee,
      current_fee: parseFloat(p.newFee ?? p.scheduleFee)
    })) 
  }
}
