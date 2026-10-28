import { describe, expect, it } from 'vitest';
import { normalizeToolInputValue } from '@fastgpt/global/core/app/tool/systemTool/codec';
import type { InputConfigType } from '@fastgpt/global/core/workflow/type/io';

describe('normalizeToolInputValue', () => {
  it.each<{
    value: unknown;
    inputType: InputConfigType['inputType'];
    expected: unknown;
  }>([
    { value: 'plain', inputType: 'secret', expected: { value: 'plain' } },
    { value: {}, inputType: 'secret', expected: { value: '' } },
    { value: 0, inputType: 'numberInput', expected: { value: '0' } },
    { value: false, inputType: 'switch', expected: { value: 'false' } },
    { value: { value: false }, inputType: 'switch', expected: { value: 'false' } },
    { value: { value: 0 }, inputType: 'numberInput', expected: { value: '0' } },
    { value: { value: 12, secret: '' }, inputType: 'numberInput', expected: { value: '12' } },
    { value: { value: 0, secret: '' }, inputType: 'numberInput', expected: { value: '0' } },
    { value: { value: true, secret: '' }, inputType: 'switch', expected: { value: 'true' } },
    { value: { value: false, secret: '' }, inputType: 'switch', expected: { value: 'false' } },
    {
      value: { value: 'plain', secret: 'cipher' },
      inputType: 'secret',
      expected: { value: 'plain' }
    },
    {
      value: { ref: ['node', 'token'] },
      inputType: 'secret',
      expected: { ref: ['node', 'token'] }
    },
    { value: { secret: 'cipher' }, inputType: 'secret', expected: { secret: 'cipher' } }
  ])(
    'normalizes the declared field boundary: $inputType / $value',
    ({ value, inputType, expected }) => {
      expect(normalizeToolInputValue({ value, inputType })).toEqual(expected);
    }
  );

  it.each([
    undefined,
    null,
    [],
    { ref: [] },
    { ref: ['node', 'token'], value: 'plain' },
    { value: false, secret: '', ref: ['node', 'token'] },
    { value: 12, secret: '', business: true }
  ])('does not turn invalid wrappers or business objects into configured values: %j', (value) => {
    expect(normalizeToolInputValue({ value, inputType: 'input' })).toBeUndefined();
  });

  it.each([0, false, { value: false }, { value: false, secret: '' }])(
    'does not coerce non-string password values: %j',
    (value) => {
      expect(normalizeToolInputValue({ value, inputType: 'secret' })).toBeUndefined();
    }
  );
});
