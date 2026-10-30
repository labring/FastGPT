import type { DatasetSchemaType } from '@fastgpt/global/core/dataset/type';
import { getTeamModelHandle } from '@fastgpt/service/core/ai/model/catalog/service';
import type { DatasetModelAuthContext } from '@fastgpt/service/core/dataset/collection/controller';
import { getDatasetModelReference } from '@fastgpt/service/core/dataset/model';
import { getAuthorizedModelIds } from '@fastgpt/service/support/permission/model/auth';

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
