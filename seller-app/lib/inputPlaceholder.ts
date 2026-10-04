const PLACEHOLDER_BY_LABEL: Record<string, string> = {
  Email: 'you@example.com',
  Name: 'Juan Dela Cruz',
  'Full name': 'Your name',
  'Contact number': '09xx xxx xxxx',
  'Phone number': '09xx xxx xxxx',
  Address: 'House no., street, barangay, city',
  'Store address': 'House no., street, barangay, city',
  'Store name': 'Zoda WRS',
  'Business hours': '8:00 AM - 8:00 PM',
  Password: 'Enter your password',
  'Current password': 'Enter current password',
  'New password': 'Enter new password',
  'Confirm password': 'Confirm your password',
  'Voucher code': 'e.g. REF-A1B2C3',
  'Account name': 'Juan Dela Cruz',
  'Account number': '09xx xxx xxxx',
};

export function defaultInputPlaceholder(label: string, editable?: boolean): string | undefined {
  if (editable === false) return undefined;
  const trimmed = label.trim();
  if (!trimmed) return undefined;
  return PLACEHOLDER_BY_LABEL[trimmed] ?? `Enter ${trimmed.toLowerCase()}`;
}
