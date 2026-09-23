import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
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
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model/schema';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

async function handler(
  req: ApiRequestProps<TestDraftAdminSystemModelBody, TestAdminSystemModelQuery>
): Promise<void> {
  const { teamId } = await authSystemAdmin({ req });

  const { modelData, channelId } = await (async () => {
    if (req.method === 'POST') {
      const { modelData: draftModelData, channelId } = parseApiInput({
        req,
        bodySchema: TestDraftAdminSystemModelBodySchema
      }).body;

      return {
        modelData: {
          ...draftModelData,
          modelId: 'draft-model-test',
          requestUrl: undefined,
          requestAuth: undefined
        } as SystemModelDataType,
        channelId
      };
    }

    const { modelId, channelId } = parseApiInput({
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
      channelId
    };
  })();

  logger.debug('Test model', { model: modelData.model, type: modelData.type, channelId });

  // AI Proxy completions 接口支持通过请求头选择渠道，无需临时修改渠道模型绑定。
  return testSystemModel({ model: modelData, teamId, channelId });
}

export default NextAPI(handler);
