import { ScrollView, View } from 'react-native';

import type { LegalSection } from '../../lib/legalContent';
import { LEGAL_LAST_UPDATED } from '../../lib/legalContent';
import { Screen } from './Screen';
import { Text } from './Text';
import { theme } from '../theme';

type Props = {
  title: string;
  sections: LegalSection[];
};

export function LegalDocumentScreen({ title, sections }: Props) {
  return (
    <Screen style={{ padding: 0 }} safeAreaEdges={['left', 'right', 'bottom']}>
      <ScrollView
        contentContainerStyle={{ padding: theme.spacing.md, paddingBottom: theme.spacing.xl, gap: theme.spacing.sm }}
        showsVerticalScrollIndicator={false}
      >
        <Text variant="muted" weight="semibold" style={{ fontSize: 12 }}>
          Last updated: {LEGAL_LAST_UPDATED}
        </Text>
        {sections.map((section) => (
          <View key={section.heading} style={{ gap: 6 }}>
            <Text weight="extrabold" style={{ fontSize: 15, color: theme.colors.primaryDark }}>
              {section.heading}
            </Text>
            <Text variant="muted" style={{ lineHeight: 22, fontSize: 14 }}>
              {section.body}
            </Text>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
