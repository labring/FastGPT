import type { NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/agentSkills/version/schema';
import { type PaginationResponse } from '@fastgpt/web/common/fetch/type';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authSkill } from '@fastgpt/service/support/permission/agentSkill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  type ListSkillVersionsBody,
  type SkillVersionListItemType
} from '@fastgpt/global/openapi/core/agentSkills/api';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';

export type { ListSkillVersionsBody };
export type ListSkillVersionsResponse = PaginationResponse<SkillVersionListItemType>;

async function handler(
  req: ApiRequestProps<ListSkillVersionsBody>,
  _res: NextApiResponse<any>
): Promise<ListSkillVersionsResponse> {
  const { skillId, isActive } = req.body;
  const { offset, pageSize } = parsePaginationRequest(req);

  await authSkill({ skillId, req, per: ReadPermissionVal, authToken: true, authApiKey: true });

  const match = {
    skillId,
    isDeleted: false,
    ...(isActive !== undefined && { isActive })
  };

  const [list, total] = await Promise.all([
    MongoAgentSkillsVersion.find(match)
      .sort({ version: -1 })
      .skip(offset)
      .limit(pageSize)
      .select('-storage -importSource -isDeleted')
      .lean()
      .then((versions) =>
        versions.map((item) => ({
          _id: String(item._id),
          skillId: String(item.skillId),
          tmbId: String(item.tmbId),
          version: item.version,
          versionName: item.versionName,
          isActive: !!item.isActive,
          createdAt: item.createdAt.toISOString()
        }))
      ),
    MongoAgentSkillsVersion.countDocuments(match)
  ]);

  return { total, list };
}

export default NextAPI(handler);
