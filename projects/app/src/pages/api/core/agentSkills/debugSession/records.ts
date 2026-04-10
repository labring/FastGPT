import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { addPreviewUrlToChatItems } from '@fastgpt/service/core/chat/utils';
import { transformPreviewHistories } from '@/global/core/chat/utils';
import { DispatchNodeResponseKeyEnum } from '@fastgpt/global/core/workflow/runtime/constants';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  SkillDebugRecordsBodySchema,
  type SkillDebugRecordsBody
} from '@fastgpt/global/core/agentSkills/api';
import type { GetRecordsV2ResponseType } from '@fastgpt/global/openapi/core/chat/record/api';

const commonField = `obj value adminFeedback userGoodFeedback userBadFeedback time hideInUI durationSeconds errorMsg ${DispatchNodeResponseKeyEnum.nodeResponse}`;

async function handler(
  req: ApiRequestProps<SkillDebugRecordsBody>,
  _res: ApiResponseType<any>
): Promise<GetRecordsV2ResponseType> {
  const { skillId, chatId, pageSize, initialId, nextId, prevId } =
    SkillDebugRecordsBodySchema.parse(req.body);

  if (!skillId) throw new UserError('skillId is required');
  if (!chatId) throw new UserError('chatId is required');

  await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
  });

  const result = await getChatItems({
    appId: skillId,
    chatId,
    field: commonField,
    limit: pageSize ?? 20,
    initialId,
    nextId,
    prevId
  });

  await addPreviewUrlToChatItems(result.histories, 'chatFlow');

  const list = transformPreviewHistories(result.histories, true);

  return {
    list: list.map((item) => ({
      ...item,
      id: item.dataId!
    })),
    total: result.total,
    hasMorePrev: result.hasMorePrev,
    hasMoreNext: result.hasMoreNext
  };
}

export default NextAPI(handler);
