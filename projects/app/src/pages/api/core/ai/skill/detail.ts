import { NextAPI } from '@/service/middleware/entry';
import { authSkill } from '@fastgpt/service/support/permission/skill/auth';
import { ReadPermissionVal } from '@fastgpt/global/support/permission/constant';
import type {
  GetSkillDetailQuery,
  GetSkillDetailResponse
} from '@fastgpt/global/core/ai/skill/api';
import { GetSkillDetailQuerySchema } from '@fastgpt/global/core/ai/skill/api';
import { isValidObjectId } from 'mongoose';
import type { ApiRequestProps } from '@fastgpt/service/type/next';
import { AppCollectionName } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { Types } from '@fastgpt/service/common/mongo';
import { SkillErrEnum } from '@fastgpt/global/common/error/code/skill';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { buildAppVersionSkillRefMongoQuery } from '@fastgpt/service/core/app/resourceRefs';

async function handler(
  req: ApiRequestProps<Record<string, never>, GetSkillDetailQuery>
): Promise<GetSkillDetailResponse> {
  const { skillId } = parseApiInput({ req, querySchema: GetSkillDetailQuerySchema }).query;

  if (!skillId || !isValidObjectId(skillId)) {
    return Promise.reject(SkillErrEnum.invalidSkillId);
  }

  const { skill, permission, teamId } = await authSkill({
    req,
    authToken: true,
    authApiKey: true,
    skillId,
    per: ReadPermissionVal
  });

  const [countResult] = await MongoAppVersion.aggregate<{ count: number }>([
    { $match: { isPublish: true } },
    { $sort: { appId: 1, time: -1, _id: -1 } },
    {
      $group: {
        _id: '$appId',
        resourceRefs: { $first: '$resourceRefs' }
      }
    },
    { $match: buildAppVersionSkillRefMongoQuery(skill._id.toString()) },
    {
      $lookup: {
        from: AppCollectionName,
        localField: '_id',
        foreignField: '_id',
        as: 'app'
      }
    },
    { $unwind: '$app' },
    {
      $match: {
        'app.teamId': new Types.ObjectId(String(teamId)),
        'app.deleteTime': null
      }
    },
    { $count: 'count' }
  ]);
  const appCount = countResult?.count ?? 0;

  return {
    _id: skill._id,
    source: skill.source,
    type: skill.type,
    parentId: skill.parentId,
    inheritPermission: skill.inheritPermission,
    name: skill.name,
    description: skill.description,
    category: skill.category,
    avatar: skill.avatar,
    creationStatus: skill.creationStatus,
    creationError: skill.creationError,
    teamId: skill.teamId,
    tmbId: skill.tmbId,
    currentVersionId: skill.currentVersionId ? String(skill.currentVersionId) : undefined,
    createTime: skill.createTime?.toISOString() || new Date().toISOString(),
    updateTime: skill.updateTime?.toISOString() || new Date().toISOString(),
    permission,
    appCount
  };
}

export default NextAPI(handler);
