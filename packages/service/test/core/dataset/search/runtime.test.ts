import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ModelHandle } from '../../../../core/ai/model/catalog/handle';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { ModelScopeEnum, ModelTypeEnum } from '@fastgpt/global/core/ai/constants';
import { createModelHandle } from '../../../../core/ai/model/catalog/handle';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  indexModels: vi.fn(),
  readable: vi.fn(),
  authorized: vi.fn(),
  assertModels: vi.fn(),
  getHandle: vi.fn(),
  getModel: vi.fn(),
  findModel: vi.fn(),
  sign: vi.fn(),
  recall: vi.fn()
}));
vi.mock('@fastgpt/service/core/dataset/entity', () => ({
  findDatasetIndexModelReferences: mocks.indexModels
}));
vi.mock('@fastgpt/service/support/permission/dataset/auth', () => ({
  authDatasetByTmbId: mocks.auth
}));
vi.mock('@fastgpt/service/support/permission/collection/auth', () => ({
  resolveReadableCollectionIds: mocks.readable
}));
vi.mock('@fastgpt/service/support/permission/model/auth', () => ({
  getAuthorizedModelIds: mocks.authorized,
  assertAuthModels: mocks.assertModels
}));
vi.mock('@fastgpt/service/core/ai/model/catalog/service', () => ({
  getTeamModelHandle: mocks.getHandle
}));
vi.mock('@fastgpt/service/common/s3/sources/dataset', () => ({
  getS3DatasetSource: () => ({ createExternalUrl: mocks.sign })
}));
vi.mock('@fastgpt/service/core/dataset/search', () => ({ defaultSearchDatasetData: mocks.recall }));

import { createDatasetSearchRuntime } from '../../../../core/dataset/search/runtime';

const actor = { teamId: 'team', tmbId: 'member', isRoot: false };
const dataset = {
  _id: 'dataset',
  teamId: 'team',
  name: 'Knowledge',
  type: DatasetTypeEnum.dataset,
  vectorModelId: 'embedding',
  vlmModelId: 'vision'
};
const handle = {
  getModelData: mocks.getModel,
  findModelData: mocks.findModel
} as unknown as ModelHandle;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ dataset });
  mocks.indexModels.mockResolvedValue([dataset]);
  mocks.readable.mockResolvedValue(['readable']);
  mocks.authorized.mockResolvedValue(new Set(['rerank', 'llm']));
  mocks.assertModels.mockResolvedValue(undefined);
  mocks.getHandle.mockResolvedValue(handle);
  mocks.getModel.mockImplementation((ref, options) => ({
    modelId: ref.modelId ?? options.type,
    type: options.type
  }));
  mocks.findModel.mockReturnValue({ modelId: 'vision', isActive: true });
  mocks.sign.mockResolvedValue({ url: 'https://files.test/image' });
});

describe('createDatasetSearchRuntime', () => {
  it('binds dataset and collection read permissions without weakening the actor scope', async () => {
    const runtime = createDatasetSearchRuntime();
    expect(await runtime.permissions.loadReadableDataset({ actor, datasetId: 'dataset' })).toEqual(
      dataset
    );
    expect(mocks.auth).toHaveBeenCalledExactlyOnceWith({
      ...actor,
      datasetId: 'dataset',
      per: ReadPermissionVal
    });
    expect(
      await runtime.permissions.resolveReadableCollectionIds({ actor, datasetIds: ['dataset'] })
    ).toEqual(['readable']);
    expect(mocks.readable).toHaveBeenCalledExactlyOnceWith({ ...actor, datasetIds: ['dataset'] });
  });

  it('uses one supplied catalog snapshot for model resolution and authorization', async () => {
    const runtime = createDatasetSearchRuntime({ modelHandle: handle });
    const result = await runtime.resolveModels({
      actor,
      datasets: [dataset],
      rerank: { enabled: true, modelId: 'rerank', weight: 0 },
      queryExtension: { enabled: true, modelId: 'llm', background: '' }
    });
    expect(mocks.getHandle).not.toHaveBeenCalled();
    expect(result.embeddings).toEqual([{ modelId: 'embedding', type: 'embedding' }]);
    expect(mocks.indexModels).toHaveBeenCalledExactlyOnceWith({
      datasetIds: ['dataset'],
      teamId: actor.teamId,
      session: undefined
    });
    expect(mocks.getModel).toHaveBeenCalledWith(
      { modelId: 'embedding', model: undefined },
      { type: 'embedding', authorizedIds: new Set(['rerank', 'llm']) }
    );
    expect(result.imageCaption?.modelId).toBe('vision');
    expect(mocks.assertModels).toHaveBeenCalledExactlyOnceWith({
      actor,
      handle,
      modelIds: ['rerank', 'llm'],
      action: 'use'
    });
    expect(mocks.getModel).toHaveBeenCalledWith(
      { modelId: 'rerank' },
      expect.objectContaining({
        authorizedIds: new Set(['rerank', 'llm']),
        fallbackToDefault: false
      })
    );
  });

  it('loads the team catalog and preserves optional model defaults and disabled enhancements', async () => {
    const runtime = createDatasetSearchRuntime();
    const input = {
      actor,
      datasets: [dataset],
      rerank: { enabled: false as const },
      queryExtension: { enabled: false as const }
    };
    expect(await runtime.resolveModels(input)).toMatchObject({
      rerank: undefined,
      queryExtension: undefined
    });
    expect(mocks.getHandle).toHaveBeenCalledExactlyOnceWith({ teamId: actor.teamId });
    expect(mocks.assertModels).toHaveBeenLastCalledWith({
      actor,
      handle,
      modelIds: [],
      action: 'use'
    });
    await runtime.resolveModels({
      ...input,
      rerank: { enabled: true, weight: 0.5 },
      queryExtension: { enabled: true, background: '' }
    });
    expect(mocks.getModel).toHaveBeenCalledWith(
      { modelId: undefined },
      expect.objectContaining({ type: 'rerank', fallbackToDefault: true })
    );
    mocks.assertModels.mockRejectedValueOnce(new Error('unauthorized model'));
    await expect(runtime.resolveModels(input)).rejects.toThrow('unauthorized model');
  });

  it('rejects unavailable index models and datasets removed after resource authorization', async () => {
    const runtime = createDatasetSearchRuntime({ modelHandle: handle });
    const input = {
      actor,
      datasets: [dataset],
      rerank: { enabled: false as const },
      queryExtension: { enabled: false as const }
    };
    mocks.getModel.mockImplementationOnce(() => {
      throw new Error('index model unavailable');
    });
    await expect(runtime.resolveModels(input)).rejects.toThrow('index model unavailable');
    expect(mocks.assertModels).not.toHaveBeenCalled();
    mocks.indexModels.mockResolvedValueOnce([]);
    await expect(runtime.resolveModels(input)).rejects.toBeDefined();
    expect(mocks.assertModels).not.toHaveBeenCalled();
  });

  it.each([
    { isActive: false, authorizedIds: new Set(['embedding']) },
    { isActive: true, authorizedIds: new Set<string>() }
  ])(
    'enforces index model availability and member authorization: %j',
    async ({ isActive, authorizedIds }) => {
      const modelHandle = createModelHandle({
        models: [
          {
            modelId: 'embedding',
            model: 'embedding',
            name: 'Embedding',
            provider: 'test',
            scope: ModelScopeEnum.system,
            type: ModelTypeEnum.embedding,
            isActive,
            config: { defaultToken: 512, maxToken: 8192, weight: 1 }
          }
        ],
        defaultModels: {},
        configuredDefaultModelIds: {},
        revision: 0,
        version: 'test'
      });
      mocks.authorized.mockResolvedValueOnce(authorizedIds);
      await expect(
        createDatasetSearchRuntime({ modelHandle }).resolveModels({
          actor,
          datasets: [dataset],
          rerank: { enabled: false },
          queryExtension: { enabled: false }
        })
      ).rejects.toBeDefined();
      expect(mocks.assertModels).not.toHaveBeenCalled();
    }
  );

  it('validates temporary image ownership and binds storage and recall without business callbacks', async () => {
    const runtime = createDatasetSearchRuntime();
    expect(runtime.images.isAuthorizedKey({ key: 'temp/team/image.png', teamId: 'team' })).toBe(
      true
    );
    expect(runtime.images.isAuthorizedKey({ key: 'temp/other/image.png', teamId: 'team' })).toBe(
      false
    );
    expect(await runtime.images.createQueryUrl({ key: 'temp/team/image.png' })).toBe(
      'https://files.test/image'
    );
    expect(mocks.sign).toHaveBeenCalledExactlyOnceWith({
      key: 'temp/team/image.png',
      expiredHours: 1
    });
    expect(runtime.recall).toBe(mocks.recall);
  });
});
