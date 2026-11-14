import React, { useState } from 'react';
import {
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  type NumberInputProps
} from '@chakra-ui/react';

type AdminNumberInputProps = Omit<NumberInputProps, 'value' | 'onChange'> & {
  value: number | undefined;
  fallbackValue: number;
  onChange: (value: number) => void;
};

/**
 * 管理端受控数值输入框：编辑期间保留字符串草稿，支持顺畅输入小数（如 0.5）、0 与退格清空；
 * 非编辑态直接映射外部受控值，失焦时若草稿为空或非法则回落到 fallbackValue。
 */
const AdminNumberInput = ({
  value,
  fallbackValue,
  onChange,
  min,
  max,
  ...rest
}: AdminNumberInputProps) => {
  const resolvedValue = typeof value === 'number' && Number.isFinite(value) ? value : fallbackValue;
  const [draft, setDraft] = useState<string | null>(null);
  const displayValue = draft ?? String(resolvedValue);

  return (
    <NumberInput
      variant={'whiteOutline'}
      min={min}
      max={max}
      {...rest}
      value={displayValue}
      onChange={(valueAsString, valueAsNumber) => {
        setDraft(valueAsString);
        if (valueAsString.trim() !== '' && Number.isFinite(valueAsNumber)) {
          onChange(valueAsNumber);
        }
      }}
      onBlur={() => {
        const current = (draft ?? String(resolvedValue)).trim();
        setDraft(null);
        const parsed = current === '' ? Number.NaN : Number(current);
        if (!Number.isFinite(parsed)) {
          onChange(fallbackValue);
          return;
        }
        const clampedMin = typeof min === 'number' ? Math.max(min, parsed) : parsed;
        const clamped = typeof max === 'number' ? Math.min(max, clampedMin) : clampedMin;
        onChange(clamped);
      }}
    >
      <NumberInputField />
      <NumberInputStepper>
        <NumberIncrementStepper />
        <NumberDecrementStepper />
      </NumberInputStepper>
    </NumberInput>
  );
};

export default AdminNumberInput;
