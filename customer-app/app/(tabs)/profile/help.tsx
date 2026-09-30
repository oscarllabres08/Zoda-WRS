import { ScrollView, View } from 'react-native';

import { Screen } from '../../../ui/components/Screen';
import { Card } from '../../../ui/components/Card';
import { Text } from '../../../ui/components/Text';
import { TextField } from '../../../ui/components/TextField';
import { theme } from '../../../ui/theme';

export default function HelpCenterScreen() {
  return (
    <Screen style={{ padding: 0 }} safeAreaEdges={['left', 'right']}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xl }}>
        <Card>
          <Text variant="muted" style={{ marginTop: 4 }}>
            Contact developer support if you need help.
          </Text>
          <View style={{ marginTop: 12, gap: 10 }}>
            <TextField label="Developer name" value="Zoda WRS Dev Team" editable={false} />
            <TextField label="Email" value="aquabeastwrs.dev@gmail.com" editable={false} />
            <TextField label="Phone" value="+63 906 681 2820" editable={false} />
          </View>
        </Card>
      </ScrollView>
    </Screen>
  );
}
