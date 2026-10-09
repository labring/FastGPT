import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ERROR_ENUM } from '@fastgpt/global/common/error/errorCode';
import { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { AppErrEnum } from '@fastgpt/global/common/error/code/app';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { AIModelDataSchema } from '@fastgpt/global/core/ai/model/schema';
import { createModelHandle } from '@fastgpt/service/core/ai/model/handle';

const mocks = vi.hoisted(() => ({
  getAppLatestVersion: vi.fn(),
  getAppDraftResourceBaseline: vi.fn(),
  checkAppResourceReadPermissions: vi.fn(),
  getTeamModelHandle: vi.fn(),
  authAppByTmbId: vi.fn(),
  authDatasetByTmbId: vi.fn(),
  authSkillByTmbId: vi.fn(),
  getTmbInfoByTmbId: vi.fn()
}));

vi.mock('@fastgpt/service/core/ai/model/index', () => ({
  getTeamModelHandle: mocks.getTeamModelHandle
}));

vi.mock('@fastgpt/service/core/app/version/controller', () => ({
  getAppLatestVersion: mocks.getAppLatestVersion,
  getAppDraftResourceBaseline: mocks.getAppDraftResourceBaseline
}));

vi.mock('@fastgpt/service/support/permission/app/auth', () => ({
  authAppByTmbId: mocks.authAppByTmbId
}));

vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetByTmbId: mocks.authDatasetByTmbId
}));

vi.mock('@fastgpt/service/support/permission/skill/auth', () => ({
  authSkillByTmbId: mocks.authSkillByTmbId
}));

vi.mock('@fastgpt/service/support/user/team/controller', () => ({
  getTmbInfoByTmbId: mocks.getTmbInfoByTmbId
}));

import {
  authTargetModelResource,
  getUnauthorizedAppResources,
  filterAuthorizedAppResources,
  checkAppResourceReadPermissions
} from '@fastgpt/service/support/permission/app/resource';

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

describe('checkAppResourceReadPermissions', () => {
  const validTmbId = '65f000000000000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTmbInfoByTmbId.mockResolvedValue({
      teamId: '65f000000000000000000002',
      permission: { isOwner: false }
    });
  });

  it('rejects non-ObjectId dataset resource with DatasetErrEnum.unExist in formal permission check', async () => {
    await expect(
      checkAppResourceReadPermissions({
        resources: [{ type: 'dataset', id: 'dbconn' }],
        tmbId: validTmbId
      })
    ).rejects.toBe(DatasetErrEnum.unExist);
    expect(mocks.authDatasetByTmbId).not.toHaveBeenCalled();
  });

  it('rejects non-ObjectId agent/tool resource with AppErrEnum.unExist in formal permission check', async () => {
    await expect(
      checkAppResourceReadPermissions({
        resources: [{ type: 'agent', id: 'chat input' }],
        tmbId: validTmbId
      })
    ).rejects.toBe(AppErrEnum.unExist);
    expect(mocks.authAppByTmbId).not.toHaveBeenCalled();
  });
});

describe('filterAuthorizedAppResources', () => {
  const validTmbId = '65f000000000000000000001';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when resources array is empty without checking permissions', async () => {
    const result = await filterAuthorizedAppResources({
      resources: [],
      tmbId: validTmbId
    });
    expect(result).toEqual([]);
    expect(mocks.authAppByTmbId).not.toHaveBeenCalled();
    expect(mocks.authDatasetByTmbId).not.toHaveBeenCalled();
    expect(mocks.authSkillByTmbId).not.toHaveBeenCalled();
  });

  it('returns empty array when tmbId is invalid or missing', async () => {
    const resources = [{ type: 'app' as const, id: 'app-1' }];

    expect(await filterAuthorizedAppResources({ resources, tmbId: '' })).toEqual([]);
    expect(await filterAuthorizedAppResources({ resources, tmbId: 'invalid-id' })).toEqual([]);
    expect(await filterAuthorizedAppResources({ resources, tmbId: undefined })).toEqual([]);
    expect(mocks.authAppByTmbId).not.toHaveBeenCalled();
  });

  it('returns all resources when member has read permissions for all items', async () => {
    mocks.authAppByTmbId.mockResolvedValue(undefined);
    mocks.authDatasetByTmbId.mockResolvedValue(undefined);

    const resources = [
      { type: 'agent' as const, id: '65f000000000000000000010' },
      { type: 'dataset' as const, id: '65f000000000000000000020' }
    ];

    const result = await filterAuthorizedAppResources({
      resources,
      tmbId: validTmbId
    });

    expect(result).toEqual(resources);
    expect(mocks.authAppByTmbId).toHaveBeenCalledWith(
      expect.objectContaining({ appId: '65f000000000000000000010', tmbId: validTmbId })
    );
    expect(mocks.authDatasetByTmbId).toHaveBeenCalledWith(
      expect.objectContaining({ datasetId: '65f000000000000000000020', tmbId: validTmbId })
    );
  });

  it('silently filters out unauthorized resources while retaining authorized ones', async () => {
    mocks.authAppByTmbId.mockResolvedValue(undefined);
    mocks.authDatasetByTmbId.mockRejectedValue(new Error('Permission denied'));

    const resources = [
      { type: 'agent' as const, id: '65f000000000000000000010' },
      { type: 'dataset' as const, id: '65f000000000000000000020' }
    ];

    const result = await filterAuthorizedAppResources({
      resources,
      tmbId: validTmbId
    });

    expect(result).toEqual([{ type: 'agent', id: '65f000000000000000000010' }]);
  });

  it('silently filters out non-ObjectId resources in migration filter while retaining valid authorized ones', async () => {
    mocks.authDatasetByTmbId.mockResolvedValue(undefined);

    const resources = [
      { type: 'dataset' as const, id: 'dbconn' },
      { type: 'dataset' as const, id: '65f000000000000000000020' },
      { type: 'agent' as const, id: 'chat input' }
    ];

    const result = await filterAuthorizedAppResources({ resources, tmbId: validTmbId });
    expect(result).toEqual([{ type: 'dataset', id: '65f000000000000000000020' }]);
    expect(mocks.authDatasetByTmbId).toHaveBeenCalledOnce();
  });

  it('drops all resources to empty array when member cannot be found or is inactive', async () => {
    mocks.authAppByTmbId.mockRejectedValue('member not exist');
    mocks.getTmbInfoByTmbId.mockRejectedValue('member not exist');

    const resources = [
      { type: 'agent' as const, id: '65f000000000000000000010' },
      { type: 'skill' as const, id: '65f000000000000000000030' }
    ];

    const result = await filterAuthorizedAppResources({
      resources,
      tmbId: validTmbId
    });

    expect(result).toEqual([]);
  });

  it('throws when getTmbInfoByTmbId encounters an unexpected or database error', async () => {
    mocks.getTmbInfoByTmbId.mockRejectedValue(new Error('MongoNetworkError: connection timed out'));

    const resources = [{ type: 'agent' as const, id: '65f000000000000000000010' }];

    await expect(
      filterAuthorizedAppResources({
        resources,
        tmbId: validTmbId
      })
    ).rejects.toThrow('MongoNetworkError: connection timed out');
  });

  it('throws when resource auth encounters an unexpected or database error', async () => {
    mocks.getTmbInfoByTmbId.mockResolvedValue(undefined);
    mocks.authAppByTmbId.mockRejectedValue(new Error('MongoTimeoutError: query exceeded limit'));

    const resources = [{ type: 'agent' as const, id: '65f000000000000000000010' }];

    await expect(
      filterAuthorizedAppResources({
        resources,
        tmbId: validTmbId
      })
    ).rejects.toThrow('MongoTimeoutError: query exceeded limit');
  });
});

describe('team models in App resource permissions', () => {
  const teamId = '65f000000000000000000002';
  const tmbId = '65f000000000000000000001';
  const ownId = '65f000000000000000000011';
  const disabledId = '65f000000000000000000012';
  const privateId = '65f000000000000000000013';
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTmbInfoByTmbId.mockResolvedValue({ teamId });
    const models = [
      { modelId: ownId, tmbId, isActive: true },
      { modelId: disabledId, tmbId, isActive: false },
      { modelId: privateId, tmbId: '65f000000000000000000099', isActive: true }
    ].map((model) =>
      AIModelDataSchema.parse({
        ...model,
        model: model.modelId,
        name: 'Private model',
        provider: 'OpenAI',
        type: 'llm',
        scope: 'team',
        teamId,
        config: { maxContext: 4096, maxResponse: 1024, quoteMaxToken: 1024 }
      })
    );
    mocks.getTeamModelHandle.mockResolvedValue(
      createModelHandle({
        models,
        defaultModels: {},
        configuredDefaultModelIds: {},
        revision: 1,
        version: 'app-resource-team-catalog'
      })
    );
  });

  it('allows an owned team model using one snapshot for existence and real ACL projection', async () => {
    await expect(
      checkAppResourceReadPermissions({ resources: [{ type: 'model', id: ownId }], tmbId })
    ).resolves.toBeUndefined();
    expect(mocks.getTeamModelHandle).toHaveBeenCalledExactlyOnceWith({ teamId });
  });
  it('distinguishes a disabled model from another member private model in the same snapshot', async () => {
    const disabled = { type: 'model' as const, id: disabledId };
    const privateModel = { type: 'model' as const, id: privateId };
    expect(
      await getUnauthorizedAppResources({ resources: [disabled, privateModel], tmbId })
    ).toEqual([
      { resource: disabled, error: ModelErrEnum.unExist },
      { resource: privateModel, error: ERROR_ENUM.unAuthModel }
    ]);
  });
});
