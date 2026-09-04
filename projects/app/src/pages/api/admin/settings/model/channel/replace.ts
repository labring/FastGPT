import type { ApiRequestProps } from '@fastgpt/next/type';
import { NextAPI } from '@/service/middleware/entry';
import { authSystemAdmin } from '@fastgpt/service/support/permission/user/auth';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoAIModel } from '@fastgpt/service/core/ai/config/schema';
import { replaceModelInAIProxyChannels } from '@fastgpt/service/thirdProvider/aiproxy/channel';
import { ModelScopeEnum } from '@fastgpt/global/core/ai/constants';
import { ModelErrEnum } from '@fastgpt/global/common/error/code/model';
import {
  ReplaceSystemModelChannelsBodySchema,
  type ReplaceSystemModelChannelsBody
} from '@fastgpt/global/openapi/admin/core/ai/model/api';

/**
 * 以提交的完整渠道集合替换模型绑定。
 *
 * 模型标识创建后不可变，因此只需按稳定 modelId 查询当前标识并替换其渠道集合。
 */
async function handler(req: ApiRequestProps<ReplaceSystemModelChannelsBody>): Promise<void> {
  await authSystemAdmin({ req });
  const { modelId, channelIds } = parseApiInput({
    req,
    bodySchema: ReplaceSystemModelChannelsBodySchema
  }).body;

  const existingModel = await MongoAIModel.findOne({
    _id: modelId,
    scope: ModelScopeEnum.system
  })
    .select({ model: 1 })
    .lean();
  if (!existingModel) return Promise.reject(ModelErrEnum.unExist);

  await replaceModelInAIProxyChannels({
    model: existingModel.model,
    channelIds
  });
}

export default NextAPI(handler);
