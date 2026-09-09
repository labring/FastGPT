import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

const mocks = vi.hoisted(() => ({
  getAppLatestVersion: vi.fn(),
  getAppDraftResourceBaseline: vi.fn(),
  checkAppResourceReadPermissions: vi.fn(),
  getUnauthorizedAppResources: vi.fn()
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion,
  getAppDraftResourceBaseline: mocks.getAppDraftResourceBaseline
}));

import { authTargetModelResource } from '@fastgpt/service/support/permission/app/resource';

describe('authTargetModelResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows a model that is declared in the published App version snapshot', async () => {
    mocks.getAppLatestVersion.mockResolvedValue({
      resources: [{ type: 'model', id: 'declared-model' }]
    });

    await expect(
      authTargetModelResource({
        targetType: ChatSourceTypeEnum.app,
        targetId: 'app-1',
        modelId: 'declared-model',
        tmbId: 'tmb-1'
      })
    ).resolves.toBeUndefined();
  });

  it('rejects a model that is missing from the published App version snapshot', async () => {
    mocks.getAppLatestVersion.mockResolvedValue({
      resources: [{ type: 'model', id: 'other-model' }]
    });

    await expect(
      authTargetModelResource({
        targetType: ChatSourceTypeEnum.app,
        targetId: 'app-1',
        modelId: 'undeclared-model',
        tmbId: 'tmb-1'
      })
    ).rejects.toBe(ERROR_ENUM.unAuthModel);
  });

  it('uses explicitly passed snapshot resources when available', async () => {
    await expect(
      authTargetModelResource({
        targetType: ChatSourceTypeEnum.app,
        targetId: 'app-1',
        modelId: 'declared-model',
        tmbId: 'tmb-1',
        resources: [{ type: 'model', id: 'declared-model' }]
      })
    ).resolves.toBeUndefined();

    expect(mocks.getAppLatestVersion).not.toHaveBeenCalled();
  });
});
