const PLACEHOLDER_BY_LABEL: Record<string, string> = {
  Email: 'you@example.com',
  Name: 'Juan Dela Cruz',
  'Contact number': '09xx xxx xxxx',
  'Complete address': 'House no., street, barangay, city',
  Address: 'House no., street, barangay, city',
  Password: 'Enter your password',
  'Current password': 'Enter current password',
  'New password': 'Enter new password',
  'Confirm password': 'Confirm your password',
  'Notes / Instruction (optional)': 'Gate code, landmark, etc.',
  'Utang note (required)': 'E.g. Babayaran sa sweldo, May 15',
  'Utang note (optional)': 'E.g. Babayaran sa sweldo, May 15',
  'GCash reference no.': 'Enter the reference number from GCash',
  'Maya reference no.': 'Enter the reference number from Maya',
};

export function defaultInputPlaceholder(label: string, editable?: boolean): string | undefined {
  if (editable === false) return undefined;
  const trimmed = label.trim();
  if (!trimmed) return undefined;
  return PLACEHOLDER_BY_LABEL[trimmed] ?? `Enter ${trimmed.toLowerCase()}`;
}
