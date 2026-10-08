export const LEGAL_LAST_UPDATED = 'October 8, 2026';
export const LEGAL_VERSION = '1.0';

export type LegalSection = {
  heading: string;
  body: string;
};

/** Short summary shown on first app open before login. */
export const LEGAL_WELCOME_SUMMARY: string[] = [
  'We collect your name, contact number, delivery address, and optional GPS location to process and deliver your orders.',
  'We may store profile photo, payment method, payment reference, and payment proof screenshots for GCash/Maya orders.',
  'Order updates may be sent through push notifications if you enable them on your device.',
  'Your data is stored securely and shared only with Zoda WRS staff to fulfill your orders.',
  'You can read the full Terms & Conditions and Privacy Policy below before continuing.',
];

export const TERMS_OF_SERVICE: LegalSection[] = [
  {
    heading: '1. About Zoda WRS',
    body:
      'The Zoda WRS Customer App (“App”) is operated by Zoda Water Refilling Station (“we”, “us”, “our”). By creating an account or placing an order, you agree to these Terms & Conditions.',
  },
  {
    heading: '2. Account & eligibility',
    body:
      'You must provide accurate name, contact number, delivery address, and email. You are responsible for keeping your login credentials secure and for all activity under your account.',
  },
  {
    heading: '3. Orders & delivery',
    body:
      'Orders are subject to product availability, store operating hours, and delivery capacity. Prices, delivery fees, and payment methods shown in the App are set by the store. We may confirm, prepare, or cancel orders when necessary (for example, stock issues or invalid payment proof).',
  },
  {
    heading: '4. Payments',
    body:
      'Supported payment methods may include cash on delivery, GCash, Maya, or store-approved options. For online payments, you may be asked to upload a payment screenshot. False or invalid payment proof may result in order cancellation.',
  },
  {
    heading: '5. Borrowed containers',
    body:
      'If you borrow water containers, you agree to return them in good condition within the agreed time. Outstanding container balances may be tracked in the App.',
  },
  {
    heading: '6. Acceptable use',
    body:
      'Do not misuse the App, submit false information, harass staff, or attempt unauthorized access to our systems. We may suspend or terminate accounts that violate these terms.',
  },
  {
    heading: '7. Limitation of liability',
    body:
      'The App is provided to help you order from Zoda WRS. To the extent permitted by law, we are not liable for indirect losses, delays caused by factors outside our control, or issues arising from inaccurate information you provide.',
  },
  {
    heading: '8. Changes',
    body:
      'We may update these Terms from time to time. Continued use of the App after updates means you accept the revised Terms.',
  },
  {
    heading: '9. Contact',
    body: 'Questions about these Terms: aquabeastwrs.dev@gmail.com · +63 906 681 2820',
  },
];

export const PRIVACY_POLICY: LegalSection[] = [
  {
    heading: '1. Overview',
    body:
      'We respect your privacy. This Privacy Policy explains what personal data we collect through the Zoda WRS Customer App, why we collect it, and how we use and protect it.',
  },
  {
    heading: '2. Data we collect',
    body:
      '• Account: name, email, phone number, delivery address\n• Optional: profile photo, GPS location (when you tap “Use Current Location”)\n• Orders: items, notes, payment method, payment reference, payment proof images\n• Device: push notification token (if you enable notifications)\n• Technical: basic app usage needed to operate the service',
  },
  {
    heading: '3. How we use your data',
    body:
      'We use your information to create and manage your account, process and deliver orders, communicate order updates, calculate delivery fees, manage loyalty rewards, prevent fraud, and improve our service.',
  },
  {
    heading: '4. Location data',
    body:
      'Location is collected only when you choose to share it (for delivery or saved address). You can continue ordering with address text only if GPS is unavailable.',
  },
  {
    heading: '5. Sharing of data',
    body:
      'Order and contact details are shared with Zoda WRS store staff so they can fulfill your delivery. We use Supabase for secure database and file storage. We do not sell your personal data to third parties.',
  },
  {
    heading: '6. Data retention',
    body:
      'We keep account and order records while your account is active and as needed for business, legal, and accounting purposes. Old orders may be removed periodically according to store policy.',
  },
  {
    heading: '7. Your choices',
    body:
      'You may update your profile in the App, disable notifications on your device, or request account deletion by contacting us. You may decline location permission, though some features (distance-based delivery fee) may be limited.',
  },
  {
    heading: '8. Security',
    body:
      'We use industry-standard measures including encrypted connections and access controls. No method of transmission over the internet is 100% secure.',
  },
  {
    heading: '9. Children',
    body: 'The App is not intended for children under 13 without parental consent.',
  },
  {
    heading: '10. Contact & data requests',
    body:
      'For privacy questions or to request correction/deletion of your data: aquabeastwrs.dev@gmail.com · +63 906 681 2820',
  },
];
