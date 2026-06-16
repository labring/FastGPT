import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { getChatItems } from '@fastgpt/service/core/chat/controller';
import { addPreviewUrlToChatItems } from '@fastgpt/service/core/chat/utils';
import {
  chatItemResponsePreviewProjection,
  transformPreviewHistories
} from '@/global/core/chat/utils';
import { UserError } from '@fastgpt/global/common/error/utils';
import {
  SkillDebugRecordsBodySchema,
  type SkillDebugRecordsBody
} from '@fastgpt/global/core/ai/skill/api';
import type { GetRecordsV2ResponseType } from '@fastgpt/global/openapi/core/chat/record/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

const commonField =
  'obj value adminFeedback userGoodFeedback userBadFeedback time hideInUI durationSeconds errorMsg';

async function handler(
  req: ApiRequestProps<SkillDebugRecordsBody>
): Promise<GetRecordsV2ResponseType> {
  const { skillId, chatId, pageSize, initialId, nextId, prevId } = parseApiInput({
    req,
    bodySchema: SkillDebugRecordsBodySchema
  }).body;

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
    prevId,
    nodeResponseMode: 'preview',
    nodeResponsePreviewProjection: chatItemResponsePreviewProjection
  });

  await addPreviewUrlToChatItems(result.histories, 'chatFlow');

  const list = transformPreviewHistories(result.histories, true);
  const historiesMap = new Map(result.histories.map((h: any) => [h.dataId, h.responseData]));

  return {
    list: list.map((item) => ({
      ...item,
      id: item.dataId!,
      responseData: historiesMap.get(item.dataId)
    })),
    total: result.total,
    hasMorePrev: result.hasMorePrev,
    hasMoreNext: result.hasMoreNext
  };
}

export default NextAPI(handler);
