import { describe, expect, it } from 'vitest';
import { WorkflowIOValueTypeEnum } from '@fastgpt/global/core/workflow/constants';
import {
  filterReferenceListByInputType,
  formatReferenceValue,
  formatManualInputValue,
  getSecretInputModeType,
  getSecretInputValueForMode,
  isReferenceArrayValue,
  normalizeInputValue,
  shouldShowSecretInput,
  type SecretReferenceList
} from '@/pageComponents/app/tool/SecretInputModal';

const referenceList: SecretReferenceList = [
  {
    label: 'Node',
    value: 'node',
    children: [
      { label: 'Text', value: 'text', valueType: WorkflowIOValueTypeEnum.string },
      { label: 'Number', value: 'number', valueType: WorkflowIOValueTypeEnum.number },
      { label: 'Boolean', value: 'boolean', valueType: WorkflowIOValueTypeEnum.boolean },
      { label: 'Unknown', value: 'unknown' }
    ]
  }
];

describe('SecretInputModal helpers', () => {
  it('preserves structured tuple-array references during normalization', () => {
    const value = {
      ref: [
        ['node', 'output'],
        ['node-2', 'output-2']
      ]
    } as const;

    expect(normalizeInputValue(value)).toEqual(value);
    expect(isReferenceArrayValue(value)).toBe(true);
    expect(formatReferenceValue(value)).toBe('node / output, node-2 / output-2');
  });

  it('normalizes legacy dual-field values through the shared migration', () => {
    expect(normalizeInputValue({ value: 'plain', secret: 'cipher' })).toEqual({ value: 'plain' });
    expect(normalizeInputValue({ value: '', secret: 'cipher' })).toEqual({ secret: 'cipher' });
  });

  it('normalizes number and switch legacy scalars into string wrappers', () => {
    expect(normalizeInputValue(0, 'numberInput')).toEqual({ value: '0' });
    expect(normalizeInputValue({ value: false }, 'switch')).toEqual({ value: 'false' });
  });

  it('keeps false and zero when canonicalizing manual changes', () => {
    expect(formatManualInputValue(false)).toBe('false');
    expect(formatManualInputValue(0)).toBe('0');
  });

  it('does not treat malformed references as configured values', () => {
    expect(formatReferenceValue({ ref: ['node'] } as any)).toBe('');
    expect(isReferenceArrayValue({ ref: [] } as any)).toBe(false);
  });

  it('clears the incompatible branch when switching field mode', () => {
    expect(getSecretInputValueForMode('reference')).toBeUndefined();
    expect(getSecretInputValueForMode('manual')).toEqual({ value: '' });
  });

  it('maps each secret input type to its mode selector type', () => {
    expect(getSecretInputModeType('input')).toBe('input');
    expect(getSecretInputModeType('numberInput')).toBe('numberInput');
    expect(getSecretInputModeType('secret')).toBe('password');
    expect(getSecretInputModeType('switch')).toBe('switch');
    expect(getSecretInputModeType('select')).toBe('select');
  });

  it('filters reference outputs to the existing input type contract', () => {
    expect(
      filterReferenceListByInputType(referenceList, 'input')[0].children.map((item) => item.value)
    ).toEqual(['text', 'unknown']);
    expect(
      filterReferenceListByInputType(referenceList, 'numberInput')[0].children.map(
        (item) => item.value
      )
    ).toEqual(['number', 'unknown']);
    expect(
      filterReferenceListByInputType(referenceList, 'switch')[0].children.map((item) => item.value)
    ).toEqual(['boolean', 'unknown']);
  });

  it('keeps empty secret wrappers editable', () => {
    expect(shouldShowSecretInput({ value: { value: '' } })).toBe(true);
    expect(shouldShowSecretInput({ value: { secret: '' } })).toBe(true);
    expect(shouldShowSecretInput({ value: { secret: 'cipher' } })).toBe(false);
    expect(shouldShowSecretInput({ value: { value: 'plain' } })).toBe(false);
    expect(shouldShowSecretInput({ value: { value: 'plain' }, isEditing: true })).toBe(true);
  });
});
