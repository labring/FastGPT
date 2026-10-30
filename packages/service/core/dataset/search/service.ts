import { UserConfigError } from '@fastgpt/global/common/error/utils';
import { DatasetSearchParamsSchema } from '@fastgpt/global/core/dataset/search/type';
import type {
  DatasetSearchTagCondition,
  DatasetSearchResult
} from '@fastgpt/global/core/dataset/search/type';
import { DatasetErrEnum } from '@fastgpt/global/common/error/code/dataset';
import { DatasetSearchModeEnum, DatasetTypeEnum } from '@fastgpt/global/core/dataset/constants';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { authDatasetByTmbId } from '../../../support/permission/dataset/auth';
import { resolveReadableCollectionIds } from '../../../support/permission/collection/auth';
import { getAuthorizedModelIds, assertAuthModels } from '../../../support/permission/model/auth';
import { isAuthorizedTempFileS3Key } from '../../../common/s3/sources/temp/key';
import { getS3DatasetSource } from '../../../common/s3/sources/dataset';
import { getDatasetModelReference } from '../model';
import { defaultSearchDatasetData } from './index';
import { findFirstDatasetSearchVlmModel } from './vlm';
import type { DatasetSearchProps, DatasetSearchUsage } from './type';

/**
 * 执行成员身份下的完整知识库搜索。HTTP 凭证在入口层解析；余额、限流、账单和审计
 * 由调用方注入。资源与集合权限固定在召回前验证，任何不可读目标都会使请求失败。
 */
export const search = async ({
  params,
  context,
  deps
}: DatasetSearchProps): Promise<DatasetSearchResult> => {
  const start = Date.now();
  const input = DatasetSearchParamsSchema.parse(params);
  const { actor } = context;
  const datasetIds = [...new Set(input.scope.datasetIds)];

  // 1. 对全部目标做资源鉴权；root 也只能在本次请求明确的团队范围内搜索。
  const datasets = await Promise.all(
    datasetIds.map(async (datasetId) => {
      const { dataset } = await authDatasetByTmbId({
        ...actor,
        datasetId,
        per: ReadPermissionVal
      });
      if (String(dataset.teamId) !== actor.teamId) throw DatasetErrEnum.unAuthDataset;
      if (dataset.type === DatasetTypeEnum.folder) {
        throw new UserConfigError('搜索目标必须是知识库，不能是文件夹');
      }
      return dataset;
    })
  );
  const imageKeys = [...new Set(input.query.imageKeys)];
  if (imageKeys.some((key) => !isAuthorizedTempFileS3Key({ key, teamId: actor.teamId }))) {
    throw new UserConfigError('检索图片必须是当前团队上传的临时图片');
  }

  // 现有元数据过滤器在非商业版本会忽略配置，新入口明确拒绝，避免无声扩大召回范围。
  const filter = input.scope.filter;
  if (filter && Object.keys(filter).length > 0 && !global.feConfigs.isPlus) {
    throw new UserConfigError('当前版本不支持知识库搜索筛选');
  }

  // 2. 选择本次模型快照；向量检索不允许用首库模型查询其他模型生成的索引。
  const modelHandle = await deps.getModelHandle({ teamId: actor.teamId });
  const vectorModels = datasets.map((dataset) =>
    modelHandle.getModelData(getDatasetModelReference(dataset, 'embedding'), { type: 'embedding' })
  );
  const vectorModel = vectorModels[0];
  if (
    input.retrieval.mode !== DatasetSearchModeEnum.fullTextRecall &&
    vectorModels.some((model) => model.modelId !== vectorModel.modelId)
  ) {
    throw new UserConfigError('联合向量检索要求知识库使用相同的向量模型');
  }
  const authorizedIds = await getAuthorizedModelIds({ actor, handle: modelHandle });
  const rerank = input.rerank;
  const extension = input.queryExtension;
  const rerankModel = rerank.enabled
    ? modelHandle.getModelData(
        { modelId: rerank.modelId },
        { type: 'rerank', authorizedIds, fallbackToDefault: rerank.modelId === undefined }
      )
    : undefined;
  const extensionModel = extension.enabled
    ? modelHandle.getModelData(
        { modelId: extension.modelId },
        { type: 'llm', authorizedIds, fallbackToDefault: extension.modelId === undefined }
      )
    : undefined;
  await assertAuthModels({
    actor,
    handle: modelHandle,
    modelIds: [rerankModel, extensionModel]
      .filter((model) => model !== undefined)
      .map((model) => model.modelId),
    action: 'use'
  });
  const vlmModel = findFirstDatasetSearchVlmModel(datasets, modelHandle);
  const readableCollectionIdList = await resolveReadableCollectionIds({
    ...actor,
    datasetIds
  });

  // 3. 外部业务策略在任何模型调用前完成；回调不可获取或修改检索权限范围。
  await deps.beforeSearch();
  const imageQueries = await Promise.all(
    imageKeys.map(async (key) => {
      const { url } = await getS3DatasetSource().createExternalUrl({ key, expiredHours: 1 });
      return url;
    })
  );
  /** 只序列化已校验的结构化条件，复用既有过滤执行器和集合权限交集。 */
  const serializeFilter = () => {
    if (!filter) return undefined;
    const toCondition = (condition: DatasetSearchTagCondition) => ({
      [condition.tag]: {
        [condition.op]: 'value' in condition ? condition.value : true
      }
    });
    return JSON.stringify({
      collectionIds: filter.collectionIds,
      createTime: filter.createTime
        ? { $gte: filter.createTime.gte, $lte: filter.createTime.lte }
        : undefined,
      tags: filter.tags
        ? { $and: filter.tags.and?.map(toCondition), $or: filter.tags.or?.map(toCondition) }
        : undefined
    });
  };
  const result = await defaultSearchDatasetData({
    teamId: actor.teamId,
    tmbId: actor.tmbId,
    histories: context.histories ?? [],
    userKey: context.userKey,
    datasetIds,
    textQueries: input.query.text ? [input.query.text] : [],
    imageQueries,
    model: vectorModel,
    vlmModel,
    searchMode: input.retrieval.mode,
    embeddingWeight: input.retrieval.embeddingWeight,
    limit: input.result.maxTokens,
    similarity: input.result.similarity,
    usingReRank: rerank.enabled,
    rerankModel,
    rerankWeight: rerank.enabled ? rerank.weight : undefined,
    datasetSearchUsingExtensionQuery: extension.enabled,
    datasetSearchExtensionModel: extensionModel,
    datasetSearchExtensionBg: extension.enabled ? extension.background : undefined,
    collectionFilterMatch: serializeFilter(),
    readableCollectionIdList
  });

  // 4. 仅上报实际用量事实；扩展产生的 embedding 独立于主召回统计，避免重复计费。
  const items: DatasetSearchUsage['items'] = [];
  const recordUsage = ({
    phase,
    model,
    inputTokens,
    outputTokens = 0,
    usedUserOpenAIKey = false
  }: Omit<DatasetSearchUsage['items'][number], 'outputTokens' | 'usedUserOpenAIKey'> &
    Partial<Pick<DatasetSearchUsage['items'][number], 'outputTokens' | 'usedUserOpenAIKey'>>) => {
    if (inputTokens > 0 || outputTokens > 0) {
      items.push({ phase, model, inputTokens, outputTokens, usedUserOpenAIKey });
    }
  };
  recordUsage({ phase: 'embedding', model: vectorModel, inputTokens: result.embeddingTokens });
  if (rerankModel)
    recordUsage({ phase: 'rerank', model: rerankModel, inputTokens: result.reRankInputTokens });
  if (result.queryExtensionResult && extensionModel) {
    const usage = result.queryExtensionResult;
    recordUsage({
      phase: 'queryExtension',
      model: extensionModel,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      usedUserOpenAIKey: usage.usedUserOpenAIKey
    });
    recordUsage({
      phase: 'queryExtensionEmbedding',
      model: vectorModel,
      inputTokens: usage.embeddingTokens
    });
  }
  if (result.imageCaptionResult && vlmModel) {
    const usage = result.imageCaptionResult;
    recordUsage({
      phase: 'imageCaption',
      model: vlmModel,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      usedUserOpenAIKey: usage.usedUserOpenAIKey
    });
  }
  await deps.onUsage({ items });
  const response = {
    list: result.searchRes,
    meta: {
      durationMs: Date.now() - start,
      searchMode: input.retrieval.mode,
      maxTokens: result.limit,
      similarity: result.similarity,
      usingSimilarityFilter: result.usingSimilarityFilter,
      usingReRank: result.usingReRank,
      queryExtensionModelId: result.queryExtensionResult ? extensionModel?.modelId : undefined
    }
  };
  await deps.onSearched?.({
    datasets,
    resultCount: response.list.length,
    durationMs: response.meta.durationMs
  });
  return response;
};
