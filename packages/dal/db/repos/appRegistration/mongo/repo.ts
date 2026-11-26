import { createEntityId, isValidEntityId } from '@fastgpt/global/common/string/entityId';
import { MongoRepositoryBase } from '../../../mongo/base';
import type { DbRuntime } from '../../../runtime';
import type { DbSession } from '../../../types';
import {
  AppRegistrationDomainReadSchema,
  CreateAppRegistrationWriteSchema,
  type AppRegistrationDomainDTO,
  type AppRegistrationRepository,
  type CreateAppRegistrationWriteInput
} from '../repo.type';
import { appRegistrationMongoCollection, type AppRegistrationMongoDoc } from './schema';

/** AppRegistration 仓储的 MongoDB 策略实现（构造期由父类自动绑定当前 DbRuntime 的 readonly model）。 */
export class MongoAppRegistrationRepository
  extends MongoRepositoryBase<AppRegistrationMongoDoc, typeof AppRegistrationDomainReadSchema>
  implements AppRegistrationRepository
{
  constructor(runtime?: DbRuntime) {
    super({
      collection: appRegistrationMongoCollection,
      readSchema: AppRegistrationDomainReadSchema,
      runtime
    });
  }

  async findById({
    id,
    teamId,
    tx
  }: {
    id: string;
    teamId: string;
    tx?: DbSession;
  }): Promise<AppRegistrationDomainDTO | null> {
    if (!isValidEntityId(id) || !isValidEntityId(teamId)) {
      return null;
    }

    const doc = await this.model
      .findOne({ _id: this.oid(id), teamId: this.oid(teamId) }, undefined, this.txOpts(tx))
      .lean();

    return this.parseNullable(doc);
  }

  async findByTeamAndApp({
    teamId,
    appId,
    tx
  }: {
    teamId: string;
    appId: string;
    tx?: DbSession;
  }): Promise<AppRegistrationDomainDTO | null> {
    if (!isValidEntityId(teamId) || !isValidEntityId(appId)) {
      return null;
    }

    const doc = await this.model
      .findOne({ teamId: this.oid(teamId), appId: this.oid(appId) }, undefined, this.txOpts(tx))
      .lean();

    return this.parseNullable(doc);
  }

  async listByTeam({
    teamId,
    tx
  }: {
    teamId: string;
    tx?: DbSession;
  }): Promise<AppRegistrationDomainDTO[]> {
    if (!isValidEntityId(teamId)) {
      return [];
    }

    const docs = await this.model
      .find({ teamId: this.oid(teamId) }, undefined, {
        ...this.txOpts(tx),
        sort: { _id: -1 }
      })
      .lean();

    return this.parseList(docs);
  }

  async countByTeam({ teamId, tx }: { teamId: string; tx?: DbSession }): Promise<number> {
    if (!isValidEntityId(teamId)) {
      return 0;
    }

    const session = this.txOpts(tx).session;
    const query = this.model.countDocuments({ teamId: this.oid(teamId) });
    if (session !== undefined) {
      query.session(session);
    }
    return query;
  }

  async create({
    data,
    tx
  }: {
    data: CreateAppRegistrationWriteInput;
    tx?: DbSession;
  }): Promise<AppRegistrationDomainDTO> {
    const parsed = CreateAppRegistrationWriteSchema.parse(data);
    const id = parsed._id ?? createEntityId();
    const createdAt = parsed.createdAt ?? new Date();

    const [created] = await this.model.create(
      [
        {
          _id: this.oid(id),
          teamId: this.oid(parsed.teamId),
          tmbId: this.oid(parsed.tmbId),
          appId: this.oid(parsed.appId),
          createdAt
        }
      ],
      this.txOpts(tx)
    );

    return this.parseRow(created.toObject());
  }

  async deleteByApp({
    teamId,
    appId,
    tx
  }: {
    teamId: string;
    appId: string;
    tx?: DbSession;
  }): Promise<number> {
    if (!isValidEntityId(teamId) || !isValidEntityId(appId)) {
      return 0;
    }

    const res = await this.model.deleteMany(
      { teamId: this.oid(teamId), appId: this.oid(appId) },
      this.txOpts(tx)
    );
    return res.deletedCount ?? 0;
  }
}
