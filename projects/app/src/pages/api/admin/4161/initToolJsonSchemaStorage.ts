import { NextAPI } from '@/service/middleware/entry';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';
import type { ApiRequestProps } from '@fastgpt/next/type';
import type { Model, Types } from '@fastgpt/service/common/mongo';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { cleanWorkflowToolJsonSchemasForStorage } from '@fastgpt/service/core/app/jsonSchemaStorage';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import z from 'zod';

type WorkflowFieldName = 'modules' | 'nodes';
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

const objectSchemaQuery = (fieldName: WorkflowFieldName) => ({
  $or: [
    { [`${fieldName}.toolConfig.mcpToolSet.toolList.inputSchema`]: { $type: 'object' } },
    { [`${fieldName}.toolConfig.httpToolSet.toolList.inputSchema`]: { $type: 'object' } },
    { [`${fieldName}.toolConfig.httpToolSet.toolList.outputSchema`]: { $type: 'object' } },
    { [`${fieldName}.toolConfig.httpToolSet.toolList.requestSchema`]: { $type: 'object' } },
    { [`${fieldName}.toolConfig.httpToolSet.toolList.responseSchema`]: { $type: 'object' } },
    { [`${fieldName}.toolConfig.httpToolSet.toolList.secretSchema`]: { $type: 'object' } }
  ]
});

/** 通过原始 collection 清洗单个工作流集合，避免严格读取逻辑在迁移前解析旧 object。 */
const migrateCollection = async ({
  model,
  fieldName,
  options
}: {
  model: Model<any>;
  fieldName: WorkflowFieldName;
  options: InitToolJsonSchemaStorageBody;
}): Promise<MigrationStats> => {
  const stats = createStats();
  const cursor = model.collection
    .find(objectSchemaQuery(fieldName), { projection: { _id: 1, [fieldName]: 1 } })
    .batchSize(options.batchSize);
  let documents: WorkflowDocument[] = [];

  const migrateBatch = async () => {
    const operations: Array<Parameters<typeof model.collection.bulkWrite>[0][number]> = [];
    stats.scannedDocumentCount += documents.length;

    for (const document of documents) {
      const result = cleanWorkflowToolJsonSchemasForStorage(document[fieldName]);
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
  const [apps, appVersions] = await Promise.all([
    migrateCollection({ model: MongoApp, fieldName: 'modules', options }),
    migrateCollection({ model: MongoAppVersion, fieldName: 'nodes', options })
  ]);

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
