import { View } from 'react-native';

import { Text } from './Text';

export function NewOrderBadge() {
  return (
    <View
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: '#EF4444',
        borderWidth: 1,
        borderColor: 'rgba(185,28,28,0.35)',
      }}
    >
      <Text weight="extrabold" style={{ color: '#FFFFFF', fontSize: 10, letterSpacing: 0.6 }}>
        NEW
      </Text>
    </View>
  );
}
