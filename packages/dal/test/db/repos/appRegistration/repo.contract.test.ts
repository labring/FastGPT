import { Types } from 'mongoose';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntityId } from '@fastgpt/global/common/string/entityId';
import { injectRepo } from '@fastgpt/dal/db/container';
import { DbRecordCorruptedError } from '@fastgpt/dal/db/errors';
import { coreOceanBaseDdls } from '@fastgpt/dal/db/repos/registry';
import { closeDbRuntime, configureDbRuntime } from '@fastgpt/dal/db/runtime';
import {
  createContractBackends,
  createMockOceanBaseKysely,
  type ContractBackendContext
} from '@fastgpt/dal/db/testing';
import { runInTransaction } from '@fastgpt/dal/db/transaction';
import { AppRegistrationRepoToken } from '@fastgpt/dal/db/repos/appRegistration/repo';
import {
  AppRegistrationCollectionName,
  appRegistrationMongoCollection
} from '../../../../db/repos/appRegistration/mongo/schema';
import {
  APP_REGISTRATION_OCEANBASE_DDL,
  AppRegistrationTableName
} from '../../../../db/repos/appRegistration/oceanbase/table';

describe('AppRegistrationRepository OceanBase DDL & L0 SQL behavior', () => {
  afterEach(async () => {
    await closeDbRuntime();
  });

  it('declares native OceanBase utf8mb4_bin DDL with fg_ index naming', () => {
    expect(APP_REGISTRATION_OCEANBASE_DDL).toContain(
      'CREATE TABLE IF NOT EXISTS `app_registrations`'
    );
    expect(APP_REGISTRATION_OCEANBASE_DDL).toContain('`created_at` DATETIME(3)');
    expect(APP_REGISTRATION_OCEANBASE_DDL).toContain('KEY `fg_app_reg_team` (`team_id`)');
    expect(APP_REGISTRATION_OCEANBASE_DDL).toContain(
      'DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;'
    );
  });

  it('compiles OceanBase Kysely queries, normalizes mixed-case IDs & nulls, and isolates corrupted rows without requiring Docker', async () => {
    const teamId = createEntityId();
    const tmbId = createEntityId();
    const appId = createEntityId();
    const id = createEntityId();
    const corruptedId = createEntityId();

    const { db, queries } = createMockOceanBaseKysely((q) => {
      if (q.sql.includes('count(*)')) {
        return { rows: [{ count: '2' }] };
      }
      if (q.sql.startsWith('delete from')) {
        return { rows: [], numAffectedRows: 1n };
      }
      if (q.sql.includes('where `_id` = ?')) {
        if (q.parameters[0] === corruptedId) {
          return {
            rows: [
              {
                _id: corruptedId,
                team_id: teamId,
                tmb_id: 'bad-id',
                app_id: appId,
                created_at: null
              }
            ]
          };
        }
        return {
          rows: [{ _id: id, team_id: teamId, tmb_id: tmbId, app_id: null, created_at: null }]
        };
      }
      if (q.sql.includes('order by `_id` desc')) {
        return {
          rows: [
            {
              _id: id,
              team_id: teamId,
              tmb_id: tmbId,
              app_id: appId,
              created_at: new Date('2026-06-01T00:00:00Z')
            },
            { _id: corruptedId, team_id: teamId, tmb_id: 'bad-id', app_id: appId, created_at: null }
          ]
        };
      }
      return { rows: [] };
    });

    configureDbRuntime({
      dialect: 'oceanbase',
      mainWriteUrl: 'mysql://root@127.0.0.1:2881/fastgpt',
      oceanBaseExecutorResolver: () => db
    });

    const repo = injectRepo(AppRegistrationRepoToken);

    const created = await repo.create({
      data: {
        _id: id.toUpperCase(),
        teamId: teamId.toUpperCase(),
        tmbId: tmbId.toUpperCase(),
        appId: appId.toUpperCase()
      }
    });
    expect(created._id).toBe(id);
    expect(created.teamId).toBe(teamId);
    expect(queries[0].sql).toContain('insert into `app_registrations`');

    // SQL NULL 统一归一为 undefined
    const nullableRow = await repo.findById({ id: id.toUpperCase(), teamId: teamId.toUpperCase() });
    expect(nullableRow).toEqual({ _id: id, teamId, tmbId, appId: undefined, createdAt: undefined });

    // 单行脏数据 Fail-Fast；列表 Warn & Skip
    await expect(repo.findById({ id: corruptedId, teamId })).rejects.toBeInstanceOf(
      DbRecordCorruptedError
    );
    const listed = await repo.listByTeam({ teamId });
    expect(listed).toHaveLength(1);
    expect(listed[0]._id).toBe(id);

    expect(await repo.countByTeam({ teamId: teamId.toUpperCase() })).toBe(2);
    expect(await repo.countByTeam({ teamId: 'invalid-id' })).toBe(0);
    expect(
      await repo.deleteByApp({ teamId: teamId.toUpperCase(), appId: appId.toUpperCase() })
    ).toBe(1);
  });
});

describe('AppRegistrationRepository dual-engine live contract (MongoDB + optional OceanBase/SeekDB)', () => {
  const backends = createContractBackends({
    mongoCollections: [appRegistrationMongoCollection],
    oceanBaseTables: [AppRegistrationTableName],
    oceanBaseDdls: coreOceanBaseDdls
  });

  for (const backend of backends) {
    describe(`[${backend.name}]`, () => {
      let ctx!: ContractBackendContext;
      const repo = injectRepo(AppRegistrationRepoToken);

      beforeAll(async () => {
        ctx = await backend.setup();
      });

      beforeEach(async () => {
        await ctx.clearAll();
      });

      afterAll(async () => {
        await backend.teardown();
      });

      it('normalizes IDs, dates, mixed-case hex, and nullable fields identically', async () => {
        const teamId = createEntityId();
        const tmbId = createEntityId();
        const appId = createEntityId();
        const id = createEntityId();
        const createdAt = new Date('2026-06-01T10:00:00.123Z');

        const created = await repo.create({
          data: {
            _id: id.toUpperCase(),
            teamId: teamId.toUpperCase(),
            tmbId: tmbId.toUpperCase(),
            appId: appId.toUpperCase(),
            createdAt
          }
        });
        expect(created).toEqual({ _id: id, teamId, tmbId, appId, createdAt });
        expect(await repo.findById({ id: id.toUpperCase(), teamId: teamId.toUpperCase() })).toEqual(
          created
        );
        expect(await repo.findById({ id: 'invalid-id', teamId })).toBeNull();

        const nullableId = createEntityId();
        await ctx.insertRawRow(
          ctx.dialect === 'mongo'
            ? {
                table: AppRegistrationCollectionName,
                row: {
                  _id: new Types.ObjectId(nullableId),
                  teamId: new Types.ObjectId(teamId),
                  tmbId: new Types.ObjectId(tmbId),
                  appId: null,
                  createdAt: null
                }
              }
            : {
                table: AppRegistrationTableName,
                row: {
                  _id: nullableId,
                  team_id: teamId,
                  tmb_id: tmbId,
                  app_id: null,
                  created_at: null
                }
              }
        );

        expect(await repo.findById({ id: nullableId, teamId })).toEqual({
          _id: nullableId,
          teamId,
          tmbId,
          appId: undefined,
          createdAt: undefined
        });
      });

      it('enforces tenant isolation across lookups, counts, listing, and deletion', async () => {
        const teamA = createEntityId();
        const teamB = createEntityId();
        const tmbA = createEntityId();
        const tmbB = createEntityId();
        const appA1 = createEntityId();
        const appA2 = createEntityId();
        const appB1 = createEntityId();

        const regA1 = await repo.create({ data: { teamId: teamA, tmbId: tmbA, appId: appA1 } });
        const regA2 = await repo.create({ data: { teamId: teamA, tmbId: tmbA, appId: appA2 } });
        const regB1 = await repo.create({ data: { teamId: teamB, tmbId: tmbB, appId: appB1 } });

        expect(await repo.findByTeamAndApp({ teamId: teamA, appId: appA1 })).toEqual(regA1);
        expect(await repo.findByTeamAndApp({ teamId: teamB, appId: appA1 })).toBeNull();
        expect(await repo.findById({ id: regA1._id, teamId: teamB })).toBeNull();
        expect(await repo.countByTeam({ teamId: teamA })).toBe(2);
        expect((await repo.listByTeam({ teamId: teamA })).map((r) => r._id)).toEqual([
          regA2._id,
          regA1._id
        ]);

        expect(await repo.deleteByApp({ teamId: teamB, appId: appA1 })).toBe(0);
        expect(await repo.deleteByApp({ teamId: teamA, appId: appA1 })).toBe(1);
        expect(await repo.countByTeam({ teamId: teamA })).toBe(1);
        expect(await repo.findById({ id: regB1._id, teamId: teamB })).toEqual(regB1);
      });

      it('fails fast on corrupted single row and skips corrupted rows in listByTeam', async () => {
        const teamId = createEntityId();
        const valid = await repo.create({
          data: { teamId, tmbId: createEntityId(), appId: createEntityId() }
        });
        const corruptedId = createEntityId();

        await ctx.insertRawRow(
          ctx.dialect === 'mongo'
            ? {
                table: AppRegistrationCollectionName,
                row: {
                  _id: new Types.ObjectId(corruptedId),
                  teamId: new Types.ObjectId(teamId),
                  tmbId: 'corrupted-tmb',
                  appId: new Types.ObjectId(createEntityId()),
                  createdAt: new Date()
                }
              }
            : {
                table: AppRegistrationTableName,
                row: {
                  _id: corruptedId,
                  team_id: teamId,
                  tmb_id: 'corrupted-tmb',
                  app_id: createEntityId(),
                  created_at: new Date()
                }
              }
        );

        await expect(repo.findById({ id: corruptedId, teamId })).rejects.toBeInstanceOf(
          DbRecordCorruptedError
        );
        expect(await repo.listByTeam({ teamId })).toEqual([valid]);
      });

      it('commits with ordered afterCommit hooks and rolls back cleanly on error', async () => {
        const teamId = createEntityId();
        const tmbId = createEntityId();
        const appId1 = createEntityId();
        const appId2 = createEntityId();
        const events: string[] = [];

        const committed = await runInTransaction(async (tx) => {
          const record = await repo.create({ data: { teamId, tmbId, appId: appId1 }, tx });
          tx.afterCommit(() => {
            events.push(`first:${record._id}`);
          });
          tx.afterCommit(() => {
            events.push(`second:${record.appId}`);
          });
          return record;
        });

        expect(events).toEqual([`first:${committed._id}`, `second:${appId1}`]);

        const abortedHook = vi.fn();
        await expect(
          runInTransaction(async (tx) => {
            await repo.create({ data: { teamId, tmbId, appId: appId2 }, tx });
            tx.afterCommit(abortedHook);
            throw new Error('simulated failure');
          })
        ).rejects.toThrow('simulated failure');

        expect(abortedHook).not.toHaveBeenCalled();
        expect(await repo.findByTeamAndApp({ teamId, appId: appId2 })).toBeNull();
      });
    });
  }
});
