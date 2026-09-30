import { Redirect } from 'expo-router';

/** Product inventory moved to Admin website. */
export default function EditProductRedirect() {
  return <Redirect href="/(tabs)/orders" />;
}
