import {
  LLMModelItemSchema,
  EmbeddingModelItemSchema,
  TTSModelItemSchema,
  STTModelItemSchema,
  RerankModelItemSchema
} from '@fastgpt/global/core/ai/model/type';
import { ModelTypeEnum } from '@fastgpt/global/core/ai/constants';

import type { ZodObject, ZodRawShape } from 'zod';

const schemaByType: Record<string, ZodObject<ZodRawShape>> = {
  [ModelTypeEnum.llm]: LLMModelItemSchema,
  [ModelTypeEnum.embedding]: EmbeddingModelItemSchema,
  [ModelTypeEnum.tts]: TTSModelItemSchema,
  [ModelTypeEnum.stt]: STTModelItemSchema,
  [ModelTypeEnum.rerank]: RerankModelItemSchema
};

/**
 * Clean model data against the type-specific Zod schema.
 * - Strips fields not defined in the schema
 * - Fills default values defined in the schema
 * - Validates required fields (unless `partial` — then only strips unknowns)
 * - Returns a flat object matching SystemModelItemType (without `id`/`_id`)
 *
 * `id`/`_id` are always stripped from the output (MongoDB auto-generates `_id`),
 * so they are optional on input — this lets create/insert paths validate payloads
 * that have no id yet. Use `partial: true` for bulk import paths where input may
 * also omit type-specific required fields (the upsert/merge fills the gaps).
 */
export function normalizeSystemModel(
  input: Record<string, unknown>,
  options?: { partial?: boolean }
): Record<string, unknown> {
  const type = input.type as string;
  const schema = schemaByType[type];

  if (!schema) {
    throw new Error(`Unknown model type: ${type}`);
  }

  // Convert MongoDB _id to id before schema validation (then strip both below).
  if (input._id && !input.id) {
    input.id = String(input._id);
  }

  // id/_id are never persisted by the caller (MongoDB owns _id); drop the id
  // requirement so create payloads without an id validate cleanly.
  const writeSchema = schema.omit({ id: true });
  const effectiveSchema = options?.partial ? writeSchema.partial() : writeSchema;
  const parsed = effectiveSchema.parse(input);

  const { id, _id, ...fields } = parsed as Record<string, unknown>;
  return fields;
}

/**
 * Legacy-aware normalization for `loadSystemModels` (hot-upgrade window).
 *
 * Loads a Mongo `system_models` document into the in-memory flat model shape,
 * accepting BOTH schemas:
 * - new flat top-level structure (fields at the document root);
 * - legacy `metadata`-nested structure (pre-migration documents), where
 *   top-level fields take priority and missing ones are filled from `metadata`
 *   (null/undefined/'' values are skipped, mirroring migration Step 2a).
 *
 * `isSystem` is derived when missing (migration Step 2b): `isCustom` defined →
 * `!isCustom`; otherwise no owner (`tmbId` absent) → `true`; with an owner →
 * `false` (private/team model).
 *
 * Unlike `normalizeSystemModel`, legacy fields (`isDefault*`, `isCustom`,
 * `requestUrl/requestAuth`) are KEPT on the output — `resolveSystemDefaults`
 * reads `isDefault*` flags during the hot-upgrade window, and team models keep
 * `teamId`/`tmbId` for `resolveModelId` team scoping. The nested `metadata`
 * key itself is dropped; its values are lifted to the top level.
 */
export function normalizeLegacyModelDoc(dbModel: Record<string, unknown>): Record<string, unknown> {
  const metadata =
    dbModel.metadata && typeof dbModel.metadata === 'object'
      ? (dbModel.metadata as Record<string, unknown>)
      : undefined;

  // 1. Top-level flat fields preferred; missing ones filled from legacy metadata
  //    (requestUrl/requestAuth are NOT flattened — channels own them now).
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(dbModel)) {
    if (key === 'metadata') continue;
    flat[key] = value;
  }
  if (metadata) {
    for (const [key, value] of Object.entries(metadata)) {
      if (flat[key] !== undefined) continue;
      if (value === null || value === undefined || value === '') continue;
      if (key === 'requestUrl' || key === 'requestAuth') continue;
      flat[key] = value;
    }
  }

  // 2. Derive isSystem when missing (legacy isCustom / owner info)
  if (flat.isSystem === undefined) {
    const isCustom = flat.isCustom;
    const tmbId = flat.tmbId;
    if (isCustom !== undefined) {
      flat.isSystem = !isCustom;
    } else if (tmbId === undefined || tmbId === null) {
      flat.isSystem = true;
    } else {
      flat.isSystem = false; // has an owner → private/team model
    }
  }

  // 3. _id → id (consumers read `.id`)
  if (flat._id && flat.id === undefined) {
    flat.id = String(flat._id);
  }

  return flat;
}
