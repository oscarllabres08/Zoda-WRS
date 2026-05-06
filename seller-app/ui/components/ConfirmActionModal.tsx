import { Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../theme';
import { Text } from './Text';
import { Button } from './Button';

type IonicName = keyof typeof Ionicons.glyphMap;

type Tone = 'primary' | 'warning' | 'success';

const toneRing: Record<Tone, { bg: string; border: string; icon: string }> = {
  primary: {
    bg: 'rgba(18,101,214,0.10)',
    border: 'rgba(18,101,214,0.22)',
    icon: theme.colors.primary,
  },
  warning: {
    bg: 'rgba(245,158,11,0.14)',
    border: 'rgba(245,158,11,0.38)',
    icon: theme.colors.warning,
  },
  success: {
    bg: 'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.28)',
    icon: theme.colors.success,
  },
};

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: IonicName;
  tone?: Tone;
  /** 'confirm' = cancel + confirm; 'alert' = single OK-style button */
  variant?: 'confirm' | 'alert';
  busy?: boolean;
  onDismiss: () => void;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmActionModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  icon = 'help-circle-outline',
  tone = 'primary',
  variant = 'confirm',
  busy = false,
  onDismiss,
  onConfirm,
}: Props) {
  const ring = toneRing[tone];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && onDismiss()}>
      <Pressable
        onPress={() => !busy && onDismiss()}
        style={{
          flex: 1,
          backgroundColor: 'rgba(11,27,58,0.48)',
          justifyContent: 'center',
          padding: theme.spacing.md,
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            maxWidth: 400,
            width: '100%',
            alignSelf: 'center',
            borderRadius: theme.radius.xl,
            backgroundColor: theme.colors.card,
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: theme.spacing.lg,
            ...theme.shadow.card,
          }}
        >
          <Pressable onPress={() => !busy && onDismiss()} hitSlop={12} style={{ position: 'absolute', right: 12, top: 12, zIndex: 1 }}>
            <Ionicons name="close" size={22} color={theme.colors.muted} />
          </Pressable>

          <View style={{ alignItems: 'center', marginBottom: theme.spacing.sm, paddingHorizontal: theme.spacing.sm }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: ring.bg,
                borderWidth: 1,
                borderColor: ring.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={icon} size={26} color={ring.icon} />
            </View>
            <Text variant="h2" weight="extrabold" style={{ textAlign: 'center', marginTop: theme.spacing.md }}>
              {title}
            </Text>
            <Text variant="muted" weight="semibold" style={{ textAlign: 'center', marginTop: 10, lineHeight: 20 }}>
              {message}
            </Text>
          </View>

          {variant === 'alert' ? (
            <View style={{ marginTop: theme.spacing.md }}>
              <Button title={confirmLabel} disabled={busy} onPress={() => void onConfirm()} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: theme.spacing.md }}>
              <View style={{ flex: 1 }}>
                <Button variant="ghost" title={cancelLabel} disabled={busy} onPress={() => !busy && onDismiss()} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  title={busy ? 'Please wait…' : confirmLabel}
                  disabled={busy}
                  onPress={() => void onConfirm()}
                />
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
