import { describe, expect, it } from 'vitest';
import { resolveToolInputValues } from '@fastgpt/service/core/app/tool/secretConfig';

describe('resolveToolInputValues', () => {
  it('resolves refs and preserves input type conversion', () => {
    const result = resolveToolInputValues({
      value: {
        count: { ref: ['node-1', 'count'] },
        enabled: { ref: ['node-1', 'enabled'] },
        token: { ref: ['node-1', 'token'] }
      },
      inputList: [
        { key: 'count', label: 'Count', inputType: 'numberInput' },
        { key: 'enabled', label: 'Enabled', inputType: 'switch' },
        { key: 'token', label: 'Token', inputType: 'secret' }
      ],
      resolveReference: (ref) =>
        ({ count: '12', enabled: false, token: 'raw-token' })[ref[1] as string]
    });

    expect(result).toEqual({ count: 12, enabled: false, token: 'raw-token' });
  });

  it('rejects object and array reference results', () => {
    expect(() =>
      resolveToolInputValues({
        value: { token: { ref: ['node-1', 'token'] } },
        inputList: [{ key: 'token', label: 'Token', inputType: 'secret' }],
        resolveReference: () => ['token-a', 'token-b']
      })
    ).toThrow('must resolve to a scalar');
  });
});
