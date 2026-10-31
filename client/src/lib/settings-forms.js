const text = value => String(value ?? '').trim()
const number = value => value === '' || value == null ? '' : Number(value)
const list = value => [...new Set((Array.isArray(value) ? value : text(value).split('\n')).map(text).filter(Boolean))]
export const validEmail = value => {
  const email = text(value)
  return email.length <= 254 && /^[^\s@.][^\s@]*@(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,}$/i.test(email)
    && !email.includes('..') && !email.split('@')[0].endsWith('.')
}
export const validPhone = value => {
  const phone = text(value)
  if (!/^[+\d\s().-]+$/.test(phone)) return false
  const compact = phone.replace(/[\s().-]/g, '')
  if (!/^\+?\d{7,15}$/.test(compact) || /^(\d)\1+$/.test(compact.replace('+', ''))) return false
  if (compact.startsWith('09')) return /^09\d{9}$/.test(compact)
  if (compact.startsWith('+63')) return /^\+63[2-9]\d{7,9}$/.test(compact)
  if (compact.startsWith('0')) return /^0[2-8]\d{7,9}$/.test(compact)
  return true
}
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value))
    && new Date(value).toISOString().slice(0, 10) === value
}
export function validateSettingsForm(type, form = {}) {
  const errors = {}
  const required = (key, label, max = 160, min = 1) => {
    const value = text(form[key])
    if (value.length < min) errors[key] = `${label} must contain at least ${min} ${min === 1 ? 'character' : 'characters'}.`
    else if (value.length > max) errors[key] = `${label} must be at most ${max} characters.`
  }
  const numeric = (key, label, min, max, integer = false) => {
    const value = number(form[key])
    if (value === '' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) {
      errors[key] = `${label} must be ${integer ? 'a whole number' : 'a number'} from ${min} to ${max}.`
    } else if (!integer && Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) errors[key] = 'Use at most two decimal places.'
  }
  if (type === 'provider') {
    required('name', 'Full name', 160, 2)
    if (!validEmail(form.email)) errors.email = 'Enter a valid email, such as doctor@clinic.com.'
    required('role', 'Provider type', 80)
    if (text(form.licenseNo).length > 50) errors.licenseNo = 'License number must be at most 50 characters.'
    if (text(form.specialization).length > 160) errors.specialization = 'Specialization must be at most 160 characters.'
    const schedule = form.schedule || {}
    if (!Object.keys(schedule).length) errors.schedule = 'Select at least one working day.'
    for (const hours of Object.values(schedule)) {
      if (!/^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/.test(hours) || hours.split('-')[1] <= hours.split('-')[0]) {
        errors.schedule = 'Each working day must end after its start time.'
      }
    }
  }
  if (type === 'branch') {
    required('name', 'Branch name', 160, 2)
    required('abbreviation', 'Branch code', 30)
    required('address', 'Address', 1000, 5)
    if (!validPhone(form.contact_num)) errors.contact_num = 'Enter a valid phone number, such as 09123456789 or +63 2 8123 4567.'
    if (text(form.email) && !validEmail(form.email)) errors.email = 'Enter a valid email, such as branch@clinic.com.'
  }
  if (type === 'procedure') {
    required('description', 'Description', 160, 2)
    required('category', 'Category', 100)
    for (const [key, label] of [['price', 'Base price'], ['officeFee', 'Office fee'], ['phCaseRate', 'PhilHealth case rate']]) numeric(key, label, 0, 9999999999.99)
    numeric('duration', 'Duration', 1, 1440, true)
  }
  if (type === 'room') {
    required('branch_id', 'Branch')
    required('code', 'Room code', 30)
    required('name', 'Room name', 160, 2)
    if (text(form.floor_location).length > 160) errors.floor_location = 'Floor / location must be at most 160 characters.'
    numeric('patient_capacity', 'Patient capacity', 1, 50, true)
    numeric('turnaround_minutes', 'Turnaround time', 0, 240, true)
    if ((form.equipment || []).length > 50) errors.equipment = 'Add at most 50 equipment items.'
    for (const [index, item] of (form.equipment || []).entries()) {
      if (text(item).length > 160) errors[`equipment.${index}`] = 'Equipment name must be at most 160 characters.'
    }
  }
  if (type === 'fee') {
    required('scheduleName', 'Schedule name')
    if (!validDate(form.effectiveFrom)) errors.effectiveFrom = 'Choose a valid start date.'
    if (form.effectiveTo && (!validDate(form.effectiveTo) || form.effectiveTo <= form.effectiveFrom)) errors.effectiveTo = 'End date must be later than the start date.'
    const included = (form.procedureFees || []).filter(p => p.included)
    if (!included.length) errors.procedureFees = 'Include at least one procedure.'
    for (const item of included) {
      const value = number(item.scheduleFee)
      if (value === '' || !Number.isFinite(value) || value < 0 || value > 9999999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) {
        errors[`price:${item.code}`] = 'Enter a price of 0 or more, with at most two decimal places.'
      }
    }
  }
  return errors
}
export function normalizeSettingsForm(type, form = {}) {
  if (type === 'provider') return { name: text(form.name), email: text(form.email).toLowerCase(), role: text(form.role).toUpperCase(), licenseNo: text(form.licenseNo), specialization: text(form.specialization), schedule: Object.fromEntries(Object.entries(form.schedule || {}).sort()) }
  if (type === 'branch') return { name: text(form.name), abbreviation: text(form.abbreviation).toUpperCase(), address: text(form.address), contact_num: text(form.contact_num).replace(/[\s().-]/g, ''), email: text(form.email).toLowerCase(), is_active: !!form.is_active }
  if (type === 'procedure') return { description: text(form.description), category: text(form.category), price: number(form.price), officeFee: number(form.officeFee), phCaseRate: number(form.phCaseRate), duration: number(form.duration) }
  if (type === 'room') return { branch_id: text(form.branch_id), code: text(form.code).toUpperCase(), name: text(form.name), floor_location: text(form.floor_location), patient_capacity: number(form.patient_capacity), turnaround_minutes: number(form.turnaround_minutes), status: form.status, equipment: list(form.equipment) }
  return { scheduleName: text(form.scheduleName), insuranceId: text(form.insuranceId), effectiveFrom: form.effectiveFrom, effectiveTo: form.effectiveTo || '', procedureFees: (form.procedureFees || []).filter(p => p.included).map(p => ({ code: String(p.code), price: number(p.scheduleFee) })).sort((a, b) => a.code.localeCompare(b.code)) }
}
const labels = { name: 'Name', email: 'Email', role: 'Provider Type', licenseNo: 'License Number', specialization: 'Specialization', schedule: 'Working Schedule', abbreviation: 'Branch Code', address: 'Address', contact_num: 'Phone', is_active: 'Active Branch', description: 'Description', category: 'Category', price: 'Base Price', officeFee: 'Office Fee', phCaseRate: 'PhilHealth Case Rate', duration: 'Duration', branch_id: 'Branch', code: 'Room Code', floor_location: 'Floor / Location', patient_capacity: 'Patient Capacity', turnaround_minutes: 'Turnaround Time', status: 'Status', equipment: 'Equipment', scheduleName: 'Schedule Name', insuranceId: 'Insurance Plan', effectiveFrom: 'Effective From', effectiveTo: 'Effective To' }
function display(value) {
  if (value === '' || value == null) return 'Not set'
  if (typeof value === 'boolean') return value ? 'Active' : 'Inactive'
  if (Array.isArray(value)) return value.join(', ') || 'None'
  if (typeof value === 'object') return Object.entries(value).map(([key, val]) => `${key.toUpperCase()}: ${val}`).join(', ') || 'Not set'
  return String(value)
}
export function settingsChanges(type, before, after) {
  if (!before || !after) return []
  const old = normalizeSettingsForm(type, before), current = normalizeSettingsForm(type, after)
  const optionalFields = { provider: ['licenseNo', 'specialization'], branch: ['email'], room: ['floor_location', 'equipment'], fee: ['effectiveTo'] }
  const empty = value => value == null || value === '' || Array.isArray(value) && value.length === 0
  const changes = Object.keys(current).filter(key => key !== 'procedureFees' && JSON.stringify(old[key]) !== JSON.stringify(current[key]))
    .map(key => ({ field: labels[key] || key, before: display(old[key]), after: display(current[key]),
      ...(optionalFields[type]?.includes(key) && empty(old[key]) ? { action: 'added' }
        : optionalFields[type]?.includes(key) && empty(current[key]) ? { action: 'deleted' } : {}) }))
  if (type === 'fee') {
    const codes = new Set([...old.procedureFees, ...current.procedureFees].map(p => p.code))
    for (const code of codes) {
      const previous = old.procedureFees.find(p => p.code === code), next = current.procedureFees.find(p => p.code === code)
      if (JSON.stringify(previous) !== JSON.stringify(next)) changes.push({ field: after.procedureFees.find(p => String(p.code) === code)?.name || `Procedure ${code}`, before: previous ? display(previous.price) : 'Not included', after: next ? display(next.price) : 'Not included', ...(!previous ? { action: 'added' } : !next ? { action: 'deleted' } : {}) })
    }
  }
  return changes
}
