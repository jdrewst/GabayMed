import { validEmail, validPhone } from './settings-forms.js'
export const ROOM_STATUSES = ['Available', 'In Use', 'Reserved', 'Cleaning', 'Maintenance', 'Inactive']
export const LOGO_MAX_BYTES = 2 * 1024 * 1024

export const newBranchForm = () => ({
  branch_id: null, name: '', abbreviation: '', address: '', contact_num: '',
  email: '', is_active: true
})
export const newRoomForm = branchId => ({
  room_id: null, branch_id: branchId || '', code: '', name: '',
  floor_location: '', patient_capacity: '1', status: 'Available',
  turnaround_minutes: '15', equipment: ['']
})

function required(value, label, max = 160) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > max) throw new Error(`${label} is required and must be at most ${max} characters.`)
  return text
}
function optional(value, label, max = 2000) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (text.length > max) throw new Error(`${label} must be at most ${max} characters.`)
  return text
}
function wholeNumber(value, label, min, max) {
  if (value === '' || value == null || !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max) {
    throw new Error(`${label} must be a whole number from ${min} to ${max}.`)
  }
  return Number(value)
}
export function branchRecord(form) {
  const email = optional(form.email, 'Email', 254)
  if (email && !validEmail(email)) throw new Error('Enter a valid branch email address.')
  if (!validPhone(form.contact_num)) throw new Error('Enter a valid phone number, such as 09123456789 or +63 2 8123 4567.')
  return {
    name: required(form.name, 'Branch name'), abbreviation: required(form.abbreviation, 'Branch code', 30).toUpperCase(),
    address: required(form.address, 'Address', 1000), contact_num: required(form.contact_num, 'Phone', 50),
    email: email || null, is_active: form.is_active === true
  }
}
export function roomRecord(form) {
  if (!form.branch_id) throw new Error('Select a branch.')
  if (!ROOM_STATUSES.includes(form.status)) throw new Error('Select a valid room status.')
  const rawEquipment = Array.isArray(form.equipment) ? form.equipment : String(form.equipment || '').split('\n')
  const equipment = [...new Set(rawEquipment.map(value => value.trim()).filter(Boolean))]
  if (equipment.length > 50 || equipment.some(value => value.length > 160)) throw new Error('Enter up to 50 equipment items, at most 160 characters each.')
  return {
    branch_id: form.branch_id, code: required(form.code, 'Room code', 30).toUpperCase(), name: required(form.name, 'Room name'),
    status: form.status, floor_location: optional(form.floor_location, 'Floor / location', 160),
    patient_capacity: wholeNumber(form.patient_capacity, 'Patient capacity', 1, 50),
    turnaround_minutes: wholeNumber(form.turnaround_minutes, 'Turnaround time', 0, 240), equipment
  }
}

export async function validateLogo(file) {
  const extensions = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }
  if (!file || !extensions[file.type]) throw new Error('Choose a PNG, JPEG, or WebP logo.')
  if (file.size <= 0 || file.size > LOGO_MAX_BYTES) throw new Error('Logo must be no larger than 2 MB.')
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const png = [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
  const webp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  if (!(file.type === 'image/png' && png || file.type === 'image/jpeg' && jpeg || file.type === 'image/webp' && webp)) {
    throw new Error('The file contents do not match the selected image format.')
  }
  return extensions[file.type]
}


export function roomStatusRequest(roomId, status, previousStatus) {
  if (!roomId || !ROOM_STATUSES.includes(status) || !ROOM_STATUSES.includes(previousStatus)) {
    throw new Error('Select a valid room and status.')
  }
  return { p_room_id: roomId, p_status: status, p_previous_status: previousStatus }
}
