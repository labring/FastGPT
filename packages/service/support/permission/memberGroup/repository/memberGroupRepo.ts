import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import type { MemberGroupLookupRepository } from '@fastgpt/dal/db/repos/memberGroup/repo.type';
import { Types } from '../../../../common/mongo';
import { MongoMemberGroupModel } from '../memberGroupSchema';

/** member_groups 的 Mongo 仓储适配层（实现 `@fastgpt/dal/db/repos/memberGroup/repo.type` 公开契约）。 */
export const memberGroupRepo: MemberGroupLookupRepository = {
  /** 校验并返回指定团队内存在的成员分组 ID 集合；非法 ObjectId 自动忽略。 */
  findTeamMemberGroupIds: async ({ teamId, groupIds, tx }): Promise<Set<string>> => {
    const validObjectIds = groupIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (validObjectIds.length === 0) return new Set();

    const groups = await MongoMemberGroupModel.find({ teamId, _id: { $in: validObjectIds } }, '_id')
      .session(unwrapMongoSession(tx) ?? null)
      .lean();

    return new Set(groups.map((item) => String(item._id)));
  }
};
