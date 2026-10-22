import { authModelConfig, authModelScope } from '@/service/core/ai/model/auth';
import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';

import type { AIModelDataType } from '@fastgpt/global/core/ai/model/schema';
import { channelTypeToScope } from '@fastgpt/global/core/ai/model/utils';
import {
  TestDraftModelBodySchema,
  TestModelQuerySchema,
  type TestDraftModelBody,
  type TestModelQuery
} from '@fastgpt/global/openapi/core/ai/model/api';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { testModelConnection } from '@fastgpt/service/core/ai/model/test';

const logger = getLogger(LogCategories.MODULE.AI.MODEL);

/**
 * 测试新增或编辑中的模型草稿（从 Request Body 解析当前未落库的表单配置）
 */
async function handleDraftTest(req: ApiRequestProps<TestDraftModelBody>): Promise<void> {
  const {
    modelData: draftModelData,
    channelId,
    channelType
  } = parseApiInput({
    req,
    bodySchema: TestDraftModelBodySchema
  }).body;

  const actor = await authModelScope({ req, channelType });
  const draftModel = {
    ...draftModelData,
    modelId: 'draft-model-test',
    requestUrl: undefined,
    requestAuth: undefined,
    scope: channelTypeToScope(channelType),
    // 草稿尚未成为模型资源，按入口能力鉴权；团队草稿归属固定使用当前身份。
    ...(channelType === 'team' && { teamId: actor.teamId, tmbId: actor.tmbId })
  } as AIModelDataType;

  logger.debug('Test draft model', { model: draftModel.model, type: draftModel.type, channelId });
  return testModelConnection({ model: draftModel, teamId: actor.teamId, channelId });
}

/**
 * 测试已持久化的模型实例（从 Query Params 检索模型与校验权限）
 */
async function handleInstalledTest(
  req: ApiRequestProps<Record<string, never>, TestModelQuery>
): Promise<void> {
  const { modelId, channelId, channelType } = parseApiInput({
    req,
    querySchema: TestModelQuerySchema
  }).query;

  const {
    actor: { teamId },
    models: [installedModel]
  } = await authModelConfig({ req, modelIds: [modelId], channelType });

  // 显式渠道只覆盖本次测试的连接配置，不能修改全局运行时模型缓存
  const modelData = channelId
    ? { ...installedModel, requestUrl: undefined, requestAuth: undefined }
    : installedModel;

  logger.debug('Test installed model', { model: modelData.model, type: modelData.type, channelId });
  return testModelConnection({ model: modelData, teamId, channelId });
}

/** 统一分发模型连通性测试：POST 对应草稿预览测试，GET 对应已安装模型测试。 */
async function handler(req: ApiRequestProps<TestDraftModelBody, TestModelQuery>): Promise<void> {
  if (req.method === 'POST') {
    return handleDraftTest(req as ApiRequestProps<TestDraftModelBody>);
  }
  return handleInstalledTest(
    req as unknown as ApiRequestProps<Record<string, never>, TestModelQuery>
  );
}

export default NextAPI(handler);
