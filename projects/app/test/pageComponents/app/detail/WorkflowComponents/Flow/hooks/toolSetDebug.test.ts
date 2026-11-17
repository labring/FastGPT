import { describe, expect, it } from 'vitest';
import { VARIABLE_NODE_ID } from '@fastgpt/global/core/workflow/constants';
import { resolveToolSetHeaderSecret } from '@/pageComponents/app/detail/WorkflowComponents/Flow/hooks/toolSetDebug';

describe('resolveToolSetHeaderSecret', () => {
  it('resolves references for tool discovery and leaves the stored reference intact', () => {
    const headerSecret = {
      Authorization: { ref: [VARIABLE_NODE_ID, 'token'] as [string, string] },
      'X-Cipher': { secret: 'encrypted' }
    };

    expect(
      resolveToolSetHeaderSecret({
        headerSecret,
        runtimeNodes: [],
        variables: { token: 'debug-token' }
      })
    ).toEqual({
      Authorization: { value: 'debug-token' },
      'X-Cipher': { secret: 'encrypted' }
    });
    expect(headerSecret.Authorization).toEqual({ ref: [VARIABLE_NODE_ID, 'token'] });
  });

  it.each([undefined, 123])('rejects references without a string value (%s)', (token) => {
    expect(() =>
      resolveToolSetHeaderSecret({
        headerSecret: { Authorization: { ref: [VARIABLE_NODE_ID, 'token'] } },
        runtimeNodes: [],
        variables: { token }
      })
    ).toThrow('Secret header Authorization must resolve to a string');
  });
});
