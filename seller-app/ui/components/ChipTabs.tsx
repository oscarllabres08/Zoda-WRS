import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { theme } from '../theme';
import { PrimaryGradient } from './PrimaryGradient';
import { Text } from './Text';

export type ChipTab = { key: string; label: string };

export function ChipTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: ChipTab[];
  value: string;
  onChange: (key: string) => void;
}) {
  const chipRadius = 10; // boxy, slightly rounded
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 6 }}>
        {tabs.map((t) => {
          const active = t.key === value;
          return (
            <Pressable
              key={t.key}
              onPress={() => onChange(t.key)}
              style={{
                minHeight: 40,
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: chipRadius,
                borderWidth: 1,
                borderColor: active ? theme.colors.primaryDark : theme.colors.border,
                backgroundColor: active ? theme.colors.bgTint : theme.colors.card,
                justifyContent: 'center',
              }}
            >
              <Text
                variant="chip"
                weight="extrabold"
                style={{ color: active ? theme.colors.primaryDark : theme.colors.muted }}
              >
                {t.label}
              </Text>
              {active ? (
                <Animated.View
                  entering={FadeIn.duration(150)}
                  exiting={FadeOut.duration(120)}
                  style={{
                    height: 3,
                    marginTop: 6,
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <PrimaryGradient />
                </Animated.View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
