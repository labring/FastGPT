import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { NextAPI } from '@/service/middleware/entry';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import { MongoChat } from '@fastgpt/service/core/chat/chatSchema';
import { ChatSourceEnum } from '@fastgpt/global/core/chat/constants';
import { getLogger, LogCategories } from '@fastgpt/service/common/logger';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import {
  SkillDebugSessionListQuerySchema,
  type SkillDebugSessionListQuery,
  type SkillDebugSessionListResponse
} from '@fastgpt/global/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

const logger = getLogger(LogCategories.MODULE.AGENT_SKILLS);

async function handler(req: ApiRequestProps<Record<string, never>, SkillDebugSessionListQuery>) {
  const { skillId } = parseApiInput({
    req,
    querySchema: SkillDebugSessionListQuerySchema
  }).query;

  // Authenticate skill access
  await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
  });

  const { pageSize, offset } = parsePaginationRequest(req);

  logger.debug('Listing skill debug sessions', { skillId, pageSize, offset });

  const [list, total] = await Promise.all([
    MongoChat.find(
      { appId: skillId, source: ChatSourceEnum.test, deleteTime: null },
      'chatId title updateTime'
    )
      .sort({ updateTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoChat.countDocuments({ appId: skillId, source: ChatSourceEnum.test, deleteTime: null })
  ]);

  const result: SkillDebugSessionListResponse = {
    list: list.map((item) => ({
      chatId: item.chatId,
      title: item.title,
      updateTime: item.updateTime.toISOString()
    })),
    total
  };

  return result;
}

export default NextAPI(handler);
