import { Redirect } from 'expo-router';

/** Staff approval moved to Admin website → Staff Management. */
export default function RegistrationsRedirect() {
  return <Redirect href="/(tabs)/profile" />;
}
