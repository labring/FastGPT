import { Types } from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntityId } from '@fastgpt/global/common/string/entityId';
import { injectRepo } from '@fastgpt/dal/db/container';
import { DbRecordCorruptedError } from '@fastgpt/dal/db/errors';
import { compileSqlTableDDL } from '@fastgpt/dal/db/sql/ddl';
import {
  createContractBackends,
  parseRequiredSqlDialects,
  registerMultiDialectContractSuite
} from '@fastgpt/dal/db/testing';
import type { SqlDialect } from '@fastgpt/dal/db/types';
import { runInTransaction } from '@fastgpt/dal/db/transaction';
import { AppRegistrationRepoToken } from '@fastgpt/dal/db/repos/appRegistration/repo';
import {
  AppRegistrationCollectionName,
  appRegistrationMongoCollection
} from '../../../../db/repos/appRegistration/mongo/schema';
import { appRegistrationSqlTable } from '../../../../db/repos/appRegistration/sql/table';

describe('AppRegistration portable SQL DDL', () => {
  it('compiles cleanly for OceanBase/MySQL (P0) and PostgreSQL (P1) with fg_ index naming', () => {
    const obSql = compileSqlTableDDL(appRegistrationSqlTable, 'oceanbase').join('\n');
    expect(obSql).toContain('CREATE TABLE IF NOT EXISTS `app_registrations`');
    expect(obSql).toContain('`created_at` DATETIME(3)');
    expect(obSql).toContain('KEY `fg_app_reg_team` (`team_id`)');
    expect(obSql).toContain('DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;');
    expect(obSql).not.toContain('CREATE INDEX IF NOT EXISTS');

    const pgSql = compileSqlTableDDL(appRegistrationSqlTable, 'postgres').join('\n');
    expect(pgSql).toContain('CREATE TABLE IF NOT EXISTS "app_registrations"');
    expect(pgSql).toContain('"created_at" TIMESTAMPTZ');
    expect(pgSql).toContain('CREATE INDEX IF NOT EXISTS "fg_app_reg_team"');
  });
});

describe('AppRegistrationRepository multi-dialect contract', () => {
  const requiredSqlDialects = parseRequiredSqlDialects(process.env);
  const executedExternalSqlDialects = new Set<SqlDialect>();
  const contractBackends = createContractBackends({
    collections: [appRegistrationMongoCollection],
    tables: [appRegistrationSqlTable]
  });

  afterAll(() => {
    for (const required of requiredSqlDialects) {
      expect(
        executedExternalSqlDialects.has(required),
        `FASTGPT_TEST_REQUIRED_SQL_DIALECTS requires "${required}", but its external contract backend did not execute`
      ).toBe(true);
    }
  });

  registerMultiDialectContractSuite({
    describeFn: describe,
    beforeAllFn: beforeAll,
    beforeEachFn: beforeEach,
    afterAllFn: afterAll,
    backends: contractBackends,
    registerTests: (ctx) => {
      const repo = injectRepo(AppRegistrationRepoToken);

      it('normalizes IDs, dates, and nullable fields identically across dialects', async () => {
        if (ctx.getFamily() === 'sql' && ctx.supportsMultiConnectionConcurrency()) {
          executedExternalSqlDialects.add(ctx.getDialect() as SqlDialect);
        }
        const teamId = createEntityId();
        const tmbId = createEntityId();
        const appId = createEntityId();
        const createdAt = new Date('2026-06-01T10:00:00.123Z');

        const created = await repo.create({
          data: { teamId, tmbId, appId, createdAt }
        });
        expect(created).toEqual({
          _id: created._id,
          teamId,
          tmbId,
          appId,
          createdAt
        });

        const found = await repo.findById({ id: created._id, teamId });
        expect(found).toEqual(created);

        // 校验历史可空字段（appId / createdAt）在 SQL null 与 Mongo 缺失/null 时统一归一为 undefined
        const nullableRowId = createEntityId();
        await ctx.insertRawRow({
          mongo: {
            collection: AppRegistrationCollectionName,
            doc: {
              _id: new Types.ObjectId(nullableRowId),
              teamId: new Types.ObjectId(teamId),
              tmbId: new Types.ObjectId(tmbId),
              appId: null,
              createdAt: null
            }
          },
          sql: {
            table: appRegistrationSqlTable.name,
            row: {
              _id: nullableRowId,
              team_id: teamId,
              tmb_id: tmbId,
              app_id: null,
              created_at: null
            }
          }
        });

        const nullableRow = await repo.findById({ id: nullableRowId, teamId });
        expect(nullableRow).toEqual({
          _id: nullableRowId,
          teamId,
          tmbId,
          appId: undefined,
          createdAt: undefined
        });
      });

      it('enforces tenant isolation for findByTeamAndApp, countByTeam, listByTeam, and deleteByApp', async () => {
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
        expect(await repo.countByTeam({ teamId: teamB })).toBe(1);

        const listA = await repo.listByTeam({ teamId: teamA });
        expect(listA.map((item) => item._id)).toEqual([regA2._id, regA1._id]);

        // 跨团队删除不会影响目标数据
        expect(await repo.deleteByApp({ teamId: teamB, appId: appA1 })).toBe(0);
        expect(await repo.countByTeam({ teamId: teamA })).toBe(2);

        // 本团队按应用删除精准清理对应记录
        expect(await repo.deleteByApp({ teamId: teamA, appId: appA1 })).toBe(1);
        expect(await repo.findByTeamAndApp({ teamId: teamA, appId: appA1 })).toBeNull();
        expect(await repo.countByTeam({ teamId: teamA })).toBe(1);
        expect(await repo.countByTeam({ teamId: teamB })).toBe(1);
        expect(await repo.findById({ id: regB1._id, teamId: teamB })).toEqual(regB1);
      });

      it('fails fast on corrupted single row and skips corrupted rows in listByTeam', async () => {
        const teamId = createEntityId();
        const valid = await repo.create({
          data: { teamId, tmbId: createEntityId(), appId: createEntityId() }
        });
        const corruptedId = createEntityId();

        await ctx.insertRawRow({
          mongo: {
            collection: AppRegistrationCollectionName,
            doc: {
              _id: new Types.ObjectId(corruptedId),
              teamId: new Types.ObjectId(teamId),
              tmbId: 'legacy-corrupted-tmb',
              appId: new Types.ObjectId(createEntityId()),
              createdAt: new Date()
            }
          },
          sql: {
            table: appRegistrationSqlTable.name,
            row: {
              _id: corruptedId,
              team_id: teamId,
              tmb_id: 'legacy-corrupted-tmb',
              app_id: createEntityId(),
              created_at: new Date()
            }
          }
        });

        await expect(repo.findById({ id: corruptedId, teamId })).rejects.toBeInstanceOf(
          DbRecordCorruptedError
        );

        const list = await repo.listByTeam({ teamId });
        expect(list).toEqual([valid]);

        await expect(
          repo.create({
            data: { teamId: 'invalid-team-id', tmbId: createEntityId(), appId: createEntityId() }
          })
        ).rejects.toThrow();
      });

      it('commits with ordered afterCommit hooks and rolls back cleanly on error', async () => {
        const teamId = createEntityId();
        const tmbId = createEntityId();
        const appId1 = createEntityId();
        const appId2 = createEntityId();
        const events: string[] = [];

        const committed = await runInTransaction(async (tx) => {
          const record = await repo.create({
            data: { teamId, tmbId, appId: appId1 },
            tx
          });
          tx.afterCommit(() => {
            events.push(`first:${record._id}`);
          });
          tx.afterCommit(() => {
            events.push(`second:${record.appId}`);
          });
          return record;
        });

        expect(events).toEqual([`first:${committed._id}`, `second:${appId1}`]);
        expect(await repo.countByTeam({ teamId })).toBe(1);

        const abortedHook = vi.fn();
        await expect(
          runInTransaction(async (tx) => {
            await repo.create({
              data: { teamId, tmbId, appId: appId2 },
              tx
            });
            tx.afterCommit(abortedHook);
            throw new Error('simulated failure');
          })
        ).rejects.toThrow('simulated failure');

        expect(abortedHook).not.toHaveBeenCalled();
        expect(await repo.findByTeamAndApp({ teamId, appId: appId2 })).toBeNull();
        expect(await repo.countByTeam({ teamId })).toBe(1);
      });

      it('normalizes mixed-case hex entity IDs identically across writes, lookups, counts, and deletes', async () => {
        const teamId = createEntityId();
        const tmbId = createEntityId();
        const appId = createEntityId();
        const id = createEntityId();

        // Mixed/uppercase hex inputs normalize to lowercase in DTOs and prevent duplicate-key divergence.
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
        expect(created.tmbId).toBe(tmbId);
        expect(created.appId).toBe(appId);

        await expect(
          repo.create({
            data: {
              _id: id.toUpperCase(),
              teamId: createEntityId(),
              tmbId: createEntityId(),
              appId: createEntityId()
            }
          })
        ).rejects.toThrow();

        expect(await repo.findById({ id: id.toUpperCase(), teamId: teamId.toUpperCase() })).toEqual(
          created
        );
        expect(
          await repo.findByTeamAndApp({ teamId: teamId.toUpperCase(), appId: appId.toUpperCase() })
        ).toEqual(created);
        expect(await repo.listByTeam({ teamId: teamId.toUpperCase() })).toEqual([created]);
        expect(await repo.countByTeam({ teamId: teamId.toUpperCase() })).toBe(1);
        expect(await repo.findById({ id: 'invalid-id', teamId })).toBeNull();
        expect(await repo.countByTeam({ teamId: 'invalid-id' })).toBe(0);

        expect(
          await repo.deleteByApp({ teamId: teamId.toUpperCase(), appId: appId.toUpperCase() })
        ).toBe(1);
        expect(await repo.countByTeam({ teamId })).toBe(0);
      });
    }
  });
});
