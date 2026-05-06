import { Pressable, ScrollView, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { TextField } from '../../../ui/components/TextField';
import { theme } from '../../../ui/theme';

export default function HelpCenterScreen() {
  const router = useRouter();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => router.back()} style={{ padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: '#fff' }}>
            <Ionicons name="arrow-back" size={20} color={theme.colors.text} />
          </Pressable>
          <View style={{ flex: 1 }} />
        </View>

        <Text variant="title" weight="extrabold" style={{ marginTop: 10 }}>
          Help Center
        </Text>
        <Text variant="muted" weight="semibold" style={{ marginTop: 4 }}>
          Contact developer support if you need help.
        </Text>

        <View style={{ marginTop: theme.spacing.md }}>
          <Card>
            <View style={{ gap: 10 }}>
              <TextField label="Developer name" value="Aquabeast WRS Dev Team" editable={false} />
              <TextField label="Email" value="aquabeastwrs.dev@gmail.com" editable={false} />
              <TextField label="Phone" value="+63 912 345 6789" editable={false} />
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

