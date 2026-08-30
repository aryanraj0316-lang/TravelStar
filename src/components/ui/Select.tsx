// docs/REMEDIATION.md §9.1 — a single-choice picker built on Sheet, so
// screens stop hand-rolling a Modal plus an option list each time.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { C, MIN_TOUCH_TARGET, fontSize, fontWeight, radii, space } from '@/theme/tokens';
import { Sheet } from './Sheet';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  label?: string;
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  /** Sheet heading; defaults to the field label. */
  title?: string;
}

export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  title,
}: SelectProps<T>) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const shown = selected ? selected.label : (placeholder ?? t('common.selectPlaceholder'));

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        onPress={() => setOpen(true)}
        style={styles.trigger}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}: ${shown}` : shown}
        accessibilityHint={t('common.opensChoiceListHint')}
      >
        <Text style={[styles.triggerText, !selected && styles.triggerPlaceholder]}>{shown}</Text>
        <ChevronDown size={18} color={C.textMuted} />
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title={title ?? label ?? t('common.select')}>
        {options.map((option) => {
          const isSelected = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              style={styles.option}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: isSelected }}
            >
              <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option.label}</Text>
              {isSelected ? <Check size={18} color={C.blueText} /> : null}
            </Pressable>
          );
        })}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[1] },
  label: { color: C.textSec, fontSize: fontSize.sm, fontWeight: fontWeight.medium },
  trigger: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.cardAlt,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: space[4],
  },
  triggerText: { color: C.white, fontSize: fontSize.base },
  triggerPlaceholder: { color: C.textMuted },
  option: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  optionText: { color: C.textSec, fontSize: fontSize.base },
  optionTextSelected: { color: C.white, fontWeight: fontWeight.semibold },
});
