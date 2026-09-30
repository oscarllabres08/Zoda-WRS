import { Redirect } from 'expo-router';

/** Default tab entry → Orders (field ops home). */
export default function TabsIndexRedirect() {
  return <Redirect href="/(tabs)/orders" />;
}
