import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { theme } from '../theme';
import { Text } from './Text';

const WEEK_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const;

function padMonthCells(year: number, monthIndex: number): (number | null)[] {
  const firstDow = new Date(year, monthIndex, 1).getDay();
  const dim = new Date(year, monthIndex + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= dim; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function sameLocalDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function startOfLocalDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

type Props = {
  visible: boolean;
  selectedDate: Date;
  minDate?: Date;
  onClose: () => void;
  onSelectDate: (d: Date) => void;
};

export function CalendarPickerModal({ visible, selectedDate, minDate, onClose, onSelectDate }: Props) {
  const [viewYear, setViewYear] = useState(selectedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(selectedDate.getMonth());

  useEffect(() => {
    if (!visible) return;
    setViewYear(selectedDate.getFullYear());
    setViewMonth(selectedDate.getMonth());
  }, [visible, selectedDate]);

  const minLocal = useMemo(() => (minDate ? startOfLocalDay(minDate) : null), [minDate]);

  const cells = useMemo(() => padMonthCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const rows = useMemo(() => {
    const out: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
    return out;
  }, [cells]);

  const label = useMemo(
    () =>
      new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
        month: 'long',
        year: 'numeric',
      }),
    [viewYear, viewMonth]
  );

  const today = new Date();

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function pickDay(day: number) {
    const next = new Date(viewYear, viewMonth, day, 12, 0, 0, 0);
    if (minLocal && startOfLocalDay(next) < minLocal) return;
    onSelectDate(next);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: 'rgba(11,27,58,0.45)',
          justifyContent: 'center',
          padding: theme.spacing.md,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            alignSelf: 'center',
            width: '100%',
            maxWidth: 360,
            borderRadius: 20,
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: theme.colors.border,
            padding: theme.spacing.md,
            ...theme.shadow.card,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: theme.spacing.sm }}>
            <Pressable
              onPress={() => shiftMonth(-1)}
              accessibilityRole="button"
              accessibilityLabel="Previous month"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(18,101,214,0.08)',
              }}
            >
              <Ionicons name="chevron-back" size={22} color={theme.colors.primary} />
            </Pressable>
            <Text variant="h2" weight="extrabold" style={{ flex: 1, textAlign: 'center' }}>
              {label}
            </Text>
            <Pressable
              onPress={() => shiftMonth(1)}
              accessibilityRole="button"
              accessibilityLabel="Next month"
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: 'rgba(18,101,214,0.08)',
              }}
            >
              <Ionicons name="chevron-forward" size={22} color={theme.colors.primary} />
            </Pressable>
          </View>

          <View style={{ flexDirection: 'row', marginBottom: 6 }}>
            {WEEK_LABELS.map((w) => (
              <View key={w} style={{ flex: 1, alignItems: 'center' }}>
                <Text variant="muted" weight="extrabold" style={{ fontSize: 11 }}>
                  {w}
                </Text>
              </View>
            ))}
          </View>

          <View>
            {rows.map((row, ri) => (
              <View key={`r-${ri}`} style={{ flexDirection: 'row' }}>
                {row.map((cell, ci) => {
                  const key = cell === null ? `e-${ri}-${ci}` : `d-${ri}-${ci}-${cell}`;
                  if (cell === null) {
                    return <View key={key} style={{ flex: 1, aspectRatio: 1, maxHeight: 44, padding: 2 }} />;
                  }
                  const cellDate = new Date(viewYear, viewMonth, cell, 12, 0, 0, 0);
                  const isSel = sameLocalDay(cellDate, selectedDate);
                  const isToday = sameLocalDay(cellDate, today);
                  const disabled = !!minLocal && startOfLocalDay(cellDate) < minLocal;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => pickDay(cell)}
                      disabled={disabled}
                      style={{ flex: 1, aspectRatio: 1, maxHeight: 44, padding: 2, opacity: disabled ? 0.35 : 1 }}
                    >
                      <View
                        style={{
                          flex: 1,
                          borderRadius: 12,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isSel ? theme.colors.primary : 'transparent',
                          borderWidth: isToday && !isSel ? 2 : 0,
                          borderColor: isToday && !isSel ? theme.colors.primary : 'transparent',
                        }}
                      >
                        <Text
                          weight="extrabold"
                          style={{
                            fontSize: 14,
                            color: isSel ? '#FFFFFF' : theme.colors.text,
                          }}
                        >
                          {cell}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <Pressable
            onPress={onClose}
            style={{
              marginTop: theme.spacing.md,
              paddingVertical: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.colors.border,
              alignItems: 'center',
              backgroundColor: '#FFFFFF',
            }}
          >
            <Text weight="extrabold" style={{ color: theme.colors.muted }}>
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

