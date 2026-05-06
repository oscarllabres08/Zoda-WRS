import { Redirect } from 'expo-router';

/** Legacy route — loyalty lives on the Vouchers tab now. */
export default function LoyaltyRedirectScreen() {
  return <Redirect href="/rewards" />;
}
