import { ScrollView, View } from 'react-native';

import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { TextField } from '../../../ui/components/TextField';
import { theme } from '../../../ui/theme';

export default function HelpCenterScreen() {
  return (
    <Screen safeAreaEdges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ paddingBottom: theme.spacing.xl }}>
        <Text variant="muted" weight="semibold" style={{ marginTop: 4 }}>
          Contact developer support if you need help.
        </Text>

        <View style={{ marginTop: theme.spacing.md }}>
          <Card>
            <View style={{ gap: 10 }}>
              <TextField label="Developer name" value="Zoda WRS Dev Team" editable={false} />
              <TextField label="Email" value="aquabeastwrs.dev@gmail.com" editable={false} />
              <TextField label="Phone" value="+63 912 345 6789" editable={false} />
            </View>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}
