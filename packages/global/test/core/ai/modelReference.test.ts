import { describe, expect, it } from 'vitest';
import { getModelReferenceValue, isEmptyModelValue } from '../../../core/ai/modelReference';

describe('isEmptyModelValue', () => {
  it.each([undefined, null, '', ' \t\n'])('recognizes an unconfigured model (%s)', (value) => {
    expect(isEmptyModelValue(value)).toBe(true);
    expect(getModelReferenceValue({ modelId: value, model: 'legacy' })).toBe('legacy');
  });
  it.each(['id', 'missing-id', 0, false, [], {}])(
    'does not treat nonempty or invalid types as empty (%s)',
    (value) => {
      expect(isEmptyModelValue(value)).toBe(false);
      expect(getModelReferenceValue({ modelId: value, model: 'legacy' })).toBe(value);
    }
  );
});
