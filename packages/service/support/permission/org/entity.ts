import { unwrapMongoSession } from '@fastgpt/dal/db/mongo/base';
import type { DbSession } from '@fastgpt/dal/db/types';
import { Types } from '../../../common/mongo';
import { MongoOrgModel } from './orgSchema';

/** 校验并返回指定团队内存在的组织 ID 集合；非法 ObjectId 自动忽略。 */
export const findTeamOrgIds = async ({
  teamId,
  orgIds,
  tx
}: {
  teamId: string;
  orgIds: string[];
  tx?: DbSession;
}): Promise<Set<string>> => {
  const validObjectIds = orgIds
    .filter((id) => Types.ObjectId.isValid(id))
    .map((id) => new Types.ObjectId(id));
  if (validObjectIds.length === 0) return new Set();

  const orgs = await MongoOrgModel.find({ teamId, _id: { $in: validObjectIds } }, '_id')
    .session(unwrapMongoSession(tx) ?? null)
    .lean();

  return new Set(orgs.map((item) => String(item._id)));
};
