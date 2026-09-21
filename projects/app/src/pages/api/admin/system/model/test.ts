import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin, authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { assertMemberChannelPermission } from '@fastgpt/service/core/ai/channel';
import { getModelHandle } from '@fastgpt/service/core/ai/model';
import { testSystemModel } from '@fastgpt/service/core/ai/modelStatus/test';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  TestAdminSystemModelQuerySchema,
  TestDraftAdminSystemModelBodySchema,
  type TestDraftAdminSystemModelBody,
  type TestAdminSystemModelQuery
} from '@fastgpt/global/openapi/admin/system/model/api';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model/schema';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

async function handler(
  req: ApiRequestProps<TestDraftAdminSystemModelBody, TestAdminSystemModelQuery>
): Promise<void> {
  const { modelData, channelId, channelType } = await (async () => {
    if (req.method === 'POST') {
      const {
        modelData: draftModelData,
        channelId,
        channelType
      } = parseApiInput({
        req,
        bodySchema: TestDraftAdminSystemModelBodySchema
      }).body;

      return {
        modelData: {
          ...draftModelData,
          modelId: 'draft-model-test',
          requestUrl: undefined,
          requestAuth: undefined,
          scope: channelType === 'team' ? ModelScopeEnum.team : ModelScopeEnum.system
        } as SystemModelDataType,
        channelId,
        channelType
      };
    }

    const { modelId, channelId, channelType } = parseApiInput({
      req,
      querySchema: TestAdminSystemModelQuerySchema
    }).query;
    const modelHandle = await getModelHandle();
    const installedModel = modelHandle.findModelData({ modelId });
    if (!installedModel) throw ModelErrEnum.unExist;

    return {
      // 显式渠道只覆盖本次测试的连接配置，不能修改全局运行时模型缓存。
      modelData: channelId
        ? { ...installedModel, requestUrl: undefined, requestAuth: undefined }
        : installedModel,
      channelId,
      channelType: channelType ?? (installedModel.scope === ModelScopeEnum.team ? 'team' : 'system')
    };
  })();

  const isTeam = channelType === 'team' || modelData.scope === ModelScopeEnum.team;
  let teamId: string | undefined;

  if (isTeam) {
    const userAuth = await authUserPer({ req, authToken: true });
    teamId = userAuth.teamId;
    if (!userAuth.isRoot) {
      await assertMemberChannelPermission(userAuth.tmb.permission);
      if (modelData.tmbId && String(modelData.tmbId) !== userAuth.tmbId) {
        return Promise.reject(ModelErrEnum.unExist);
      }
    }
    modelData.tmbId = userAuth.tmbId;
    modelData.scope = ModelScopeEnum.team;
  } else {
    const adminAuth = await authSystemAdmin({ req });
    teamId = adminAuth.teamId;
  }

  logger.debug('Test model', { model: modelData.model, type: modelData.type, channelId });

  // AI Proxy completions 接口支持通过请求头选择渠道，无需临时修改渠道模型绑定。
  return testSystemModel({ model: modelData, teamId, channelId });
}

export default NextAPI(handler);
