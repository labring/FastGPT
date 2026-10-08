import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import {
  authAndGetModelInstance,
  authModelInstanceAccess
} from '@fastgpt/service/support/permission/model/controller';
import { testModelConnection } from '@fastgpt/service/core/ai/model/test';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  TestModelQuerySchema,
  TestDraftModelBodySchema,
  type TestDraftModelBody,
  type TestModelQuery
} from '@fastgpt/global/openapi/core/ai/model/api';
import { isTeamModel, channelTypeToScope } from '@fastgpt/global/core/ai/model';
import type { SystemModelDataType } from '@fastgpt/global/core/ai/model/schema';

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

  const draftModel = {
    ...draftModelData,
    modelId: 'draft-model-test',
    requestUrl: undefined,
    requestAuth: undefined,
    scope: channelTypeToScope(channelType)
  } as SystemModelDataType;

  const isTeam = isTeamModel(draftModel);
  const authResult = await authModelInstanceAccess({ req, model: draftModel, isTeam });

  // 草稿或未带归属的团队模型测试时，归属回退为当前成员，保证请求落在成员自己的渠道桶
  if (isTeam) {
    draftModel.tmbId = draftModel.tmbId || authResult.ownerTmbId;
  }

  logger.debug('Test draft model', { model: draftModel.model, type: draftModel.type, channelId });
  return testModelConnection({ model: draftModel, teamId: authResult.teamId, channelId });
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
    model: installedModel,
    teamId,
    ownerTmbId
  } = await authAndGetModelInstance({
    req,
    modelId,
    channelType
  });

  // 显式渠道只覆盖本次测试的连接配置，不能修改全局运行时模型缓存
  const modelData = channelId
    ? { ...installedModel, requestUrl: undefined, requestAuth: undefined }
    : installedModel;

  if (isTeamModel(modelData)) {
    modelData.tmbId = modelData.tmbId || ownerTmbId;
  }

  logger.debug('Test installed model', { model: modelData.model, type: modelData.type, channelId });
  return testModelConnection({ model: modelData, teamId, channelId });
}

/** 统一分发模型连通性测试：POST 对应草稿预览测试，GET 对应已安装模型测试。 */
async function handler(req: ApiRequestProps<TestDraftModelBody, TestModelQuery>): Promise<void> {
  if (req.method === 'POST') {
    return handleDraftTest(req as ApiRequestProps<TestDraftModelBody>);
  }
  return handleInstalledTest(req as ApiRequestProps<Record<string, never>, TestModelQuery>);
}

export default NextAPI(handler);
