import { Types } from 'mongoose';
import z from 'zod';
import { MongoRepositoryBase } from '../../../mongo/base';
import type { DbRuntime } from '../../../runtime';
import type { DbSession } from '../../../types';
import type { OrgLookupRepository } from '../repo.type';
import { orgLookupMongoCollection, type OrgLookupMongoDoc } from './schema';

const OrgPassthroughReadSchema = z.unknown();

/** team_orgs 的 MongoDB 主体解析仓储实现。 */
export class MongoOrgLookupRepository
  extends MongoRepositoryBase<OrgLookupMongoDoc, typeof OrgPassthroughReadSchema>
  implements OrgLookupRepository
{
  constructor(runtime?: DbRuntime) {
    super({
      collection: orgLookupMongoCollection,
      readSchema: OrgPassthroughReadSchema,
      runtime
    });
  }

  /** 校验并返回指定团队内存在的组织 ID 集合；非法 ObjectId 自动忽略。 */
  async findTeamOrgIds({
    teamId,
    orgIds,
    tx
  }: {
    teamId: string;
    orgIds: string[];
    tx?: DbSession;
  }): Promise<Set<string>> {
    const validObjectIds = orgIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => this.oid(id));
    if (validObjectIds.length === 0) return new Set();

    const orgs = await this.model
      .find({ teamId, _id: { $in: validObjectIds } }, '_id', this.txOpts(tx))
      .lean();

    return new Set(orgs.map((item) => String(item._id)));
  }
}
