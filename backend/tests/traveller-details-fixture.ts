// A filled-in traveller details form (one entry per seat), as the app sends
// it with every booking.
export function travellers(count = 1) {
  return Array.from({ length: count }, (_, i) => ({
    fullName: i === 0 ? 'Test Traveller' : `Companion ${i}`,
    age: 30 + i,
    gender: i % 2 ? 'Female' : 'Male',
    idType: 'PASSPORT',
    idNumber: `P${1234567 + i}`,
    ...(i === 0
      ? { phone: '9876543210', emergencyContactName: 'Emergency Person', emergencyContactPhone: '9123456780' }
      : {}),
  }));
}
