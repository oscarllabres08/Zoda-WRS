import { Redirect } from 'expo-router';

/** Sales reports moved to Admin website. */
export default function SalesReportRedirect() {
  return <Redirect href="/(tabs)/orders" />;
}
