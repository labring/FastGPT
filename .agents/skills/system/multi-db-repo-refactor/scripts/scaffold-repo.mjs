#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { findRepoRoot, toPosixPath } from './common.mjs';

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
  node scaffold-repo.mjs --dir <domain-dir> --entity <PascalName> --table <snake_table> [--datasource main|log] [--soft-delete] [--force] [--dry-run]

Example:
  node scaffold-repo.mjs --dir packages/service/core/dataset/synonym --entity DatasetSynonym --table dataset_synonyms`);
  process.exit(0);
}

const dirArg = getFlagValue('--dir');
const entityArg = getFlagValue('--entity');
const tableArg = getFlagValue('--table');
const datasource = getFlagValue('--datasource') ?? 'main';
const softDelete = hasFlag('--soft-delete');
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

const computeTestPath = () => {
  if (domainRel.startsWith('packages/service/')) {
    const sub = domainRel.slice('packages/service/'.length);
    return `packages/service/test/${sub}/repo.contract.test.ts`;
  }
  if (domainRel.startsWith('pro/admin/src/')) {
    const sub = domainRel.slice('pro/admin/src/'.length);
    return `pro/admin/test/${sub}/repo.contract.test.ts`;
  }
  return `${domainRel}/repo.contract.test.ts`;
};

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

const mongoRepoContent = `import { createEntityId } from '@fastgpt/global/common/string/entityId';
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

const sqlRepoContent = `import { createEntityId } from '@fastgpt/global/common/string/entityId';
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
    const row = await this.db(tx)
      .selectFrom('${tableArg}')
      .selectAll()
      .where('_id', '=', id)
      .where('team_id', '=', teamId)${
        softDelete
          ? "\n      .where('delete_time_ms', '=', SQL_ACTIVE_DELETE_TIME_MS)"
          : ''
      }
      .executeTakeFirst();

    if (row === undefined) {
      return null;
    }

    return this.parseRow({
      ...row,
      teamId: row.team_id,
      createTime: row.create_time,
      updateTime: row.update_time${softDelete ? ',\n      deleteTime: row.delete_time' : ''}
    });
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
  type Create${entityArg}WriteInput,
  type ${entityArg}Repository
} from '../repo.type';

/** 未配置独立日志库（logWriteUrl）时的 Null Object 空实现，不建连、不回退主库。 */
export class Noop${entityArg}Repository implements ${entityArg}Repository {
  async findById() {
    return null;
  }

  async create({ data }: { data: Create${entityArg}WriteInput }) {
    const parsed = Create${entityArg}WriteSchema.parse(data);
    const now = new Date();
    return {
      _id: parsed._id ?? createEntityId(),
      teamId: parsed.teamId,
      createTime: now,
      updateTime: now
    };
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

/** ${entityArg} 独立日志仓储 DI Token（未配置 logWriteUrl 时自动解析为 Noop 空实现）。 */
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

const contractTestContent = `import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createEntityId } from '@fastgpt/global/common/string/entityId';
import { injectRepo } from '@fastgpt/dal/db/container';
import { closeDbRuntime } from '@fastgpt/dal/db/runtime';
import {
  createPGliteSqlTestHarness,
  registerDualDialectContractSuite,
  type SqlTestHarness
} from '@fastgpt/dal/db/testing';
import { configureMongoDalRuntime } from '@fastgpt/service/common/mongo/dalRuntime';
import { ${entityArg}RepoToken } from '${domainImportPrefix}/repo';
import { ${camelEntity}SqlTable } from '${domainImportPrefix}/sql/table';

describe('${entityArg}Repository dual-dialect contract', () => {
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
            mainWriteUrl: uri,${
              datasource === 'log' ? '\n            logWriteUrl: uri,' : ''
            }
            transactionRunner: async ({ execute }) => execute(undefined)
          });
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

      it('creates and retrieves record with normalized IDs and tenant isolation', async () => {
        const teamId = createEntityId();
        const otherTeamId = createEntityId();

        const created = await repo.create({ data: { teamId } });
        expect(created.teamId).toBe(teamId);

        const found = await repo.findById({ id: created._id, teamId });
        expect(found).toEqual(created);

        const crossTenant = await repo.findById({ id: created._id, teamId: otherTeamId });
        expect(crossTenant).toBeNull();
      });
    }
  });
});
`;

const testRel = computeTestPath();

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
  { relPath: `${domainRel}/service.ts`, content: serviceContent },
  { relPath: testRel, content: contractTestContent }
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
  for (const file of filesToCreate) {
    console.log(`  - ${file.relPath}`);
  }
  process.exit(0);
}

for (const file of filesToCreate) {
  const abs = path.resolve(repoRoot, file.relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, file.content, 'utf8');
  console.log(`Created: ${file.relPath}`);
}
