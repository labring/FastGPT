import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import type { OrgLookupRepository } from '@fastgpt/dal/db/repos/org/repo.type';
import { Types } from '../../../../common/mongo';
import { MongoOrgModel } from '../orgSchema';

/** orgs 的 Mongo 仓储适配层（实现 `@fastgpt/dal/db/repos/org/repo.type` 公开契约）。 */
export const orgRepo: OrgLookupRepository = {
  /** 校验并返回指定团队内存在的组织 ID 集合；非法 ObjectId 自动忽略。 */
  findTeamOrgIds: async ({ teamId, orgIds, tx }): Promise<Set<string>> => {
    const validObjectIds = orgIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (validObjectIds.length === 0) return new Set();

    const orgs = await MongoOrgModel.find({ teamId, _id: { $in: validObjectIds } }, '_id')
      .session(unwrapMongoSession(tx) ?? null)
      .lean();

    return new Set(orgs.map((item) => String(item._id)));
  }
};
