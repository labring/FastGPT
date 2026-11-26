import type { AppResource } from '@fastgpt/global/core/app/type';
import type { ClientSession } from '../../common/mongo';
import type { ModelHandle } from '../ai/model/catalog/handle';
import { findDatasetIndexModelReferences } from './entity';
import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import type {
  EmbeddingModelDataType,
  ModelReferenceType
} from '@fastgpt/global/core/ai/model/schema';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { UserError } from '@fastgpt/global/common/error/utils';
import { getTeamModelHandle } from '../ai/model/catalog/service';
import type { DatasetModelAuthContext } from './collection/controller';
import { getAuthorizedModelIds } from '../../support/permission/model/auth';

type DatasetModelFields = Pick<
  DatasetSchemaType,
  'vectorModelId' | 'vectorModel' | 'agentModelId' | 'agentModel' | 'vlmModelId' | 'vlmModel'
>;

/** 纯引用转换：稳定 ID 优先，缺少 ID 才保留历史名称；不读取缓存，也不执行模型校验。 */
export const getDatasetModelReference = (
  dataset: Partial<DatasetModelFields>,
  slot: 'embedding' | 'agent' | 'vlm'
): ModelReferenceType => {
  const keys = {
    embedding: ['vectorModelId', 'vectorModel'],
    agent: ['agentModelId', 'agentModel'],
    vlm: ['vlmModelId', 'vlmModel']
  } as const;
  const [idKey, nameKey] = keys[slot];
  const id = dataset[idKey];
  return {
    modelId: id === undefined || id === null ? undefined : String(id),
    model: dataset[nameKey]
  };
};

/**
 * 校验 HTTP 身份可使用当前知识库的 embedding 模型。
 * 同一次校验的模型目录快照与授权集合继续传给导入流程，避免重复构造。
 */
export const getDatasetModelAuthContext = async ({
  dataset,
  teamId,
  tmbId,
  isRoot
}: {
  dataset: DatasetSchemaType;
  teamId: string;
  tmbId: string;
  isRoot: boolean;
}): Promise<DatasetModelAuthContext> => {
  const modelHandle = await getTeamModelHandle({ teamId });
  const authorizedIds = await getAuthorizedModelIds({
    actor: { teamId, tmbId, isRoot },
    handle: modelHandle
  });

  const embeddingModels = await assertAppDatasetIndexModelsAvailable({
    resources: [{ type: 'dataset', id: String(dataset._id) }],
    teamId,
    modelHandle,
    authorizedIds
  });
  // 鉴权后知识库可能被删除，仍校验已读取的引用，避免查询空结果绕过校验。
  modelHandle.getModelData(
    embeddingModels.get(String(dataset._id)) ?? getDatasetModelReference(dataset, 'embedding'),
    {
      type: 'embedding',
      authorizedIds
    }
  );

  return { modelHandle, authorizedIds };
};

/**
 * 批量校验知识库的 embedding 索引模型存在、启用且操作者可授权。
 * 返回已解析的模型数据，供调用方直接复用，避免同一引用再次查目录。
 */
export const assertAppDatasetIndexModelsAvailable = async ({
  resources,
  teamId,
  modelHandle,
  authorizedIds,
  session
}: {
  resources: AppResource[];
  teamId: string;
  modelHandle: ModelHandle;
  authorizedIds: ReadonlySet<string>;
  session?: ClientSession;
}) => {
  const datasetIds = Array.from(
    new Set(resources.filter((resource) => resource.type === 'dataset').map(({ id }) => id))
  );
  const embeddingModels = new Map<string, EmbeddingModelDataType>();
  if (datasetIds.length === 0) return embeddingModels;

  const datasets = await findDatasetIndexModelReferences({ datasetIds, teamId, session });

  datasets.forEach((dataset) => {
    embeddingModels.set(
      String(dataset._id),
      modelHandle.getModelData(getDatasetModelReference(dataset, 'embedding'), {
        type: 'embedding',
        authorizedIds
      })
    );
  });

  return embeddingModels;
};

/**
 * 从 assert 结果读取当前知识库的 embedding 模型。
 * 调用方刚按同一 datasetId 校验过，缺失代表切换期间知识库被删除或团队变化，必须直接拒绝。
 */
export const getAssertedDatasetEmbeddingModel = (
  embeddingModels: ReadonlyMap<string, EmbeddingModelDataType>,
  datasetId: string
) => {
  const model = embeddingModels.get(datasetId);
  if (!model) throw new UserError(ModelErrEnum.unExist);
  return model;
};
