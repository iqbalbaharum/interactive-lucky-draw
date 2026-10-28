export function normalizeIc(value: string) { return value.replace(/\D/g, ''); }

export function normalizePhone(value: string) {
  let phone = value.replace(/[\s()-]/g, '');
  if (phone.startsWith('+60')) phone = `0${phone.slice(3)}`;
  if (phone.startsWith('60')) phone = `0${phone.slice(2)}`;
  return phone;
}

export function validateParticipant(input: { fullName?: unknown; phone?: unknown; icNumber?: unknown }) {
  const fullName = typeof input.fullName === 'string' ? input.fullName.trim().replace(/\s+/g, ' ') : '';
  const phone = typeof input.phone === 'string' ? normalizePhone(input.phone) : '';
  const icNumber = typeof input.icNumber === 'string' ? normalizeIc(input.icNumber) : '';
  const errors: Record<string, string> = {};
  if (fullName.length < 2 || fullName.length > 120) errors.fullName = 'Enter your full name.';
  if (!/^01\d{7,9}$/.test(phone)) errors.phone = 'Enter a valid Malaysian mobile number.';
  if (!/^\d{12}$/.test(icNumber)) errors.icNumber = 'Enter a 12-digit Malaysian IC number.';
  return { fullName, phone, icNumber, errors, valid: Object.keys(errors).length === 0 };
}

export function maskPhone(phone: string) { return `${phone.slice(0, 3)} •• ••• ${phone.slice(-4)}`; }
