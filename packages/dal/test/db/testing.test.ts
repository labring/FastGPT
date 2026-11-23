import { Mongoose } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DbConfigurationError } from '@fastgpt/dal/db/errors';
import { closeDbRuntime, getConfiguredDbRuntime } from '@fastgpt/dal/db/runtime';
import { defineSqlTable } from '@fastgpt/dal/db/sql/ddl';
import {
  createContractBackends,
  createMongoTestHarness,
  createMysqlSqlTestHarness,
  createPostgresSqlTestHarness,
  parseRequiredSqlDialects,
  registerDualDialectContractSuite,
  registerMultiDialectContractSuite,
  type ContractBackendEntry
} from '@fastgpt/dal/db/testing';
import { appRegistrationMongoCollection } from '../../db/repos/appRegistration/mongo/schema';
import { appRegistrationSqlTable } from '../../db/repos/appRegistration/sql/table';

type MockDriverEvent = {
  driver: 'mysql' | 'pg';
  poolId: number;
  uri: string;
  action: 'query' | 'end';
  sql?: string;
};

const mockState = vi.hoisted(() => ({
  mysqlPoolSeq: 0,
  pgPoolSeq: 0,
  events: [] as MockDriverEvent[],
  failOnQueryMatch: null as RegExp | null
}));

vi.mock('mysql2', () => ({
  createPool: (config: { uri?: string }) => {
    mockState.mysqlPoolSeq += 1;
    const poolId = mockState.mysqlPoolSeq;
    const uri = String(config?.uri ?? '');
    return {
      getConnection: (cb: (err: unknown, conn?: any) => void) => {
        cb(null, {
          query: (
            sqlText: string,
            _params: unknown[],
            queryCb: (err: unknown, result?: unknown) => void
          ) => {
            mockState.events.push({
              driver: 'mysql',
              poolId,
              uri,
              action: 'query',
              sql: sqlText
            });
            if (mockState.failOnQueryMatch !== null && mockState.failOnQueryMatch.test(sqlText)) {
              queryCb(new Error(`Simulated MySQL DDL failure on pool #${poolId}`));
              return;
            }
            queryCb(null, []);
          },
          release: () => undefined
        });
      },
      end: (cb: (err?: unknown) => void) => {
        mockState.events.push({ driver: 'mysql', poolId, uri, action: 'end' });
        cb(null);
      }
    };
  }
}));

vi.mock('pg', () => ({
  Pool: class MockPgPool {
    private readonly poolId: number;
    private readonly uri: string;

    constructor(config: { connectionString?: string }) {
      mockState.pgPoolSeq += 1;
      this.poolId = mockState.pgPoolSeq;
      this.uri = String(config?.connectionString ?? '');
    }

    async connect() {
      const poolId = this.poolId;
      const uri = this.uri;
      return {
        query: async (input: string | { text: string }) => {
          const sqlText = typeof input === 'string' ? input : input.text;
          mockState.events.push({ driver: 'pg', poolId, uri, action: 'query', sql: sqlText });
          if (mockState.failOnQueryMatch !== null && mockState.failOnQueryMatch.test(sqlText)) {
            throw new Error(`Simulated Postgres DDL failure on pool #${poolId}`);
          }
          return { rows: [], rowCount: 0 };
        },
        release: () => undefined
      };
    }

    async end() {
      mockState.events.push({ driver: 'pg', poolId: this.poolId, uri: this.uri, action: 'end' });
    }
  }
}));

const sampleLogTable = defineSqlTable({
  name: 'sample_log_records',
  datasource: 'log',
  columns: {
    _id: { kind: 'entityId', primaryKey: true },
    team_id: { kind: 'entityId' }
  }
});

describe('@fastgpt/dal/db/testing harness reliability & contract guardrails', () => {
  afterEach(async () => {
    mockState.mysqlPoolSeq = 0;
    mockState.pgPoolSeq = 0;
    mockState.events = [];
    mockState.failOnQueryMatch = null;
    vi.restoreAllMocks();
    await closeDbRuntime();
  });

  it('cleans up created databases and destroys all pools in reverse order when createMysqlSqlTestHarness fails during DDL', async () => {
    mockState.failOnQueryMatch = /CREATE TABLE IF NOT EXISTS `sample_log_records`/;

    await expect(
      createMysqlSqlTestHarness({
        dialect: 'mysql',
        uri: 'mysql://root:pass@127.0.0.1:3306/mysql',
        tables: [appRegistrationSqlTable],
        logTables: [sampleLogTable],
        logMode: 'separate'
      })
    ).rejects.toThrow('Simulated MySQL DDL failure');

    expect(getConfiguredDbRuntime()).toBeUndefined();

    const adminQueries = mockState.events
      .filter((e) => e.driver === 'mysql' && e.poolId === 1 && e.action === 'query')
      .map((e) => e.sql ?? '');
    const createdDbs = adminQueries
      .filter((q) => q.startsWith('CREATE DATABASE IF NOT EXISTS'))
      .map((q) => q.match(/`([^`]+)`/)?.[1]);
    const droppedDbs = adminQueries
      .filter((q) => q.startsWith('DROP DATABASE IF EXISTS'))
      .map((q) => q.match(/`([^`]+)`/)?.[1]);

    expect(createdDbs).toHaveLength(2);
    // Strict reverse order: log DB dropped before main DB
    expect(droppedDbs).toEqual([createdDbs[1], createdDbs[0]]);

    // All pools (admin #1, main #2, log #3) must be destroyed, with admin destroyed AFTER drops
    const endedPools = mockState.events
      .filter((e) => e.driver === 'mysql' && e.action === 'end')
      .map((e) => e.poolId);
    expect(endedPools.sort((a, b) => a - b)).toEqual([1, 2, 3]);

    const lastDropIdx = mockState.events.findLastIndex(
      (e) => e.poolId === 1 && (e.sql ?? '').startsWith('DROP DATABASE IF EXISTS')
    );
    const adminEndIdx = mockState.events.findIndex((e) => e.poolId === 1 && e.action === 'end');
    const businessEndMaxIdx = Math.max(
      mockState.events.findIndex((e) => e.poolId === 2 && e.action === 'end'),
      mockState.events.findIndex((e) => e.poolId === 3 && e.action === 'end')
    );
    expect(businessEndMaxIdx).toBeLessThan(lastDropIdx);
    expect(lastDropIdx).toBeLessThan(adminEndIdx);
  });

  it('cleans up created schemas and destroys all pools in reverse order when createPostgresSqlTestHarness fails during DDL', async () => {
    mockState.failOnQueryMatch = /CREATE TABLE IF NOT EXISTS "sample_log_records"/;

    await expect(
      createPostgresSqlTestHarness({
        uri: 'postgres://postgres:pass@127.0.0.1:5432/postgres',
        tables: [appRegistrationSqlTable],
        logTables: [sampleLogTable],
        logMode: 'separate'
      })
    ).rejects.toThrow('Simulated Postgres DDL failure');

    expect(getConfiguredDbRuntime()).toBeUndefined();

    const adminQueries = mockState.events
      .filter((e) => e.driver === 'pg' && e.poolId === 1 && e.action === 'query')
      .map((e) => e.sql ?? '');
    const createdSchemas = adminQueries
      .filter((q) => q.startsWith('CREATE SCHEMA IF NOT EXISTS'))
      .map((q) => q.match(/"([^"]+)"/)?.[1]);
    const droppedSchemas = adminQueries
      .filter((q) => q.startsWith('DROP SCHEMA IF EXISTS'))
      .map((q) => q.match(/"([^"]+)"/)?.[1]);

    expect(createdSchemas).toHaveLength(2);
    expect(droppedSchemas).toEqual([createdSchemas[1], createdSchemas[0]]);

    const endedPools = mockState.events
      .filter((e) => e.driver === 'pg' && e.action === 'end')
      .map((e) => e.poolId);
    expect(endedPools.sort((a, b) => a - b)).toEqual([1, 2, 3]);

    const lastDropIdx = mockState.events.findLastIndex(
      (e) => e.poolId === 1 && (e.sql ?? '').startsWith('DROP SCHEMA IF EXISTS')
    );
    const adminEndIdx = mockState.events.findIndex((e) => e.poolId === 1 && e.action === 'end');
    expect(lastDropIdx).toBeLessThan(adminEndIdx);
  });

  it('preserves multi-seed MongoDB replica set URIs intact and isolates databases via connect({ dbName })', async () => {
    const multiSeedUri =
      'mongodb://user:pass@mongo-1.internal:27017,mongo-2.internal:27017,mongo-3.internal:27017/admin?replicaSet=rs0&authSource=admin';
    const connectCalls: Array<{ uri: string; options: unknown }> = [];
    const dropDatabaseSpy = vi.fn(async () => undefined);

    vi.spyOn(Mongoose.prototype, 'connect').mockImplementation(async function (
      this: Mongoose,
      uri: string,
      options?: unknown
    ) {
      connectCalls.push({ uri, options });
      Object.defineProperty(this.connection, 'dropDatabase', {
        value: dropDatabaseSpy,
        configurable: true
      });
      return this;
    });
    const disconnectSpy = vi
      .spyOn(Mongoose.prototype, 'disconnect')
      .mockImplementation(async () => undefined);

    const harness = await createMongoTestHarness({
      collections: [],
      logMode: 'separate',
      uri: multiSeedUri
    });

    try {
      expect(connectCalls).toHaveLength(2);
      // Both main and log connections preserve ALL seeds and authSource untouched
      expect(connectCalls[0]?.uri).toBe(multiSeedUri);
      expect(connectCalls[1]?.uri).toBe(multiSeedUri);

      const mainOpts = connectCalls[0]?.options as { dbName?: string };
      const logOpts = connectCalls[1]?.options as { dbName?: string };
      expect(mainOpts.dbName).toMatch(/^fg_dal_main_w/);
      expect(logOpts.dbName).toMatch(/^fg_dal_log_w/);
      expect(mainOpts.dbName).not.toBe(logOpts.dbName);
    } finally {
      await harness.close();
    }

    expect(dropDatabaseSpy).toHaveBeenCalledTimes(2);
    expect(disconnectSpy).toHaveBeenCalledTimes(2);
  });

  it('rejects empty backends and missing dialect families synchronously in contract suite registration and createContractBackends', () => {
    const noopHook = () => undefined;
    const makeBackend = (dialect: 'mongo' | 'postgres', label: string): ContractBackendEntry => ({
      label,
      dialect,
      setup: async () => undefined,
      teardown: async () => undefined
    });

    // 1. registerMultiDialectContractSuite: empty -> throws synchronously
    expect(() =>
      registerMultiDialectContractSuite({
        describeFn: noopHook,
        beforeAllFn: noopHook,
        afterAllFn: noopHook,
        backends: [],
        registerTests: noopHook
      })
    ).toThrow(DbConfigurationError);

    // 2. registerMultiDialectContractSuite: mongo-only or sql-only -> throws by default (requireBothFamilies = true)
    expect(() =>
      registerMultiDialectContractSuite({
        describeFn: noopHook,
        beforeAllFn: noopHook,
        afterAllFn: noopHook,
        backends: [makeBackend('mongo', 'MongoDB')],
        registerTests: noopHook
      })
    ).toThrow(DbConfigurationError);

    expect(() =>
      registerMultiDialectContractSuite({
        describeFn: noopHook,
        beforeAllFn: noopHook,
        afterAllFn: noopHook,
        backends: [makeBackend('postgres', 'SQL (PGlite)')],
        registerTests: noopHook
      })
    ).toThrow(DbConfigurationError);

    // 3. Explicit requireBothFamilies: false allows single-family non-empty backends (still rejects empty)
    const describedLabels: string[] = [];
    registerMultiDialectContractSuite({
      describeFn: (name, fn) => {
        describedLabels.push(name);
        fn();
      },
      beforeAllFn: noopHook,
      afterAllFn: noopHook,
      backends: [makeBackend('postgres', 'SQL (PGlite)')],
      requireBothFamilies: false,
      registerTests: noopHook
    });
    expect(describedLabels).toEqual(['[SQL (PGlite)]']);

    expect(() =>
      registerMultiDialectContractSuite({
        describeFn: noopHook,
        beforeAllFn: noopHook,
        afterAllFn: noopHook,
        backends: [],
        requireBothFamilies: false,
        registerTests: noopHook
      })
    ).toThrow(DbConfigurationError);

    // 4. registerDualDialectContractSuite shares the exact same guardrails
    expect(() =>
      registerDualDialectContractSuite({
        describeFn: noopHook,
        beforeAllFn: noopHook,
        afterAllFn: noopHook,
        backends: [],
        registerTests: noopHook
      })
    ).toThrow(DbConfigurationError);

    expect(() =>
      registerDualDialectContractSuite({
        describeFn: noopHook,
        beforeAllFn: noopHook,
        afterAllFn: noopHook,
        backends: [makeBackend('mongo', 'MongoDB')],
        registerTests: noopHook
      })
    ).toThrow(DbConfigurationError);

    // 5. createContractBackends rejects zero backends & validates FASTGPT_TEST_REQUIRED_SQL_DIALECTS
    expect(() =>
      createContractBackends({
        collections: [appRegistrationMongoCollection],
        tables: [appRegistrationSqlTable],
        includeMongo: false,
        includePGlite: false,
        env: {}
      })
    ).toThrow(DbConfigurationError);

    expect(() =>
      createContractBackends({
        collections: [appRegistrationMongoCollection],
        tables: [appRegistrationSqlTable],
        env: { FASTGPT_TEST_REQUIRED_SQL_DIALECTS: 'postgres' }
      })
    ).toThrow(DbConfigurationError);

    expect(() =>
      parseRequiredSqlDialects({ FASTGPT_TEST_REQUIRED_SQL_DIALECTS: 'sqlite' })
    ).toThrow(DbConfigurationError);

    expect(
      parseRequiredSqlDialects({
        FASTGPT_TEST_REQUIRED_SQL_DIALECTS: ' mysql , oceanbase , mysql '
      })
    ).toEqual(['mysql', 'oceanbase']);
  });
});
