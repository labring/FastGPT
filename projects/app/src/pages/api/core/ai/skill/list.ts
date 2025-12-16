import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import {
  ListAiSkillBody,
  ListAiSkillResponseSchema,
  type ListAiSkillBodyType,
  type ListAiSkillResponse
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { MongoAiSkill } from '@fastgpt/service/core/ai/skill/schema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { authApp } from '@fastgpt/service/support/permission/app/auth';
import { WritePermissionVal } from '@fastgpt/global/support/permission/constant';

async function handler(
  req: ApiRequestProps<ListAiSkillBodyType>,
  res: ApiResponseType<any>
): Promise<ListAiSkillResponse> {
  const { appId, searchText } = ListAiSkillBody.parse(req.body);

  // Auth app with read permission
  const { teamId } = await authApp({ req, appId, per: WritePermissionVal, authToken: true });

  const { offset, pageSize } = parsePaginationRequest(req);

  // Build query
  const query = {
    teamId,
    appId,
    ...(searchText && {
      $or: [
        { name: { $regex: searchText, $options: 'i' } },
        { description: { $regex: searchText, $options: 'i' } }
      ]
    })
  };

  // Execute query with pagination - only fetch _id and name
  const list = await MongoAiSkill.find(query, '_id name')
    .sort({ updateTime: -1 })
    .skip(offset)
    .limit(pageSize)
    .lean();
  return ListAiSkillResponseSchema.parse(list);
}

export default NextAPI(handler);
