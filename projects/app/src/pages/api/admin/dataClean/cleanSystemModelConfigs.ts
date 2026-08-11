import { NextAPI } from '@/service/middleware/entry';
import type { ApiRequestProps } from '@fastgpt/next/type';
import { BoolSchema, IntSchema } from '@fastgpt/global/common/zod';
import { defaultQAModels, defaultVectorModels } from '@fastgpt/global/core/ai/constants';
import {
  EmbeddingModelItemSchema,
  LLMModelItemSchema,
  ModelPriceTierSchema,
  PersistedSystemModelItemSchema,
  RerankModelItemSchema,
  STTModelItemSchema,
  TTSModelItemSchema,
  type SystemModelItemType
} from '@fastgpt/global/core/ai/model.schema';
import { MongoSystemModel } from '@fastgpt/service/core/ai/config/schema';
import { updatedReloadSystemModel } from '@fastgpt/service/core/ai/config/utils';
import { parseApiInput } from '@fastgpt/service/common/zod/requestParseError';
import { authCert } from '@fastgpt/service/support/permission/auth/common';
import { isDeepStrictEqual } from 'node:util';
import z from 'zod';

const DEFAULT_SAMPLE_LIMIT = 20;

const CleanSystemModelConfigsBodySchema = z.object({
  dryRun: BoolSchema.optional().default(true),
  sampleLimit: IntSchema.max(100).optional().default(DEFAULT_SAMPLE_LIMIT)
});
export type CleanSystemModelConfigsBody = z.infer<typeof CleanSystemModelConfigsBodySchema>;

const CleanupIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string()
});

const CleanSystemModelConfigsResponseSchema = z.object({
  dryRun: z.boolean(),
  scanned: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  invalid: z.number().int().nonnegative(),
  wouldUpdate: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  invalidSamples: z.array(
    z.object({
      model: z.string(),
      issues: z.array(CleanupIssueSchema)
    })
  )
});
export type CleanSystemModelConfigsResponse = z.infer<typeof CleanSystemModelConfigsResponseSchema>;

const parseLegacyNumber = (value: unknown) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const LegacyOptionalNumberSchema = z.preprocess(parseLegacyNumber, z.number().optional());
const legacyNumberWithDefaultSchema = (defaultValue: number) =>
  z.preprocess((value) => parseLegacyNumber(value) ?? defaultValue, z.number());

const defaultLlmConfig = defaultQAModels[0];
const defaultEmbeddingConfig = defaultVectorModels[0];

const LegacyModelPriceTierSchema = ModelPriceTierSchema.extend({
  minInputTokens: LegacyOptionalNumberSchema,
  maxInputTokens: LegacyOptionalNumberSchema,
  inputPrice: legacyNumberWithDefaultSchema(0),
  outputPrice: legacyNumberWithDefaultSchema(0)
});

const LegacyPriceTiersSchema = z.preprocess((value) => {
  if (value === '' || value === null) return undefined;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}, z.array(LegacyModelPriceTierSchema).optional());

const legacyPriceFields = {
  charsPointsPrice: LegacyOptionalNumberSchema,
  priceTiers: LegacyPriceTiersSchema,
  inputPrice: LegacyOptionalNumberSchema,
  outputPrice: LegacyOptionalNumberSchema
};

const LegacySystemModelItemSchema = z
  .discriminatedUnion('type', [
    LLMModelItemSchema.extend({
      ...legacyPriceFields,
      maxContext: legacyNumberWithDefaultSchema(defaultLlmConfig.maxContext),
      maxResponse: legacyNumberWithDefaultSchema(defaultLlmConfig.maxResponse),
      quoteMaxToken: legacyNumberWithDefaultSchema(defaultLlmConfig.quoteMaxToken),
      maxTemperature: LegacyOptionalNumberSchema
    }),
    EmbeddingModelItemSchema.extend({
      ...legacyPriceFields,
      defaultToken: legacyNumberWithDefaultSchema(defaultEmbeddingConfig.defaultToken),
      maxToken: legacyNumberWithDefaultSchema(defaultEmbeddingConfig.maxToken),
      weight: LegacyOptionalNumberSchema
    }),
    TTSModelItemSchema.extend(legacyPriceFields),
    STTModelItemSchema.extend(legacyPriceFields),
    RerankModelItemSchema.extend({
      ...legacyPriceFields,
      maxToken: LegacyOptionalNumberSchema
    })
  ])
  .transform((metadata) => PersistedSystemModelItemSchema.parse(metadata));

export type SystemModelCleanupResult =
  | {
      status: 'valid';
      changed: boolean;
      metadata: SystemModelItemType;
    }
  | {
      status: 'invalid';
      issues: Array<{ path: Array<string | number>; message: string }>;
    };

/** 只转换已知历史格式，无法通过当前完整 Schema 的记录留给管理员人工处理。 */
export const cleanSystemModelConfig = ({
  model,
  metadata
}: {
  model: unknown;
  metadata: unknown;
}): SystemModelCleanupResult => {
  if (typeof model !== 'string' || !metadata || typeof metadata !== 'object') {
    return {
      status: 'invalid',
      issues: [{ path: [], message: 'model and metadata are required' }]
    };
  }

  const normalizedModel = model.trim();
  const rawMetadata = metadata as Record<string, unknown>;
  const result = LegacySystemModelItemSchema.safeParse({
    ...rawMetadata,
    model: normalizedModel,
    name:
      typeof rawMetadata.name === 'string' && rawMetadata.name.trim()
        ? rawMetadata.name.trim()
        : normalizedModel
  });

  if (!result.success) {
    return {
      status: 'invalid',
      issues: result.error.issues.map((issue) => ({
        path: issue.path.map((item) =>
          typeof item === 'symbol' ? (item.description ?? '') : item
        ),
        message: issue.message
      }))
    };
  }

  return {
    status: 'valid',
    changed: !isDeepStrictEqual(rawMetadata, result.data),
    metadata: result.data
  };
};

/** 扫描并一次性清洗历史系统模型配置；正式执行后统一重载系统模型缓存。 */
export const runCleanSystemModelConfigs = async ({
  dryRun,
  sampleLimit
}: CleanSystemModelConfigsBody): Promise<CleanSystemModelConfigsResponse> => {
  const stats: CleanSystemModelConfigsResponse = {
    dryRun,
    scanned: 0,
    unchanged: 0,
    invalid: 0,
    wouldUpdate: 0,
    updated: 0,
    invalidSamples: []
  };
  type BulkOperation = Parameters<typeof MongoSystemModel.bulkWrite>[0][number];
  const operations: BulkOperation[] = [];

  const cursor = MongoSystemModel.find({}, { model: 1, metadata: 1 }).lean().cursor();
  for await (const record of cursor) {
    stats.scanned += 1;
    const cleaned = cleanSystemModelConfig({
      model: record.model,
      metadata: record.metadata
    });

    if (cleaned.status === 'invalid') {
      stats.invalid += 1;
      if (stats.invalidSamples.length < sampleLimit) {
        stats.invalidSamples.push({
          model: typeof record.model === 'string' ? record.model : String(record._id),
          issues: cleaned.issues
        });
      }
      continue;
    }
    if (!cleaned.changed) {
      stats.unchanged += 1;
      continue;
    }
    if (dryRun) {
      stats.wouldUpdate += 1;
      continue;
    }

    operations.push({
      updateOne: {
        filter: { _id: record._id },
        update: { $set: { metadata: cleaned.metadata } }
      }
    });
  }

  if (operations.length > 0) {
    const result = await MongoSystemModel.bulkWrite(operations, { ordered: false });
    stats.updated = result.modifiedCount;
  }

  if (!dryRun) {
    await updatedReloadSystemModel();
  }

  return CleanSystemModelConfigsResponseSchema.parse(stats);
};

async function handler(req: ApiRequestProps): Promise<CleanSystemModelConfigsResponse> {
  await authCert({ req, authRoot: true });

  const { body } = parseApiInput({
    req,
    bodySchema: CleanSystemModelConfigsBodySchema
  });

  return runCleanSystemModelConfigs(body);
}

export default NextAPI(handler);
