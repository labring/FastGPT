import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  isLegacyManualHttpToolArrayType,
  manualHttpToolValueType2JsonSchema
} from '@fastgpt/global/core/app/tool/httpTool/utils';
import type { AnyBulkWriteOperation, Model } from '@fastgpt/service/common/mongo';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { MongoApp } from '@fastgpt/service/core/app/schema';
import { MongoAppVersion } from '@fastgpt/service/core/app/version/schema';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import z from 'zod';

type UnknownRecord = Record<string, any>;
type WorkflowDocument = {
  _id: unknown;
  appId?: unknown;
  modules?: unknown;
  nodes?: unknown;
};
type WorkflowFieldName = 'modules' | 'nodes';

const InitHttpToolSchemaBodySchema = z.object({
  dryRun: BoolSchema.optional().default(true),
  batchSize: IntSchema.min(1).max(5000).optional().default(500)
});
type InitHttpToolSchemaBodyType = z.infer<typeof InitHttpToolSchemaBodySchema>;

const HttpToolSchemaMigrationStatsSchema = z.object({
  scannedDocumentCount: z.number().int().nonnegative(),
  changedDocumentCount: z.number().int().nonnegative(),
  modifiedDocumentCount: z.number().int().nonnegative(),
  convertedPropertyCount: z.number().int().nonnegative()
});
type HttpToolSchemaMigrationStatsType = z.infer<typeof HttpToolSchemaMigrationStatsSchema>;

const InitHttpToolSchemaResponseSchema = z.object({
  dryRun: z.boolean(),
  batchSize: z.number().int().positive(),
  apps: HttpToolSchemaMigrationStatsSchema,
  appVersions: HttpToolSchemaMigrationStatsSchema,
  total: HttpToolSchemaMigrationStatsSchema
});
type InitHttpToolSchemaResponseType = z.infer<typeof InitHttpToolSchemaResponseSchema>;

const createStats = (): HttpToolSchemaMigrationStatsType => ({
  scannedDocumentCount: 0,
  changedDocumentCount: 0,
  modifiedDocumentCount: 0,
  convertedPropertyCount: 0
});

const isRecord = (value: unknown): value is UnknownRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

/**
 * 将工作流节点中手工 HTTP 工具的历史数组类型转换为标准 JSON Schema。
 *
 * 仅处理 `apiSchemaStr` 未定义的手工模式；返回新节点数组和转换数量，
 * 未发生转换时保留原数组引用，便于迁移层跳过无效写入。
 */
export function formatManualHttpToolSchemas(nodes: unknown): {
  nodes: unknown;
  changed: boolean;
  convertedPropertyCount: number;
} {
  if (!Array.isArray(nodes)) {
    return {
      nodes,
      changed: false,
      convertedPropertyCount: 0
    };
  }

  let convertedPropertyCount = 0;
  const formattedNodes = nodes.map((node) => {
    if (!isRecord(node) || !isRecord(node.toolConfig)) return node;

    const httpToolSet = node.toolConfig.httpToolSet;
    if (!isRecord(httpToolSet) || httpToolSet.apiSchemaStr !== undefined) return node;
    if (!Array.isArray(httpToolSet.toolList)) return node;

    let nodeChanged = false;
    const toolList = httpToolSet.toolList.map((tool: unknown) => {
      if (!isRecord(tool) || !isRecord(tool.inputSchema)) return tool;

      const properties = tool.inputSchema.properties;
      if (!isRecord(properties)) return tool;

      let toolChanged = false;
      const formattedProperties = Object.fromEntries(
        Object.entries(properties).map(([key, property]) => {
          if (!isRecord(property) || !isLegacyManualHttpToolArrayType(property.type)) {
            return [key, property];
          }

          toolChanged = true;
          nodeChanged = true;
          convertedPropertyCount += 1;
          return [
            key,
            {
              ...property,
              ...manualHttpToolValueType2JsonSchema(property.type)
            }
          ];
        })
      );

      if (!toolChanged) return tool;
      return {
        ...tool,
        inputSchema: {
          ...tool.inputSchema,
          properties: formattedProperties
        }
      };
    });

    if (!nodeChanged) return node;
    return {
      ...node,
      toolConfig: {
        ...node.toolConfig,
        httpToolSet: {
          ...httpToolSet,
          toolList
        }
      }
    };
  });

  return {
    nodes: convertedPropertyCount > 0 ? formattedNodes : nodes,
    changed: convertedPropertyCount > 0,
    convertedPropertyCount
  };
}

/** 按筛选条件流式扫描单个工作流集合，并在非 dry-run 时批量写回已转换文档。 */
async function migrateCollection({
  model,
  fieldName,
  baseQuery,
  onDocuments,
  options
}: {
  model: Model<any>;
  fieldName: WorkflowFieldName;
  baseQuery: Record<string, unknown>;
  onDocuments?: (documents: WorkflowDocument[]) => void;
  options: InitHttpToolSchemaBodyType;
}): Promise<HttpToolSchemaMigrationStatsType> {
  const stats = createStats();

  const migrateBatch = async (documents: WorkflowDocument[]) => {
    onDocuments?.(documents);
    const operations: AnyBulkWriteOperation<any>[] = [];
    stats.scannedDocumentCount += documents.length;

    for (const document of documents) {
      const result = formatManualHttpToolSchemas(document[fieldName]);
      if (!result.changed) continue;

      stats.changedDocumentCount += 1;
      stats.convertedPropertyCount += result.convertedPropertyCount;
      operations.push({
        updateOne: {
          filter: { _id: document._id },
          update: { $set: { [fieldName]: result.nodes } }
        }
      });
    }

    if (!options.dryRun && operations.length > 0) {
      const result = await model.bulkWrite(operations, { ordered: false });
      stats.modifiedDocumentCount += result.modifiedCount;
    }
  };

  const cursor = model
    .find(baseQuery, { _id: 1, appId: 1, [fieldName]: 1 })
    .lean()
    .cursor({ batchSize: options.batchSize });
  let documents: WorkflowDocument[] = [];

  for await (const document of cursor) {
    documents.push(document as WorkflowDocument);
    if (documents.length < options.batchSize) continue;

    await migrateBatch(documents);
    documents = [];
  }
  if (documents.length > 0) await migrateBatch(documents);

  return stats;
}

const mergeStats = (
  statsList: HttpToolSchemaMigrationStatsType[]
): HttpToolSchemaMigrationStatsType =>
  statsList.reduce(
    (total, stats) => ({
      scannedDocumentCount: total.scannedDocumentCount + stats.scannedDocumentCount,
      changedDocumentCount: total.changedDocumentCount + stats.changedDocumentCount,
      modifiedDocumentCount: total.modifiedDocumentCount + stats.modifiedDocumentCount,
      convertedPropertyCount: total.convertedPropertyCount + stats.convertedPropertyCount
    }),
    createStats()
  );

/** 扫描当前应用和应用版本，清洗手工 HTTP 工具的历史数组 Schema。 */
export async function runInitHttpToolSchemaMigration(
  options: InitHttpToolSchemaBodyType
): Promise<InitHttpToolSchemaResponseType> {
  const httpToolAppIds: unknown[] = [];
  const apps = await migrateCollection({
    model: MongoApp,
    fieldName: 'modules',
    baseQuery: {
      type: AppTypeEnum.httpToolSet
    },
    onDocuments: (documents) => {
      httpToolAppIds.push(...documents.map((document) => document._id));
    },
    options
  });
  const appVersions =
    httpToolAppIds.length > 0
      ? await migrateCollection({
          model: MongoAppVersion,
          fieldName: 'nodes',
          baseQuery: {
            appId: { $in: httpToolAppIds }
          },
          options
        })
      : createStats();

  return InitHttpToolSchemaResponseSchema.parse({
    dryRun: options.dryRun,
    batchSize: options.batchSize,
    apps,
    appVersions,
    total: mergeStats([apps, appVersions])
  });
}

/** 4.16.0 HTTP 工具 Schema 管理员迁移入口，默认仅执行 dry-run。 */
async function handler(req: ApiRequestProps): Promise<InitHttpToolSchemaResponseType> {
  await authCert({ req, authRoot: true });
  const { body } = parseApiInput({
    req,
    bodySchema: InitHttpToolSchemaBodySchema
  });

  return runInitHttpToolSchemaMigration(body);
}

export default NextAPI(handler);
