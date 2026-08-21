import { NextAPI } from '@/service/middleware/entry';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';
import { UserError } from '@fastgpt/global/common/error/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { isLegacyManualHttpToolArrayType } from '@fastgpt/global/core/app/tool/httpTool/utils';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type { Model, Types } from '@fastgpt/service/common/mongo';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import {
  cleanToolSetJsonSchemasForStorage,
  type ToolSetStorageType
} from '@fastgpt/service/core/app/jsonSchemaStorage';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import z from 'zod';

type WorkflowFieldName = 'modules' | 'nodes';
type UnknownRecord = Record<string, unknown>;
type WorkflowDocument = {
  _id: Types.ObjectId;
  modules?: unknown;
  nodes?: unknown;
};

const InitToolJsonSchemaStorageBodySchema = z.object({
  dryRun: BoolSchema.optional().default(true),
  batchSize: IntSchema.min(1).max(5000).optional().default(500)
});
type InitToolJsonSchemaStorageBody = z.infer<typeof InitToolJsonSchemaStorageBodySchema>;

const MigrationStatsSchema = z.object({
  scannedDocumentCount: z.number().int().nonnegative(),
  changedDocumentCount: z.number().int().nonnegative(),
  modifiedDocumentCount: z.number().int().nonnegative(),
  convertedSchemaCount: z.number().int().nonnegative()
});
type MigrationStats = z.infer<typeof MigrationStatsSchema>;

const InitToolJsonSchemaStorageResponseSchema = z.object({
  dryRun: z.boolean(),
  batchSize: z.number().int().positive(),
  apps: MigrationStatsSchema,
  appVersions: MigrationStatsSchema,
  total: MigrationStatsSchema
});
type InitToolJsonSchemaStorageResponse = z.infer<typeof InitToolJsonSchemaStorageResponseSchema>;

const createStats = (): MigrationStats => ({
  scannedDocumentCount: 0,
  changedDocumentCount: 0,
  modifiedDocumentCount: 0,
  convertedSchemaCount: 0
});

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const objectSchemaQuery = (fieldName: WorkflowFieldName, type: ToolSetStorageType) => ({
  $or: [
    ...(type === 'mcp'
      ? [{ [`${fieldName}.toolConfig.mcpToolSet.toolList.inputSchema`]: { $type: 'object' } }]
      : [
          { [`${fieldName}.toolConfig.httpToolSet.toolList.inputSchema`]: { $type: 'object' } },
          { [`${fieldName}.toolConfig.httpToolSet.toolList.outputSchema`]: { $type: 'object' } },
          { [`${fieldName}.toolConfig.httpToolSet.toolList.requestSchema`]: { $type: 'object' } },
          { [`${fieldName}.toolConfig.httpToolSet.toolList.responseSchema`]: { $type: 'object' } },
          { [`${fieldName}.toolConfig.httpToolSet.toolList.secretSchema`]: { $type: 'object' } }
        ])
  ]
});

/** 检查 4.16.0 的手动 HTTP 参数迁移是否已经完成，避免旧数组类型被直接字符串化。 */
const hasLegacyManualHttpToolSchemas = (nodes: unknown): boolean => {
  if (!Array.isArray(nodes)) return false;

  return nodes.some((node) => {
    if (!isRecord(node) || !isRecord(node.toolConfig)) return false;

    const httpToolSet = node.toolConfig.httpToolSet;
    if (!isRecord(httpToolSet) || httpToolSet.apiSchemaStr !== undefined) return false;
    if (!Array.isArray(httpToolSet.toolList)) return false;

    return httpToolSet.toolList.some((tool) => {
      if (!isRecord(tool) || !isRecord(tool.inputSchema)) return false;

      const properties = tool.inputSchema.properties;
      if (!isRecord(properties)) return false;

      return Object.values(properties).some(
        (property) => isRecord(property) && isLegacyManualHttpToolArrayType(property.type)
      );
    });
  });
};

/** 在任何写入前预检 4.16.0 负责范围内的全部文档，确保迁移失败时不会留下半成品。 */
const assertManualHttpToolSchemaMigrationCompleted = async ({
  model,
  fieldName,
  toolType,
  baseQuery,
  options
}: {
  model: Model<any>;
  fieldName: WorkflowFieldName;
  toolType: ToolSetStorageType;
  baseQuery: Record<string, unknown>;
  options: InitToolJsonSchemaStorageBody;
}): Promise<void> => {
  const cursor = model.collection
    .find(
      { $and: [baseQuery, objectSchemaQuery(fieldName, toolType)] },
      { projection: { _id: 1, [fieldName]: 1 } }
    )
    .batchSize(options.batchSize);

  for await (const document of cursor) {
    if (hasLegacyManualHttpToolSchemas(document[fieldName])) {
      throw new UserError(
        '检测到旧版手动 HTTP 工具数组参数，请先完成 4.16.0 initHttpToolSchema 迁移后再执行 4.16.1 initToolJsonSchemaStorage。'
      );
    }
  }
};

/** 通过原始 collection 清洗单个工作流集合，避免严格读取逻辑在迁移前解析旧 object。 */
const migrateCollection = async ({
  model,
  fieldName,
  toolType,
  baseQuery,
  options
}: {
  model: Model<any>;
  fieldName: WorkflowFieldName;
  toolType: ToolSetStorageType;
  baseQuery: Record<string, unknown>;
  options: InitToolJsonSchemaStorageBody;
}): Promise<MigrationStats> => {
  const stats = createStats();
  const cursor = model.collection
    .find(
      { $and: [baseQuery, objectSchemaQuery(fieldName, toolType)] },
      { projection: { _id: 1, [fieldName]: 1 } }
    )
    .batchSize(options.batchSize);
  let documents: WorkflowDocument[] = [];

  const migrateBatch = async () => {
    const operations: Array<Parameters<typeof model.collection.bulkWrite>[0][number]> = [];
    stats.scannedDocumentCount += documents.length;

    for (const document of documents) {
      const result = cleanToolSetJsonSchemasForStorage(document[fieldName], toolType);
      if (!result.changed) continue;

      stats.changedDocumentCount += 1;
      stats.convertedSchemaCount += result.convertedSchemaCount;
      operations.push({
        updateOne: {
          filter: { _id: document._id },
          update: { $set: { [fieldName]: result.nodes } }
        }
      });
    }

    if (!options.dryRun && operations.length > 0) {
      const result = await model.collection.bulkWrite(operations, { ordered: false });
      stats.modifiedDocumentCount += result.modifiedCount;
    }
  };

  for await (const document of cursor) {
    documents.push(document as WorkflowDocument);
    if (documents.length < options.batchSize) continue;

    await migrateBatch();
    documents = [];
  }
  if (documents.length > 0) await migrateBatch();

  return stats;
};

const mergeStats = (statsList: MigrationStats[]): MigrationStats =>
  statsList.reduce(
    (total, stats) => ({
      scannedDocumentCount: total.scannedDocumentCount + stats.scannedDocumentCount,
      changedDocumentCount: total.changedDocumentCount + stats.changedDocumentCount,
      modifiedDocumentCount: total.modifiedDocumentCount + stats.modifiedDocumentCount,
      convertedSchemaCount: total.convertedSchemaCount + stats.convertedSchemaCount
    }),
    createStats()
  );

/** 清洗 apps.modules 和 app_versions.nodes 中的历史 object JSON Schema。 */
export async function runToolJsonSchemaStorageMigration(
  options: InitToolJsonSchemaStorageBody
): Promise<InitToolJsonSchemaStorageResponse> {
  const getToolAppIds = async (type: AppTypeEnum): Promise<Types.ObjectId[]> => {
    const ids: Types.ObjectId[] = [];
    const cursor = MongoApp.collection
      .find({ type }, { projection: { _id: 1 } })
      .batchSize(options.batchSize);

    for await (const document of cursor) {
      ids.push(document._id as Types.ObjectId);
    }
    return ids;
  };

  const [mcpToolAppIds, httpToolAppIds] = await Promise.all([
    getToolAppIds(AppTypeEnum.mcpToolSet),
    getToolAppIds(AppTypeEnum.httpToolSet)
  ]);

  await Promise.all([
    assertManualHttpToolSchemaMigrationCompleted({
      model: MongoApp,
      fieldName: 'modules',
      toolType: 'http',
      baseQuery: { type: AppTypeEnum.httpToolSet },
      options
    }),
    assertManualHttpToolSchemaMigrationCompleted({
      model: MongoAppVersion,
      fieldName: 'nodes',
      toolType: 'http',
      baseQuery: { appId: { $in: httpToolAppIds } },
      options
    })
  ]);

  const [mcpApps, httpApps, mcpAppVersions, httpAppVersions] = await Promise.all([
    migrateCollection({
      model: MongoApp,
      fieldName: 'modules',
      toolType: 'mcp',
      baseQuery: { type: AppTypeEnum.mcpToolSet },
      options
    }),
    migrateCollection({
      model: MongoApp,
      fieldName: 'modules',
      toolType: 'http',
      baseQuery: { type: AppTypeEnum.httpToolSet },
      options
    }),
    migrateCollection({
      model: MongoAppVersion,
      fieldName: 'nodes',
      toolType: 'mcp',
      baseQuery: { appId: { $in: mcpToolAppIds } },
      options
    }),
    migrateCollection({
      model: MongoAppVersion,
      fieldName: 'nodes',
      toolType: 'http',
      baseQuery: { appId: { $in: httpToolAppIds } },
      options
    })
  ]);

  const apps = mergeStats([mcpApps, httpApps]);
  const appVersions = mergeStats([mcpAppVersions, httpAppVersions]);

  return InitToolJsonSchemaStorageResponseSchema.parse({
    dryRun: options.dryRun,
    batchSize: options.batchSize,
    apps,
    appVersions,
    total: mergeStats([apps, appVersions])
  });
}

/** 4.16.1 工具 JSON Schema 字符串存储升级入口，默认仅执行 dry-run。 */
async function handler(req: ApiRequestProps): Promise<InitToolJsonSchemaStorageResponse> {
  await authCert({ req, authRoot: true });
  const { body } = parseApiInput({
    req,
    bodySchema: InitToolJsonSchemaStorageBodySchema
  });

  return runToolJsonSchemaStorageMigration(body);
}

export default NextAPI(handler);
