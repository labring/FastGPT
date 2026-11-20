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
  node scaffold-repo.mjs --dir <domain-dir> --entity <PascalName> --table <snake_table> [--datasource main|log] [--soft-delete] [--no-service] [--force] [--dry-run]

Example:
  node scaffold-repo.mjs --dir packages/service/core/dataset/synonym --entity DatasetSynonym --table dataset_synonyms`);
  process.exit(0);
}

const dirArg = getFlagValue('--dir');
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
const domainAbs = path.resolve(repoRoot, domainRel);

const testBaseDir = inferDomainTestDir(domainRel) ?? domainRel;
const computeContractTestPath = () => `${testBaseDir}/repo.contract.test.ts`;
const computeServiceTestPath = () => `${testBaseDir}/service.test.ts`;

const mongoImport =
  domainRel.startsWith('packages/service/')
    ? path.posix.relative(domainRel + '/mongo', 'packages/service/common/mongo')
    : '@fastgpt/service/common/mongo';

const modelFnName = `get${entityArg}MongoModel`;
const getModelCall = datasource === 'log' ? 'getMongoLogModel' : 'getMongoModel';

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

const mongoSchemaContent = `import { defineIndex, ${getModelCall}, Schema, type Model } from '${mongoImport}';

export const ${entityArg}CollectionName = '${tableArg}';

type ${entityArg}MongoDoc = {
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

// TODO: 从原 schema.ts 完整迁入全部 defineIndex（含 deprecated: true 历史索引）
defineIndex(${entityArg}MongoSchema, { key: { teamId: 1 } });

let cachedModel: Model<${entityArg}MongoDoc> | undefined;

/** 惰性获取 ${entityArg} Mongoose Model，确保导入模块或运行 SQL 方言时零顶层注册副作用。 */
export const ${modelFnName} = (): Model<${entityArg}MongoDoc> => {
  if (cachedModel !== undefined) {
    return cachedModel;
  }
  cachedModel = ${getModelCall}<${entityArg}MongoDoc>(
    ${entityArg}CollectionName,
    ${entityArg}MongoSchema
  );
  return cachedModel;
};
`;

const mongoRepoContent = `import { createEntityId, isValidEntityId } from '@fastgpt/global/common/string/entityId';
import { MongoRepositoryBase } from '@fastgpt/dal/db/mongo/base';
import type { DbSession } from '@fastgpt/dal/db/types';
import {
  Create${entityArg}WriteSchema,
  ${entityArg}DomainReadSchema,
  type Create${entityArg}WriteInput,
  type ${entityArg}Repository
} from '../repo.type';
import { ${entityArg}CollectionName, ${modelFnName} } from './schema';

/** ${entityArg} 仓储的 MongoDB 策略实现。 */
export class Mongo${entityArg}Repository
  extends MongoRepositoryBase<typeof ${entityArg}DomainReadSchema>
  implements ${entityArg}Repository
{
  protected readonly tableName = ${entityArg}CollectionName;
  protected readonly readSchema = ${entityArg}DomainReadSchema;

  private get model() {
    return ${modelFnName}();
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

/** 跨 PostgreSQL 与 OceanBase/MySQL 可移植的 ${entityArg} 表定义（纯 B-Tree 索引）。 */
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
    { name: 'idx_${tableArg}_team', columns: ['team_id'] }
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

const noopRepoContent = `import { createEntityId } from '@fastgpt/global/common/string/entityId';
import {
  Create${entityArg}WriteSchema,
  ${entityArg}DomainReadSchema,
  type Create${entityArg}WriteInput,
  type ${entityArg}Repository
} from '../repo.type';

/**
 * 显式关闭日志库持久化（\`logMode === 'disabled'\`）时的 Null Object 空实现，不建连、不写入主库。
 */
export class Noop${entityArg}Repository implements ${entityArg}Repository {
  async findById() {
    return null;
  }

  async create({ data }: { data: Create${entityArg}WriteInput }) {
    const parsed = Create${entityArg}WriteSchema.parse(data);
    const now = new Date();
    return ${entityArg}DomainReadSchema.parse({
      _id: parsed._id ?? createEntityId(),
      teamId: parsed.teamId,
      createTime: now,
      updateTime: now
    });
  }
}
`;

const repoTokenContent =
  datasource === 'log'
    ? `import { defineLogRepoToken } from '@fastgpt/dal/db/container';
import type { ${entityArg}Repository } from './repo.type';
import { Mongo${entityArg}Repository } from './mongo/repo';
import { Noop${entityArg}Repository } from './noop/repo';
import { Sql${entityArg}Repository } from './sql/repo';

/**
 * ${entityArg} 日志仓储 DI Token。
 *
 * 日志数据源遵循三态拓扑：默认 \`shared\` 复用主池、配置 \`logWriteUrl\` 走 \`separate\` 独立池、
 * 显式 \`logDisabled: true\` 自动路由至 \`Noop\` 空实现。
 */
export const ${entityArg}RepoToken = defineLogRepoToken<${entityArg}Repository>(
  '${entityArg}Repository',
  {
    mongo: () => new Mongo${entityArg}Repository(),
    sql: () => new Sql${entityArg}Repository(),
    noop: () => new Noop${entityArg}Repository()
  }
);
`
    : `import { defineRepoToken } from '@fastgpt/dal/db/container';
import type { ${entityArg}Repository } from './repo.type';
import { Mongo${entityArg}Repository } from './mongo/repo';
import { Sql${entityArg}Repository } from './sql/repo';

/** ${entityArg} 仓储 DI Token（按运行时自动路由至 Mongo 或通用 SQL 实现）。 */
export const ${entityArg}RepoToken = defineRepoToken<${entityArg}Repository>(
  '${entityArg}Repository',
  {
    mongo: () => new Mongo${entityArg}Repository(),
    sql: () => new Sql${entityArg}Repository()
  }
);
`;

const serviceContent = `import { injectRepo } from '@fastgpt/dal/db/container';
import type { DbSession } from '@fastgpt/dal/db/types';
import { ${entityArg}RepoToken } from './repo';
import type { Create${entityArg}WriteInput, ${entityArg}Repository } from './repo.type';

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

const domainImportPrefix = domainRel.startsWith('packages/service/')
  ? `@fastgpt/service/${domainRel.slice('packages/service/'.length)}`
  : `@/${domainRel.replace(/^projects\/app\/src\/|^pro\/admin\/src\//, '')}`;

const contractTestContent = `import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEntityId } from '@fastgpt/global/common/string/entityId';
import { injectRepo } from '@fastgpt/dal/db/container';
import { closeDbRuntime } from '@fastgpt/dal/db/runtime';
import { compileSqlTableDDL } from '@fastgpt/dal/db/sql/ddl';
import {
  createPGliteSqlTestHarness,
  registerDualDialectContractSuite,
  type SqlTestHarness
} from '@fastgpt/dal/db/testing';
import { runInTransaction } from '@fastgpt/dal/db/transaction';
import { configureMongoDalRuntime } from '@fastgpt/service/common/mongo/dalRuntime';
import { ${modelFnName} } from '${domainImportPrefix}/mongo/schema';${
  datasource === 'log'
    ? `\nimport { Noop${entityArg}Repository } from '${domainImportPrefix}/noop/repo';`
    : ''
}
import { ${entityArg}RepoToken } from '${domainImportPrefix}/repo';
import { ${camelEntity}SqlTable } from '${domainImportPrefix}/sql/table';

describe('${entityArg} portable SQL DDL (OceanBase/MySQL + PostgreSQL)', () => {
  it('compiles cleanly for OceanBase/MySQL (P0) and PostgreSQL (P1)', () => {
    const obSql = compileSqlTableDDL(${camelEntity}SqlTable, 'oceanbase').join('\\n');
    expect(obSql).toContain('CREATE TABLE IF NOT EXISTS \`${tableArg}\`');
    expect(obSql).toContain('DATETIME(3)');
    expect(obSql).not.toContain('CREATE INDEX IF NOT EXISTS');

    const pgSql = compileSqlTableDDL(${camelEntity}SqlTable, 'postgres').join('\\n');
    expect(pgSql).toContain('CREATE TABLE IF NOT EXISTS "${tableArg}"');
    expect(pgSql).toContain('TIMESTAMPTZ');
  });
});
${
  datasource === 'log'
    ? `
describe('${entityArg}Repository tri-state logMode & Noop fallback', () => {
  it('skips persistence and returns empty reads when logDisabled=true routes to Noop', async () => {
    const noopRepo = new Noop${entityArg}Repository();
    const teamId = createEntityId();
    const created = await noopRepo.create({ data: { teamId } });

    expect(created.teamId).toBe(teamId);
    expect(await noopRepo.findById({ id: created._id, teamId })).toBeNull();
  });
});
`
    : ''
}
describe('${entityArg}Repository multi-dialect contract', () => {
  let sqlHarness: SqlTestHarness | undefined;

  registerDualDialectContractSuite({
    describeFn: describe,
    beforeAllFn: beforeAll,
    beforeEachFn: beforeEach,
    afterAllFn: afterAll,
    backends: [
      {
        label: 'MongoDB',
        dialect: 'mongo',
        setup: async () => {
          await closeDbRuntime();
          const uri = process.env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/test';
          configureMongoDalRuntime({
            mainWriteUrl: uri${
              datasource === 'log' ? ',\n            logWriteUrl: uri' : ''
            }
          });
          await ${modelFnName}()
            .createCollection()
            .catch(() => undefined);
        },
        cleanupEach: async () => {
          await ${modelFnName}().deleteMany({});
        },
        teardown: async () => {
          await closeDbRuntime();
        }
      },
      {
        label: 'SQL (PGlite)',
        dialect: 'postgres',
        setup: async () => {
          sqlHarness = await createPGliteSqlTestHarness({
            ${datasource === 'log' ? 'tables: [],\n            logTables: [' : 'tables: ['}${camelEntity}SqlTable]${
              datasource === 'log' ? ',\n            withLogDatabase: true' : ''
            }
          });
        },
        cleanupEach: async () => {
          await sqlHarness?.truncateAll();
        },
        teardown: async () => {
          await sqlHarness?.close();
        }
      }
    ],
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
import type { ${entityArg}DomainDTO, ${entityArg}Repository } from '${domainImportPrefix}/repo.type';
import { ${entityArg}Service } from '${domainImportPrefix}/service';

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
const serviceRelPath = `${domainRel}/service.ts`;
const serviceAlreadyExists = fs.existsSync(path.resolve(repoRoot, serviceRelPath));
const serviceTestAlreadyExists = fs.existsSync(path.resolve(repoRoot, serviceTestRel));
const shouldEmitService = !noService && (force || !serviceAlreadyExists);
// 仅在本次新建配套 service.ts 时才生成对应模板单测，避免原位保留旧 service.ts 时导入不存在的新类导致报错
const shouldEmitServiceTest = shouldEmitService && (force || !serviceTestAlreadyExists);
const skippedServiceTestDueToExistingService =
  !noService && !shouldEmitService && !serviceTestAlreadyExists;

const filesToCreate = [
  { relPath: `${domainRel}/repo.type.ts`, content: repoTypeContent },
  { relPath: `${domainRel}/mongo/schema.ts`, content: mongoSchemaContent },
  { relPath: `${domainRel}/mongo/repo.ts`, content: mongoRepoContent },
  { relPath: `${domainRel}/sql/table.ts`, content: sqlTableContent },
  { relPath: `${domainRel}/sql/repo.ts`, content: sqlRepoContent },
  ...(datasource === 'log'
    ? [{ relPath: `${domainRel}/noop/repo.ts`, content: noopRepoContent }]
    : []),
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
