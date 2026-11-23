#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { findRepoRoot, inferDomainTestDir, toPosixPath } from './common.mjs';

const args = process.argv.slice(2);

const getFlagValue = (flag) => {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) {
    return undefined;
  }
  return args[idx + 1];
};

const hasFlag = (flag) => args.includes(flag);

if (hasFlag('--help') || hasFlag('-h') || args.length === 0) {
  console.log(`Usage:
  node scaffold-repo.mjs --dir <repo-dir> --entity <PascalName> --table <snake_table> [--service-dir <service-dir>] [--datasource main|log] [--soft-delete] [--no-service] [--force] [--dry-run]

Example:
  node scaffold-repo.mjs --dir packages/dal/db/repos/datasetSynonym --service-dir packages/service/core/dataset/synonym --entity DatasetSynonym --table dataset_synonyms`);
  process.exit(0);
}

const dirArg = getFlagValue('--dir');
const serviceDirArg = getFlagValue('--service-dir');
const entityArg = getFlagValue('--entity');
const tableArg = getFlagValue('--table');
const datasource = getFlagValue('--datasource') ?? 'main';
const softDelete = hasFlag('--soft-delete');
const noService = hasFlag('--no-service');
const force = hasFlag('--force');
const dryRun = hasFlag('--dry-run');

if (!dirArg || !entityArg || !tableArg) {
  console.error('Missing required flags: --dir, --entity, --table');
  process.exit(1);
}
if (datasource !== 'main' && datasource !== 'log') {
  console.error('--datasource must be "main" or "log"');
  process.exit(1);
}
if (!/^[A-Z][A-Za-z0-9]*$/.test(entityArg)) {
  console.error('--entity must be PascalCase (e.g. AppTag)');
  process.exit(1);
}
if (!/^[a-z_][a-z0-9_]*$/.test(tableArg)) {
  console.error('--table must be lowercase snake_case (e.g. app_tags)');
  process.exit(1);
}

const camelEntity = entityArg[0].toLowerCase() + entityArg.slice(1);
const repoRoot = findRepoRoot();
const domainRel = toPosixPath(dirArg).replace(/^\.\//, '').replace(/\/$/, '');
const isDalRepoDir = domainRel.startsWith('packages/dal/db/repos/');
const serviceRelDir =
  serviceDirArg !== undefined
    ? toPosixPath(serviceDirArg).replace(/^\.\//, '').replace(/\/$/, '')
    : isDalRepoDir
      ? undefined
      : domainRel;

const testBaseDir = inferDomainTestDir(domainRel) ?? domainRel;
const serviceTestBaseDir =
  serviceRelDir !== undefined ? (inferDomainTestDir(serviceRelDir) ?? serviceRelDir) : undefined;
const computeContractTestPath = () => `${testBaseDir}/repo.contract.test.ts`;
const computeServiceTestPath = () =>
  serviceTestBaseDir !== undefined ? `${serviceTestBaseDir}/service.test.ts` : undefined;

const collectionVarName = `${camelEntity}MongoCollection`;
const sqlTeamIndexName = `fg_${tableArg}_team`.slice(0, 63);

const repoTypeContent = `import z from 'zod';
import { EntityIdSchema, EntityIdStringSchema } from '@fastgpt/global/common/string/entityId';
${softDelete ? "import { optionalNullToUndefined } from '@fastgpt/global/common/zod';\n" : ''}import type { DbSession } from '@fastgpt/dal/db/types';

/**
 * ${entityArg} 读路径归一化基准 Schema（宽出兼容历史存量数据，抹平 SQL null 与 Mongo undefined）。
 */
export const ${entityArg}DomainReadSchema = z.object({
  _id: EntityIdSchema,
  teamId: EntityIdSchema,
  createTime: z.coerce.date(),
  updateTime: z.coerce.date()${
    softDelete ? ',\n  deleteTime: optionalNullToUndefined(z.coerce.date())' : ''
  }
});
export type ${entityArg}DomainDTO = z.infer<typeof ${entityArg}DomainReadSchema>;

export const Create${entityArg}WriteSchema = z.object({
  _id: EntityIdStringSchema.optional(),
  teamId: EntityIdStringSchema
});
export type Create${entityArg}WriteInput = z.input<typeof Create${entityArg}WriteSchema>;

export type ${entityArg}Repository = {
  findById: (params: {
    id: string;
    teamId: string;
    tx?: DbSession;
  }) => Promise<${entityArg}DomainDTO | null>;
  create: (params: {
    data: Create${entityArg}WriteInput;
    tx?: DbSession;
  }) => Promise<${entityArg}DomainDTO>;
};
`;

const mongoSchemaContent = `import { Schema } from 'mongoose';
import { defineMongoCollection } from '@fastgpt/dal/db/mongo/collection';

export const ${entityArg}CollectionName = '${tableArg}';

export type ${entityArg}MongoDoc = {
  teamId: unknown;
  createTime: Date;
  updateTime: Date;${softDelete ? '\n  deleteTime?: Date | null;' : ''}
};

const ${entityArg}MongoSchema = new Schema(
  {
    teamId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    createTime: {
      type: Date,
      default: () => new Date()
    },
    updateTime: {
      type: Date,
      default: () => new Date()
    }${
      softDelete
        ? `,
    deleteTime: {
      type: Date,
      default: null
    }`
        : ''
    }
  },
  { versionKey: false }
);

/** ${entityArg} MongoDB 纯声明式集合定义（零导入副作用，由 MongoRepositoryBase 构造期自动绑定 Model）。 */
export const ${collectionVarName} = defineMongoCollection<${entityArg}MongoDoc>({
  name: ${entityArg}CollectionName,
  datasource: '${datasource}',
  schema: ${entityArg}MongoSchema,
  indexes: [
    // TODO: 从原 schema.ts 完整迁入全部存量索引（存量索引保留原名不重建；新增索引统一采用 fg_ 前缀）
    { key: { teamId: 1 } }
  ]
});
`;

const mongoRepoContent = `import { createEntityId, isValidEntityId } from '@fastgpt/global/common/string/entityId';
import { MongoRepositoryBase } from '@fastgpt/dal/db/mongo/base';
import type { DbRuntime } from '@fastgpt/dal/db/runtime';
import type { DbSession } from '@fastgpt/dal/db/types';
import {
  Create${entityArg}WriteSchema,
  ${entityArg}DomainReadSchema,
  type Create${entityArg}WriteInput,
  type ${entityArg}Repository
} from '../repo.type';
import { ${collectionVarName}, type ${entityArg}MongoDoc } from './schema';

/** ${entityArg} 仓储的 MongoDB 策略实现（构造期由父类自动绑定当前 DbRuntime 的 readonly model）。 */
export class Mongo${entityArg}Repository
  extends MongoRepositoryBase<${entityArg}MongoDoc, typeof ${entityArg}DomainReadSchema>
  implements ${entityArg}Repository
{
  constructor(runtime?: DbRuntime) {
    super({
      collection: ${collectionVarName},
      readSchema: ${entityArg}DomainReadSchema,
      runtime
    });
  }

  async findById({ id, teamId, tx }: { id: string; teamId: string; tx?: DbSession }) {
    if (!isValidEntityId(id) || !isValidEntityId(teamId)) {
      return null;
    }

    const doc = await this.model
      .findOne(
        {
          _id: this.oid(id),
          teamId: this.oid(teamId)${softDelete ? ',\n          deleteTime: null' : ''}
        },
        undefined,
        this.txOpts(tx)
      )
      .lean();

    return this.parseNullable(doc);
  }

  async create({ data, tx }: { data: Create${entityArg}WriteInput; tx?: DbSession }) {
    const parsed = Create${entityArg}WriteSchema.parse(data);
    const now = new Date();
    const [created] = await this.model.create(
      [
        {
          _id: this.oid(parsed._id ?? createEntityId()),
          teamId: this.oid(parsed.teamId),
          createTime: now,
          updateTime: now
        }
      ],
      this.txOpts(tx)
    );

    return this.parseRow(created.toObject());
  }
}
`;

const sqlTableContent = `import { defineSqlTable } from '@fastgpt/dal/db/sql/ddl';

export type ${entityArg}SqlRow = {
  _id: string;
  team_id: string;
  create_time: Date;
  update_time: Date;${
    softDelete ? '\n  delete_time_ms: number | string;\n  delete_time: Date | null;' : ''
  }
};

export type ${entityArg}Database = {
  ${tableArg}: ${entityArg}SqlRow;
};

/** 跨 OceanBase/MySQL 与 PostgreSQL 可移植的 ${entityArg} 表定义（纯 B-Tree、\`fg_\` 命名规范）。 */
export const ${camelEntity}SqlTable = defineSqlTable({
  name: '${tableArg}',
  columns: {
    _id: { kind: 'entityId', primaryKey: true },
    team_id: { kind: 'entityId' },
    create_time: { kind: 'timestamp' },
    update_time: { kind: 'timestamp' }${
      softDelete
        ? `,
    delete_time_ms: { kind: 'bigint', defaultValue: 0 },
    delete_time: { kind: 'timestamp', nullable: true }`
        : ''
    }
  },
  indexes: [
    { name: '${sqlTeamIndexName}', columns: ['team_id'] }
  ]
});
`;

const sqlRepoContent = `import { createEntityId, isValidEntityId } from '@fastgpt/global/common/string/entityId';
import {
  ${softDelete ? 'SQL_ACTIVE_DELETE_TIME_MS,\n  ' : ''}SqlRepositoryBase
} from '@fastgpt/dal/db/sql/base';
import type { DbSession } from '@fastgpt/dal/db/types';
import {
  Create${entityArg}WriteSchema,
  ${entityArg}DomainReadSchema,
  type Create${entityArg}WriteInput,
  type ${entityArg}Repository
} from '../repo.type';
import type { ${entityArg}Database } from './table';

/** ${entityArg} 仓储的可移植 SQL（Kysely）策略实现，通吃 PostgreSQL 与 OceanBase/MySQL。 */
export class Sql${entityArg}Repository
  extends SqlRepositoryBase<${entityArg}Database, '${tableArg}', typeof ${entityArg}DomainReadSchema>
  implements ${entityArg}Repository
{
  protected readonly tableName = '${tableArg}';
  protected readonly readSchema = ${entityArg}DomainReadSchema;${
    datasource === 'log' ? "\n  protected override readonly datasource = 'log';" : ''
  }

  async findById({ id, teamId, tx }: { id: string; teamId: string; tx?: DbSession }) {
    if (!isValidEntityId(id) || !isValidEntityId(teamId)) {
      return null;
    }

    const row = await this.readDb(tx)
      .selectFrom('${tableArg}')
      .selectAll()
      .where('_id', '=', this.normalizeId(id))
      .where('team_id', '=', this.normalizeId(teamId))${
        softDelete
          ? "\n      .where('delete_time_ms', '=', SQL_ACTIVE_DELETE_TIME_MS)"
          : ''
      }
      .executeTakeFirst();

    return this.parseNullable(
      row !== undefined
        ? {
            ...row,
            teamId: row.team_id,
            createTime: row.create_time,
            updateTime: row.update_time${softDelete ? ',\n            deleteTime: row.delete_time' : ''}
          }
        : undefined
    );
  }

  async create({ data, tx }: { data: Create${entityArg}WriteInput; tx?: DbSession }) {
    const parsed = Create${entityArg}WriteSchema.parse(data);
    const id = parsed._id ?? createEntityId();
    const now = new Date();

    await this.db(tx)
      .insertInto('${tableArg}')
      .values({
        _id: id,
        team_id: parsed.teamId,
        create_time: now,
        update_time: now${
          softDelete
            ? ',\n        delete_time_ms: SQL_ACTIVE_DELETE_TIME_MS,\n        delete_time: null'
            : ''
        }
      })
      .execute();

    return this.parseRow({
      _id: id,
      teamId: parsed.teamId,
      createTime: now,
      updateTime: now
    });
  }
}
`;

const repoTokenContent = `import { defineRepoToken } from '@fastgpt/dal/db/container';
import type { ${entityArg}Repository } from './repo.type';
import { Mongo${entityArg}Repository } from './mongo/repo';
import { Sql${entityArg}Repository } from './sql/repo';

/** ${entityArg} 仓储 DI Token（按运行时自动路由至 Mongo 或通用 SQL 实现${
  datasource === 'log' ? '；未配置独立日志库时透明回退复用主库连接池' : ''
}）。 */
export const ${entityArg}RepoToken = defineRepoToken<${entityArg}Repository>(
  '${entityArg}Repository',
  {
    mongo: (runtime) => new Mongo${entityArg}Repository(runtime),
    sql: () => new Sql${entityArg}Repository()
  }
);
`;

const repoPublicImportPrefix = isDalRepoDir
  ? `@fastgpt/dal/${domainRel.slice('packages/dal/'.length)}`
  : domainRel.startsWith('packages/service/')
    ? `@fastgpt/service/${domainRel.slice('packages/service/'.length)}`
    : `@/${domainRel.replace(/^projects\/app\/src\/|^pro\/admin\/src\//, '')}`;

const serviceRepoImportPrefix = isDalRepoDir ? repoPublicImportPrefix : '.';

const serviceContent = `import { injectRepo } from '@fastgpt/dal/db/container';
import type { DbSession } from '@fastgpt/dal/db/types';
import { ${entityArg}RepoToken } from '${serviceRepoImportPrefix}/repo';
import type { Create${entityArg}WriteInput, ${entityArg}Repository } from '${serviceRepoImportPrefix}/repo.type';

export type ${entityArg}ServiceDeps = {
  ${camelEntity}Repo?: ${entityArg}Repository;
};

/** ${entityArg} 领域编排服务，通过构造函数依赖注入实现零 Mock 单测隔离。 */
export class ${entityArg}Service {
  private readonly ${camelEntity}Repo: ${entityArg}Repository;

  constructor(deps: ${entityArg}ServiceDeps = {}) {
    this.${camelEntity}Repo = deps.${camelEntity}Repo ?? injectRepo(${entityArg}RepoToken);
  }

  async findById({ id, teamId, tx }: { id: string; teamId: string; tx?: DbSession }) {
    return this.${camelEntity}Repo.findById({ id, teamId, tx });
  }

  async create({ data, tx }: { data: Create${entityArg}WriteInput; tx?: DbSession }) {
    return this.${camelEntity}Repo.create({ data, tx });
  }
}

export const ${camelEntity}Service = new ${entityArg}Service();
`;

const serviceImportPrefix =
  serviceRelDir !== undefined
    ? serviceRelDir.startsWith('packages/service/')
      ? `@fastgpt/service/${serviceRelDir.slice('packages/service/'.length)}`
      : `@/${serviceRelDir.replace(/^projects\/app\/src\/|^pro\/admin\/src\//, '')}`
    : repoPublicImportPrefix;

const contractInternalImportBase = isDalRepoDir
  ? path.posix.relative(testBaseDir, domainRel)
  : repoPublicImportPrefix;

const contractTestContent = `import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntityId } from '@fastgpt/global/common/string/entityId';
import { injectRepo } from '@fastgpt/dal/db/container';
import { compileSqlTableDDL } from '@fastgpt/dal/db/sql/ddl';
import {
  createContractBackends,${datasource === 'log' ? '\n  registerLogTopologyContractSuite,' : ''}
  registerMultiDialectContractSuite
} from '@fastgpt/dal/db/testing';
import { runInTransaction } from '@fastgpt/dal/db/transaction';
import { ${entityArg}RepoToken } from '${repoPublicImportPrefix}/repo';
import { ${collectionVarName} } from '${contractInternalImportBase}/mongo/schema';
import { ${camelEntity}SqlTable } from '${contractInternalImportBase}/sql/table';

describe('${entityArg} portable SQL DDL (OceanBase/MySQL + PostgreSQL)', () => {
  it('compiles cleanly for OceanBase/MySQL (P0) and PostgreSQL (P1)', () => {
    const obSql = compileSqlTableDDL(${camelEntity}SqlTable, 'oceanbase').join('\\n');
    expect(obSql).toContain('CREATE TABLE IF NOT EXISTS \`${tableArg}\`');
    expect(obSql).toContain('DATETIME(3)');
    expect(obSql).toContain('DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;');
    expect(obSql).not.toContain('CREATE INDEX IF NOT EXISTS');

    const pgSql = compileSqlTableDDL(${camelEntity}SqlTable, 'postgres').join('\\n');
    expect(pgSql).toContain('CREATE TABLE IF NOT EXISTS "${tableArg}"');
    expect(pgSql).toContain('TIMESTAMPTZ');
  });
});
${
  datasource === 'log'
    ? `
describe('${entityArg}Repository shared & separate log topology isolation', () => {
  const topologyTeamId = createEntityId();

  registerLogTopologyContractSuite({
    describeFn: describe,
    itFn: it,
    logCollections: [${collectionVarName}],
    logTables: [${camelEntity}SqlTable],
    mongoCollectionName: '${tableArg}',
    sqlTableName: '${tableArg}',
    writeLogRecord: async () => {
      const created = await injectRepo(${entityArg}RepoToken).create({
        data: { teamId: topologyTeamId }
      });
      return { id: created._id };
    },
    readLogRecord: async ({ id }) =>
      injectRepo(${entityArg}RepoToken).findById({ id, teamId: topologyTeamId })
  });
});
`
    : ''
}
describe('${entityArg}Repository multi-dialect contract', () => {
  registerMultiDialectContractSuite({
    describeFn: describe,
    beforeAllFn: beforeAll,
    beforeEachFn: beforeEach,
    afterAllFn: afterAll,
    backends: createContractBackends({
      ${
        datasource === 'log'
          ? `collections: [],\n      logCollections: [${collectionVarName}],\n      tables: [],\n      logTables: [${camelEntity}SqlTable],\n      logMode: 'separate'`
          : `collections: [${collectionVarName}],\n      tables: [${camelEntity}SqlTable]`
      }
    }),
    registerTests: () => {
      const repo = injectRepo(${entityArg}RepoToken);

      it('creates and retrieves record with normalized IDs, mixed-case parity, and tenant isolation', async () => {
        const id = createEntityId();
        const teamId = createEntityId();
        const otherTeamId = createEntityId();

        const created = await repo.create({
          data: { _id: id.toUpperCase(), teamId: teamId.toUpperCase() }
        });
        expect(created._id).toBe(id);
        expect(created.teamId).toBe(teamId);

        expect(
          await repo.findById({ id: id.toUpperCase(), teamId: teamId.toUpperCase() })
        ).toEqual(created);
        expect(await repo.findById({ id: created._id, teamId: otherTeamId })).toBeNull();
        expect(await repo.findById({ id: 'invalid-id', teamId })).toBeNull();
      });

      it('commits afterCommit hooks in order and rolls back writes on transaction failure', async () => {
        const teamId = createEntityId();
        const hooks: string[] = [];

        const committed = await runInTransaction(
          async (tx) => {
            const record = await repo.create({ data: { teamId }, tx });
            tx.afterCommit(() => {
              hooks.push(record._id);
            });
            return record;
          }${datasource === 'log' ? ",\n          { datasource: 'log' }" : ''}
        );
        expect(hooks).toEqual([committed._id]);

        const abortedId = createEntityId();
        const abortedHook = vi.fn();
        await expect(
          runInTransaction(
            async (tx) => {
              await repo.create({ data: { _id: abortedId, teamId }, tx });
              tx.afterCommit(abortedHook);
              throw new Error('simulated rollback');
            }${datasource === 'log' ? ",\n            { datasource: 'log' }" : ''}
          )
        ).rejects.toThrow('simulated rollback');

        expect(abortedHook).not.toHaveBeenCalled();
        expect(await repo.findById({ id: abortedId, teamId })).toBeNull();
      });

      // TODO: 按 Step 1 审计清单补齐：
      // 1. 单行脏数据 DbRecordCorruptedError（Fail-Fast）与列表 Warn & Skip 隔离；
      // 2. 哨兵唯一键冲突 / 软删除 / TTL 过期不可见 / 可空列 NULL 排序 / 大小写对照 / 并发抢占与重试。
    }
  });
});
`;

const serviceTestContent = `import { describe, expect, it, vi } from 'vitest';
import { createEntityId } from '@fastgpt/global/common/string/entityId';
import type { ${entityArg}DomainDTO, ${entityArg}Repository } from '${repoPublicImportPrefix}/repo.type';
import { ${entityArg}Service } from '${serviceImportPrefix}/service';

/**
 * L0 纯内存 Service 单测（零数据库、零 vi.mock 模块劫持）。
 * 通过构造函数注入 Stub Repository 验证业务编排逻辑与边界分支。
 */
describe('${entityArg}Service unit', () => {
  it('delegates create and findById via constructor-injected repository', async () => {
    const id = createEntityId();
    const teamId = createEntityId();
    const now = new Date('2026-06-01T00:00:00.000Z');
    const stubRecord: ${entityArg}DomainDTO = {
      _id: id,
      teamId,
      createTime: now,
      updateTime: now
    };

    const stubRepo: ${entityArg}Repository = {
      findById: vi.fn().mockResolvedValue(stubRecord),
      create: vi.fn().mockResolvedValue(stubRecord)
    };

    const service = new ${entityArg}Service({ ${camelEntity}Repo: stubRepo });

    expect(await service.create({ data: { _id: id, teamId } })).toEqual(stubRecord);
    expect(await service.findById({ id, teamId })).toEqual(stubRecord);
    expect(stubRepo.create).toHaveBeenCalledWith({ data: { _id: id, teamId }, tx: undefined });
    expect(stubRepo.findById).toHaveBeenCalledWith({ id, teamId, tx: undefined });
  });
});
`;

const testRel = computeContractTestPath();
const serviceTestRel = computeServiceTestPath();
const serviceRelPath = serviceRelDir !== undefined ? `${serviceRelDir}/service.ts` : undefined;
const serviceAlreadyExists =
  serviceRelPath !== undefined && fs.existsSync(path.resolve(repoRoot, serviceRelPath));
const serviceUnitTestRel =
  serviceTestBaseDir !== undefined ? `${serviceTestBaseDir}/service.unit.test.ts` : undefined;
const serviceTestAlreadyExists =
  (serviceTestRel !== undefined && fs.existsSync(path.resolve(repoRoot, serviceTestRel))) ||
  (serviceUnitTestRel !== undefined && fs.existsSync(path.resolve(repoRoot, serviceUnitTestRel)));
const shouldEmitService =
  !noService && serviceRelPath !== undefined && (force || !serviceAlreadyExists);
// 仅在本次新建配套 service.ts 时才生成对应模板单测，避免原位保留旧 service.ts 时导入不存在的新类导致报错
const shouldEmitServiceTest =
  shouldEmitService && serviceTestRel !== undefined && (force || !serviceTestAlreadyExists);
const skippedServiceTestDueToExistingService =
  !noService &&
  serviceRelPath !== undefined &&
  !shouldEmitService &&
  serviceTestRel !== undefined &&
  !serviceTestAlreadyExists;

const filesToCreate = [
  { relPath: `${domainRel}/repo.type.ts`, content: repoTypeContent },
  { relPath: `${domainRel}/mongo/schema.ts`, content: mongoSchemaContent },
  { relPath: `${domainRel}/mongo/repo.ts`, content: mongoRepoContent },
  { relPath: `${domainRel}/sql/table.ts`, content: sqlTableContent },
  { relPath: `${domainRel}/sql/repo.ts`, content: sqlRepoContent },
  { relPath: `${domainRel}/repo.ts`, content: repoTokenContent },
  ...(shouldEmitService ? [{ relPath: serviceRelPath, content: serviceContent }] : []),
  { relPath: testRel, content: contractTestContent },
  ...(shouldEmitServiceTest ? [{ relPath: serviceTestRel, content: serviceTestContent }] : [])
];

if (!force) {
  const existing = filesToCreate
    .map((f) => f.relPath)
    .filter((rel) => fs.existsSync(path.resolve(repoRoot, rel)));
  if (existing.length > 0) {
    console.error('Refusing to overwrite existing files (pass --force to overwrite):');
    for (const file of existing) {
      console.error(`  - ${file}`);
    }
    process.exit(1);
  }
}

if (dryRun) {
  console.log('[dry-run] Would create the following files:');
  if (!noService && serviceAlreadyExists && !force) {
    console.log(`  (skipping existing ${serviceRelPath}; refactor constructor DI in place)`);
  }
  if (skippedServiceTestDueToExistingService) {
    console.log(
      `  (skipping ${serviceTestRel} because existing ${serviceRelPath} was preserved; add L0 unit tests matching its actual exports/constructor)`
    );
  } else if (shouldEmitService && serviceTestAlreadyExists && !force) {
    console.log(`  (skipping existing ${serviceTestRel}; extend L0 service unit tests in place)`);
  }
  for (const file of filesToCreate) {
    console.log(`  - ${file.relPath}`);
  }
  process.exit(0);
}

if (!noService && serviceAlreadyExists && !force) {
  console.log(`Skipped existing: ${serviceRelPath} (refactor constructor DI in place)`);
}
if (skippedServiceTestDueToExistingService) {
  console.log(
    `Skipped ${serviceTestRel} (existing ${serviceRelPath} preserved; add L0 unit tests matching its actual exports/constructor)`
  );
} else if (shouldEmitService && serviceTestAlreadyExists && !force) {
  console.log(`Skipped existing: ${serviceTestRel} (extend L0 service unit tests in place)`);
}

for (const file of filesToCreate) {
  const abs = path.resolve(repoRoot, file.relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, file.content, 'utf8');
  console.log(`Created: ${file.relPath}`);
}
