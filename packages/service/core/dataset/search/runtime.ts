import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetByTmbId } from '../../../support/permission/dataset/auth';
import { resolveReadableCollectionIds } from '../../../support/permission/collection/auth';
import { getTmbInfoByTmbId } from '../../../support/user/team/controller';
import { getAuthorizedModelIds, assertAuthModels } from '../../../support/permission/model/auth';
import { isAuthorizedTempFileS3Key } from '../../../common/s3/sources/temp/key';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { getTeamModelHandle } from '../../ai/model/catalog/service';
import type { ModelHandle } from '../../ai/model/catalog/handle';
import { assertAppDatasetIndexModelsAvailable, getAssertedDatasetEmbeddingModel } from '../model';
import { defaultSearchDatasetData } from './index';
import { findFirstDatasetSearchVlmModel } from './vlm';
import type { DatasetSearchActor, DatasetSearchRuntime } from './type';

/**
 * 组装 FastGPT 默认权限、模型、图片和召回适配。只在组合入口调用；
 * 搜索编排不导入此文件，也不隐式选择默认实现。旧协议可传入已解析的模型快照。
 * 每次搜索创建一个实例，成员读取只在该实例内按身份复用，不跨请求缓存权限。
 */
export const createDatasetSearchRuntime = ({
  modelHandle
}: { modelHandle?: ModelHandle } = {}): DatasetSearchRuntime => {
  const memberReads = new Map<string, ReturnType<typeof getTmbInfoByTmbId>>();
  /** 先缓存 Promise 再等待结果，合并并发读取；失败在当前请求内保持拒绝，不重试放行。 */
  const getTmbInfo = (actor: DatasetSearchActor) => {
    const key = JSON.stringify([actor.teamId, actor.tmbId]);
    const cached = memberReads.get(key);
    if (cached) return cached;
    const promise = getTmbInfoByTmbId({ tmbId: actor.tmbId });
    memberReads.set(key, promise);
    return promise;
  };

  return {
    permissions: {
      loadReadableDataset: async ({ actor, datasetId }) => {
        const { dataset } = await authDatasetByTmbId({
          ...actor,
          datasetId,
          per: ReadPermissionVal,
          tmbInfo: getTmbInfo(actor)
        });
        return dataset;
      },
      resolveReadableCollectionIds: async ({ actor, datasetIds }) =>
        resolveReadableCollectionIds({
          ...actor,
          datasetIds,
          ...(datasetIds.length === 0 ? {} : { tmbInfo: await getTmbInfo(actor) })
        })
    },
    resolveModels: async ({ actor, datasets, rerank, queryExtension }) => {
      const handle = modelHandle ?? (await getTeamModelHandle({ teamId: actor.teamId }));
      const modelActor = actor.isRoot
        ? actor
        : { ...actor, teamPermission: (await getTmbInfo(actor)).permission };
      const authorizedIds = await getAuthorizedModelIds({ actor: modelActor, handle });
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
        actor: modelActor,
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
  };
};
