import { UserError } from '@fastgpt/global/common/error/utils';
import { describe, expect, it, vi } from 'vitest';

const { checkUrlSafetyMock } = vi.hoisted(() => ({ checkUrlSafetyMock: vi.fn() }));

vi.mock('@fastgpt/service/common/system/utils', () => ({
  checkUrlSafety: checkUrlSafetyMock
}));

import { assertTeamModelRequestUrlSafe } from '@fastgpt/service/core/ai/model/requestUrlSafety';

describe('assertTeamModelRequestUrlSafe', () => {
  it('skips empty or missing requestUrl', async () => {
    await expect(assertTeamModelRequestUrlSafe({})).resolves.toBeUndefined();
    await expect(assertTeamModelRequestUrlSafe({ requestUrl: '   ' })).resolves.toBeUndefined();
    expect(checkUrlSafetyMock).not.toHaveBeenCalled();
  });

  it('validates the trimmed URL', async () => {
    checkUrlSafetyMock.mockResolvedValueOnce(undefined);
    await assertTeamModelRequestUrlSafe({ requestUrl: '  https://api.example.com/v1  ' });
    expect(checkUrlSafetyMock).toHaveBeenCalledWith('https://api.example.com/v1', 'requestUrl');
  });

  it('wraps validation failures in UserError', async () => {
    checkUrlSafetyMock.mockRejectedValueOnce(new Error('requestUrl: private address'));
    await expect(
      assertTeamModelRequestUrlSafe({ requestUrl: 'http://169.254.169.254/latest' })
    ).rejects.toBeInstanceOf(UserError);
  });
});
