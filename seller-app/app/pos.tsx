import { Redirect } from 'expo-router';

/** Walk-in POS moved to Admin website. */
export default function PosRedirect() {
  return <Redirect href="/(tabs)/orders" />;
}
