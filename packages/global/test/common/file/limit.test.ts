import { describe, expect, it } from 'vitest';
import { getFileUploadLimits } from '../../../common/file/limit';

describe('getFileUploadLimits', () => {
  const systemLimit = { uploadFileMaxSize: 1000, uploadFileMaxAmount: 1000 };
  const plan = { maxUploadFileSize: 50, maxUploadFileCount: 10 };

  it('resolves size and count independently using team overrides, plan and system', () => {
    expect(
      getFileUploadLimits({
        teamPlan: { maxUploadFileSize: 20, maxUploadFileCount: 0 },
        plan,
        systemLimit
      })
    ).toEqual({ maxUploadFileSize: 20, maxUploadFileCount: 10 });
  });

  it.each([undefined, null, 0])('skips unset team values %s and inherits the plan', (value) => {
    expect(
      getFileUploadLimits({
        teamPlan: { maxUploadFileSize: value, maxUploadFileCount: value },
        plan,
        systemLimit
      })
    ).toEqual({ maxUploadFileSize: 50, maxUploadFileCount: 10 });
  });

  it.each([undefined, null, 0])('inherits the environment when the plan is unset %s', (value) => {
    expect(
      getFileUploadLimits({
        teamPlan: { maxUploadFileSize: 0, maxUploadFileCount: 0 },
        plan: { maxUploadFileSize: value, maxUploadFileCount: value },
        systemLimit
      })
    ).toEqual({ maxUploadFileSize: 1000, maxUploadFileCount: 1000 });
  });

  it('uses default limits when all configuration is missing or zero', () => {
    expect(getFileUploadLimits({})).toEqual({ maxUploadFileSize: 1000, maxUploadFileCount: 1000 });
    expect(
      getFileUploadLimits({ systemLimit: { uploadFileMaxSize: 0, uploadFileMaxAmount: 0 } })
    ).toEqual({ maxUploadFileSize: 1000, maxUploadFileCount: 1000 });
  });
});
