import { Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../theme';
import { Text } from './Text';
import { Button } from './Button';

type Props = {
  visible: boolean;
  onDismiss: () => void;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
};

export function LogoutConfirmModal({ visible, onDismiss, onConfirm, busy = false }: Props) {
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
        <Pressable onPress={() => {}} style={{ borderRadius: theme.radius.xl, backgroundColor: theme.colors.card, borderWidth: 1, borderColor: theme.colors.border, padding: theme.spacing.lg, ...theme.shadow.card }}>
          <View style={{ alignItems: 'center', marginBottom: theme.spacing.sm }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: 'rgba(239,68,68,0.10)',
                borderWidth: 1,
                borderColor: 'rgba(239,68,68,0.22)',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="log-out-outline" size={26} color={theme.colors.danger} />
            </View>
            <Text variant="h2" weight="extrabold" style={{ textAlign: 'center', marginTop: theme.spacing.md }}>
              Log out?
            </Text>
            <Text variant="muted" weight="semibold" style={{ textAlign: 'center', marginTop: 10, lineHeight: 20 }}>
              Are you sure you want to log out? You will need to sign in again to manage orders and your store.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: theme.spacing.md }}>
            <View style={{ flex: 1 }}>
              <Button variant="ghost" title="Cancel" disabled={busy} onPress={() => !busy && onDismiss()} />
            </View>
            <View style={{ flex: 1 }}>
              <Button variant="danger" title={busy ? 'Logging out…' : 'Log out'} disabled={busy} onPress={() => void onConfirm()} />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
