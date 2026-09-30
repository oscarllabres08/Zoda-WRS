import { View } from 'react-native';

import { Text } from './Text';
import { SellerNotificationsButton } from './SellerNotificationsButton';

export function SellerScreenHeader({
  title = 'Zoda WRS',
  subtitle,
}: {
  title?: string;
  subtitle: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1 }}>
        <Text variant="title" weight="extrabold">
          {title}
        </Text>
        <Text variant="muted" weight="bold" style={{ marginTop: 2 }}>
          {subtitle}
        </Text>
      </View>
      <SellerNotificationsButton />
    </View>
  );
}
