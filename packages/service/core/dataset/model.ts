import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import type { ModelReferenceType } from '@fastgpt/global/core/ai/model/schema';
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

/** 校验 HTTP 身份可使用当前知识库的 embedding 模型，并返回后续导入复用的目录快照。 */
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

  modelHandle.getModelData(getDatasetModelReference(dataset, 'embedding'), {
    type: 'embedding',
    authorizedIds
  });

  return { modelHandle, authorizedIds };
};
