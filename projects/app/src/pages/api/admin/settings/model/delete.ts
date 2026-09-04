import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  AdminSystemModelReferenceSchema,
  DeleteSystemModelsBodySchema,
  type AdminSystemModelReference,
  type DeleteSystemModelsBody
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { findModelData } from '@fastgpt/service/core/ai/model';
import { removeModelsFromAIProxyChannels } from '@fastgpt/service/thirdProvider/aiproxy/channel';

async function handler(
  req: ApiRequestProps<DeleteSystemModelsBody, AdminSystemModelReference>
): Promise<void> {
  await authSystemAdmin({ req });
  const modelIds = (() => {
    if (Array.isArray(req.body?.modelIds)) {
      return parseApiInput({ req, bodySchema: DeleteSystemModelsBodySchema }).body.modelIds;
    }
    const { modelId } = parseApiInput({ req, querySchema: AdminSystemModelReferenceSchema }).query;
    return [modelId];
  })();

  const models = modelIds.map((modelId) => findModelData({ modelId }));
  if (models.some((model) => !model)) return Promise.reject(ModelErrEnum.unExist);

  // 外部渠道先解绑，失败时不进入 MongoDB 删除，避免产生新的悬空绑定。
  await removeModelsFromAIProxyChannels({ models: models.map((model) => model!.model) });

  await mongoSessionRun(async (session) => {
    const result = await MongoAIModel.deleteMany(
      { _id: { $in: modelIds }, scope: ModelScopeEnum.system },
      { session }
    );
    if (result.deletedCount !== modelIds.length) return Promise.reject(ModelErrEnum.unExist);

    await MongoResourcePermission.deleteMany(
      {
        resourceType: PerResourceTypeEnum.model,
        resourceId: { $in: modelIds }
      },
      { session }
    );
  });

  await updatedReloadSystemModel();
}

export default NextAPI(handler);
