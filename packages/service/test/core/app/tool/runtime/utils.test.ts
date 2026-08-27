import { describe, expect, it } from 'vitest';
import { getAppToolOutputError } from '@fastgpt/service/core/app/tool/runtime/utils';

describe('getAppToolOutputError', () => {
  it('only treats commercial workflow output errors as execution failures', () => {
    expect(
      getAppToolOutputError({
        plugin: { id: 'commercial-workflow-tool' },
        pluginOutput: { error: 'commercial failed' }
      })
    ).toBe('commercial failed');

    expect(
      getAppToolOutputError({
        plugin: { id: 'personal-workflow-tool' },
        pluginOutput: { error: 'business error value' }
      })
    ).toBeUndefined();
  });
});
