import type { ApiRequestProps, ApiResponseType } from '@fastgpt/service/type/next';
import { NextAPI } from '@/service/middleware/entry';
import type {
  GetGeneratedSkillsParamsType,
  GetGeneratedSkillsResponseType
} from '@fastgpt/global/openapi/core/chat/helperBot/generatedSkill/api';
import { MongoHelperBotGeneratedSkill } from '@fastgpt/service/core/chat/HelperBot/generatedSkillSchema';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';

type ListBody = GetGeneratedSkillsParamsType;
type ListResponse = GetGeneratedSkillsResponseType;

async function handler(
  req: ApiRequestProps<ListBody>,
  res: ApiResponseType<any>
): Promise<ListResponse> {
  const { searchText, status } = req.body;
  const { userId, teamId } = await authUserPer({ req, authToken: true, per: 'r' });

  const { offset, pageSize } = parsePaginationRequest(req);

  // Build query
  const query: any = {
    userId,
    teamId
  };

  if (status) {
    query.status = status;
  }

  if (searchText) {
    query.$or = [
      { name: { $regex: searchText, $options: 'i' } },
      { description: { $regex: searchText, $options: 'i' } }
    ];
  }

  // Execute query with pagination
  const [list, total] = await Promise.all([
    MongoHelperBotGeneratedSkill.find(query)
      .sort({ createTime: -1 })
      .skip(offset)
      .limit(pageSize)
      .lean(),
    MongoHelperBotGeneratedSkill.countDocuments(query)
  ]);

  // Remove userId and teamId from response
  const sanitizedList = list.map(({ userId, teamId, ...rest }) => ({
    ...rest,
    _id: String(rest._id)
  }));

  return {
    total,
    list: sanitizedList as any
  };
}

export default NextAPI(handler);
