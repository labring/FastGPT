import { NextAPI } from '@/service/middleware/entry';
import { MongoAgentSkillsVersion } from '@fastgpt/service/core/ai/skill/version/schema';
import { type PaginationResponse } from '@fastgpt/global/openapi/api';
import { type ApiRequestProps } from '@fastgpt/service/type/next';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import {
  ListSkillVersionsBodySchema,
  type ListSkillVersionsBody,
  type SkillVersionListItemType
} from '@fastgpt/global/openapi/core/ai/skill/api';
import { parsePaginationRequest } from '@fastgpt/service/common/api/pagination';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';

export type { ListSkillVersionsBody };
export type ListSkillVersionsResponse = PaginationResponse<SkillVersionListItemType>;

async function handler(
  req: ApiRequestProps<ListSkillVersionsBody>
): Promise<ListSkillVersionsResponse> {
  const { skillId, isCurrent } = parseApiInput({
    req,
    bodySchema: ListSkillVersionsBodySchema
  }).body;
  const { offset, pageSize } = parsePaginationRequest(req);

  const { skill } = await authSkill({
    skillId,
    req,
    per: ReadPermissionVal,
    authToken: true,
    authApiKey: true
  });

  if (isCurrent === true && !skill.currentVersionId) {
    return { total: 0, list: [] };
  }

  const match = {
    skillId,
    ...(isCurrent === true && { _id: skill.currentVersionId }),
    ...(isCurrent === false && skill.currentVersionId && { _id: { $ne: skill.currentVersionId } })
  };

  const [list, total] = await Promise.all([
    MongoAgentSkillsVersion.find(match)
      .sort({ createdAt: -1, _id: -1 })
      .skip(offset)
      .limit(pageSize)
      .select('-storageKey -importSource')
      .lean()
      .then((versions) =>
        versions.map((item) => ({
          _id: String(item._id),
          skillId: String(item.skillId),
          tmbId: String(item.tmbId),
          versionName: item.versionName,
          isCurrent: String(item._id) === String(skill.currentVersionId),
          createdAt: item.createdAt.toISOString()
        }))
      ),
    MongoAgentSkillsVersion.countDocuments(match)
  ]);

  return { total, list };
}

export default NextAPI(handler);
