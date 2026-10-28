import { afterEach, describe, expect, it, vi } from 'vitest';
import { dispatchCodeSandbox } from '@fastgpt/service/core/workflow/dispatch/tools/codeSandbox';
import { codeSandbox } from '@fastgpt/service/thirdProvider/codeSandbox';
import { NodeInputKeyEnum } from '@fastgpt/global/core/workflow/constants';

afterEach(() => vi.restoreAllMocks());

describe('dispatchCodeSandbox', () => {
  it('keeps the sandbox exception and publishes legacy error outputs through data', async () => {
    const error = new Error('sandbox failed', { cause: new Error('private transport details') });
    vi.spyOn(codeSandbox, 'runCode').mockRejectedValueOnce(error);

    const result = await dispatchCodeSandbox({
      params: {
        [NodeInputKeyEnum.codeType]: 'javascript',
        [NodeInputKeyEnum.code]: 'throw new Error("failed")',
        [NodeInputKeyEnum.addInputParam]: {}
      }
    } as Parameters<typeof dispatchCodeSandbox>[0]);

    expect(result.error).toBe(error);
    expect(result.data).toEqual({ system_error_text: 'sandbox failed', error: 'sandbox failed' });
    expect(result.toolResponse).toEqual({ error: 'sandbox failed' });
    expect(result.responseData).toMatchObject({ errorText: 'sandbox failed' });
    expect(JSON.stringify(result.responseData)).not.toContain('private transport details');
  });
});
