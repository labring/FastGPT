import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { findModelData } from '@fastgpt/service/core/ai/model';
import {
  refreshModelTemplates,
  updatedReloadSystemModel
} from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  AdminSystemModelReferenceSchema,
  type AdminSystemModelReference
} from '@fastgpt/global/openapi/admin/core/ai/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { mongoSessionRun } from '@fastgpt/service/common/mongo/sessionRun';
import { MongoResourcePermission } from '@fastgpt/service/support/permission/schema';
import { PerResourceTypeEnum } from '@fastgpt/global/support/permission/constant';

async function handler(
  req: ApiRequestProps<Record<string, never>, AdminSystemModelReference>
): Promise<void> {
  await authSystemAdmin({ req });
  const { modelId } = parseApiInput({ req, querySchema: AdminSystemModelReferenceSchema }).query;
  const pluginDocuments = await refreshModelTemplates();
  const modelData = findModelData({ modelId });

  if (!modelData) return Promise.reject(ModelErrEnum.unExist);
  if (pluginDocuments.some((model) => model.model === modelData.model)) {
    return Promise.reject('Plugin model cannot be deleted');
  }

  await mongoSessionRun(async (session) => {
    await MongoAIModel.deleteOne({ _id: modelId, scope: ModelScopeEnum.system }, { session });
    await MongoResourcePermission.deleteMany(
      {
        resourceType: PerResourceTypeEnum.model,
        resourceId: modelId
      },
      { session }
    );
  });

  await updatedReloadSystemModel({ pluginDocuments });
}

export default NextAPI(handler);
