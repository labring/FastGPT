import { createEntityId } from '@fastgpt/global/common/string/entityId';
import { SqlRepositoryBase } from '@fastgpt/dal/db/sql/base';
import type { DbSession } from '@fastgpt/dal/db/types';
import {
  AppRegistrationDomainReadSchema,
  CreateAppRegistrationWriteSchema,
  type AppRegistrationDomainDTO,
  type AppRegistrationRepository,
  type CreateAppRegistrationWriteInput
} from '../repo.type';
import type { AppRegistrationDatabase, AppRegistrationSqlRow } from './table';

/** AppRegistration 仓储的可移植 SQL（Kysely）策略实现，通吃 PostgreSQL 与 OceanBase/MySQL。 */
export class SqlAppRegistrationRepository
  extends SqlRepositoryBase<
    AppRegistrationDatabase,
    'app_registrations',
    typeof AppRegistrationDomainReadSchema
  >
  implements AppRegistrationRepository
{
  protected readonly tableName = 'app_registrations';
  protected readonly readSchema = AppRegistrationDomainReadSchema;

  private mapRow(row: AppRegistrationSqlRow) {
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
    const row = await this.readDb(tx)
      .selectFrom('app_registrations')
      .selectAll()
      .where('_id', '=', id)
      .where('team_id', '=', teamId)
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
    const row = await this.readDb(tx)
      .selectFrom('app_registrations')
      .selectAll()
      .where('team_id', '=', teamId)
      .where('app_id', '=', appId)
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
    const rows = await this.readDb(tx)
      .selectFrom('app_registrations')
      .selectAll()
      .where('team_id', '=', teamId)
      .orderBy('_id', 'desc')
      .execute();

    return this.parseList(rows.map((row) => this.mapRow(row)));
  }

  async countByTeam({ teamId, tx }: { teamId: string; tx?: DbSession }): Promise<number> {
    const row = await this.readDb(tx)
      .selectFrom('app_registrations')
      .select((eb) => eb.fn.countAll<string>().as('count'))
      .where('team_id', '=', teamId)
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
      .insertInto('app_registrations')
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
    const res = await this.db(tx)
      .deleteFrom('app_registrations')
      .where('team_id', '=', teamId)
      .where('app_id', '=', appId)
      .executeTakeFirst();

    return Number(res.numDeletedRows ?? 0);
  }
}
