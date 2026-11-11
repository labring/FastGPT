import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetByTmbId } from '../../../support/permission/dataset/auth';
import { resolveReadableCollectionIds } from '../../../support/permission/collection/auth';
import { getAuthorizedModelIds, assertAuthModels } from '../../../support/permission/model/auth';
import { isAuthorizedTempFileS3Key } from '../../../common/s3/sources/temp/key';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { getTeamModelHandle } from '../../ai/model/catalog/service';
import type { ModelHandle } from '../../ai/model/catalog/handle';
import { assertAppDatasetIndexModelsAvailable, getAssertedDatasetEmbeddingModel } from '../model';
import { defaultSearchDatasetData } from './index';
import { findFirstDatasetSearchVlmModel } from './vlm';
import type { DatasetSearchRuntime } from './type';

/**
 * 组装 FastGPT 默认权限、模型、图片和召回适配。只在组合入口调用；
 * 搜索编排不导入此文件，也不隐式选择默认实现。旧协议可传入已解析的模型快照。
 */
export const createDatasetSearchRuntime = ({
  modelHandle
}: { modelHandle?: ModelHandle } = {}): DatasetSearchRuntime => ({
  permissions: {
    loadReadableDataset: async ({ actor, datasetId }) => {
      const { dataset } = await authDatasetByTmbId({ ...actor, datasetId, per: ReadPermissionVal });
      return dataset;
    },
    resolveReadableCollectionIds: ({ actor, datasetIds }) =>
      resolveReadableCollectionIds({ ...actor, datasetIds })
  },
  resolveModels: async ({ actor, datasets, rerank, queryExtension }) => {
    const handle = modelHandle ?? (await getTeamModelHandle({ teamId: actor.teamId }));
    const authorizedIds = await getAuthorizedModelIds({ actor, handle });
    // 沿用索引模型校验：停用或无权使用的模型必须在召回前拒绝，且复用同一目录快照。
    const embeddingModels = await assertAppDatasetIndexModelsAvailable({
      resources: datasets.map((dataset) => ({ type: 'dataset', id: String(dataset._id) })),
      teamId: actor.teamId,
      modelHandle: handle,
      authorizedIds
    });
    const embeddings = datasets.map((dataset) =>
      getAssertedDatasetEmbeddingModel(embeddingModels, String(dataset._id))
    );
    const rerankModel = rerank.enabled
      ? handle.getModelData(
          { modelId: rerank.modelId },
          { type: 'rerank', authorizedIds, fallbackToDefault: rerank.modelId === undefined }
        )
      : undefined;
    const extensionModel = queryExtension.enabled
      ? handle.getModelData(
          { modelId: queryExtension.modelId },
          { type: 'llm', authorizedIds, fallbackToDefault: queryExtension.modelId === undefined }
        )
      : undefined;
    await assertAuthModels({
      actor,
      handle,
      modelIds: [rerankModel, extensionModel]
        .filter((model) => model !== undefined)
        .map((model) => model.modelId),
      action: 'use'
    });
    return {
      embeddings,
      rerank: rerankModel,
      queryExtension: extensionModel,
      imageCaption: findFirstDatasetSearchVlmModel(datasets, handle)
    };
  },
  images: {
    isAuthorizedKey: isAuthorizedTempFileS3Key,
    createQueryUrl: async ({ key }) => {
      const { url } = await getS3DatasetSource().createExternalUrl({ key, expiredHours: 1 });
      return url;
    }
  },
  recall: defaultSearchDatasetData
});
