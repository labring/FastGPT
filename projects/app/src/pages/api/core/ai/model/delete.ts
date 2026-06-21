import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { findModelFromAlldata } from '@fastgpt/service/core/ai/model';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import {
  createUserAuditActor,
  getEnterpriseAuditRequestContext,
  writeEnterpriseAuditEvent
} from '@fastgpt/service/support/enterprise/audit/util';
import {
  EnterpriseAuditActionEnum,
  EnterpriseAuditResourceTypeEnum,
  EnterpriseAuditResultEnum
} from '@fastgpt/global/support/enterprise/audit/constants';

export type deleteQuery = {
  model: string;
};

export type deleteBody = Record<string, never>;

export type deleteResponse = Record<string, never>;

async function handler(req: ApiRequestProps<deleteBody, deleteQuery>): Promise<deleteResponse> {
  const admin = await authSystemAdmin({ req });

  const { model } = req.query;

  const modelData = findModelFromAlldata(model);

  if (!modelData) {
    return Promise.reject('Model not found');
  }

  if (!modelData.isCustom) {
    return Promise.reject('System model cannot be deleted');
  }

  await MongoSystemModel.deleteOne({ model });

  await updatedReloadSystemModel();
  writeEnterpriseAuditEvent({
    action: EnterpriseAuditActionEnum.ModelConfigDelete,
    result: EnterpriseAuditResultEnum.Success,
    actor: createUserAuditActor({
      userId: admin.userId,
      teamId: admin.teamId,
      tmbId: admin.tmbId,
      isRoot: admin.isRoot
    }),
    resource: {
      type: EnterpriseAuditResourceTypeEnum.ModelConfig,
      id: model,
      name: modelData.name || model
    },
    ...getEnterpriseAuditRequestContext(req),
    metadata: {
      model,
      type: modelData.type,
      provider: modelData.provider
    }
  });

  return {};
}

export default NextAPI(handler);
