import { createEntityId, isValidEntityId } from '@fastgpt/global/common/string/entityId';
import { OceanBaseRepositoryBase } from '../../../oceanbase/base';
import type { DbRuntime } from '../../../runtime';
import type { DbSession } from '../../../types';
import {
  AppRegistrationDomainReadSchema,
  CreateAppRegistrationWriteSchema,
  type AppRegistrationDomainDTO,
  type AppRegistrationRepository,
  type CreateAppRegistrationWriteInput
} from '../repo.type';
import {
  AppRegistrationTableName,
  type AppRegistrationDatabase,
  type AppRegistrationOceanBaseRow
} from './table';

/** AppRegistration 仓储的 OceanBase（Kysely + mysql2）策略实现。 */
export class OceanBaseAppRegistrationRepository
  extends OceanBaseRepositoryBase<
    AppRegistrationDatabase,
    typeof AppRegistrationTableName,
    typeof AppRegistrationDomainReadSchema
  >
  implements AppRegistrationRepository
{
  constructor(runtime?: DbRuntime) {
    super({
      tableName: AppRegistrationTableName,
      readSchema: AppRegistrationDomainReadSchema,
      runtime
    });
  }

  private mapRow(row: AppRegistrationOceanBaseRow) {
    return {
      _id: row._id,
      teamId: row.team_id,
      tmbId: row.tmb_id,
      appId: row.app_id,
      createdAt: row.created_at
    };
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

    const row = await this.db(tx)
      .selectFrom(AppRegistrationTableName)
      .selectAll()
      .where('_id', '=', this.normalizeId(id))
      .where('team_id', '=', this.normalizeId(teamId))
      .executeTakeFirst();

    return this.parseNullable(row !== undefined ? this.mapRow(row) : undefined);
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

    const row = await this.db(tx)
      .selectFrom(AppRegistrationTableName)
      .selectAll()
      .where('team_id', '=', this.normalizeId(teamId))
      .where('app_id', '=', this.normalizeId(appId))
      .limit(1)
      .executeTakeFirst();

    return this.parseNullable(row !== undefined ? this.mapRow(row) : undefined);
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

    const rows = await this.db(tx)
      .selectFrom(AppRegistrationTableName)
      .selectAll()
      .where('team_id', '=', this.normalizeId(teamId))
      .orderBy('_id', 'desc')
      .execute();

    return this.parseList(rows.map((row) => this.mapRow(row)));
  }

  async countByTeam({ teamId, tx }: { teamId: string; tx?: DbSession }): Promise<number> {
    if (!isValidEntityId(teamId)) {
      return 0;
    }

    const row = await this.db(tx)
      .selectFrom(AppRegistrationTableName)
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('team_id', '=', this.normalizeId(teamId))
      .executeTakeFirstOrThrow();

    return Number(row.count);
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

    await this.db(tx)
      .insertInto(AppRegistrationTableName)
      .values({
        _id: id,
        team_id: parsed.teamId,
        tmb_id: parsed.tmbId,
        app_id: parsed.appId,
        created_at: createdAt
      })
      .execute();

    return this.parseRow({
      _id: id,
      teamId: parsed.teamId,
      tmbId: parsed.tmbId,
      appId: parsed.appId,
      createdAt
    });
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

    const res = await this.db(tx)
      .deleteFrom(AppRegistrationTableName)
      .where('team_id', '=', this.normalizeId(teamId))
      .where('app_id', '=', this.normalizeId(appId))
      .executeTakeFirst();

    return Number(res.numDeletedRows ?? 0n);
  }
}
