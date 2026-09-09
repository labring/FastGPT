import { NextAPI } from '@/service/middleware/entry';
import { formatReadableReferencedApps } from '@/service/core/app/reference';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type {
  ListAppsBySkillIdQuery,
  ListAppsBySkillIdResponse
} from '@fastgpt/global/core/ai/skill/api';
import { ListAppsBySkillIdQuerySchema } from '@fastgpt/global/core/ai/skill/api';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authUserPer } from '@fastgpt/service/support/permission/user/auth';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { buildAppSkillRefMongoQuery } from '@fastgpt/service/core/app/resourceRefs';
import { findAppsByCurrentResourceRefs } from '@fastgpt/service/core/app/currentResourceRefs';

async function handler(
  req: ApiRequestProps<unknown, ListAppsBySkillIdQuery>
): Promise<ListAppsBySkillIdResponse> {
  const { skillId, referenceScope } = parseApiInput({
    req,
    querySchema: ListAppsBySkillIdQuerySchema
  }).query;
  const { teamId } = await authUserPer({
    req,
    authToken: true,
    authApiKey: true,
    per: ReadPermissionVal
  });

  const apps =
    referenceScope === 'current'
      ? await findAppsByCurrentResourceRefs({
          teamId,
          resourceType: 'skill',
          resourceIds: [skillId]
        })
      : await MongoApp.find(
          {
            teamId,
            deleteTime: null,
            ...buildAppSkillRefMongoQuery(skillId)
          },
          '_id parentId avatar type name intro tmbId updateTime inheritPermission'
        )
          .sort({ updateTime: -1 })
          .lean();

  return formatReadableReferencedApps({ req, apps });
}

export default NextAPI(handler);
