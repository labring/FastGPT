import type { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { StoreSecretValueTypeApiInputSchema } from '@fastgpt/global/common/secret/utils';
import {
  GetAppDetailQuerySchema,
  UpdateAppBodySchema,
  type GetAppDetailResponseType,
  type UpdateAppBodyType
} from '@fastgpt/global/openapi/core/app/common/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliArgumentError } from '../../shared/errors';
import { isPlainObject, trimIfString } from '../../shared/input';

export type HeaderSecretInput = Record<string, { value?: string; secret?: string }>;

/**
 * 将 `--header-secret` / `--header` JSON 规范化为 FastGPT `StoreSecretValueType`；
 * 同时兼容简洁 `{ "Authorization": "Bearer xxx" }` 与标准 `{ "Authorization": { "value": "Bearer xxx" } }`。
 */
export function normalizeHeaderSecretInput(
  raw: unknown
): ReturnType<typeof StoreSecretValueTypeApiInputSchema.parse> | undefined {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) {
    throw new CliArgumentError(
      'headerSecret must be a JSON object.',
      undefined,
      'Example: --header-secret \'{"Authorization":{"value":"Bearer xxx"}}\' or \'{"Authorization":"Bearer xxx"}\''
    );
  }

  const normalized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      throw new CliArgumentError('headerSecret cannot contain an empty header name.');
    }
    if (typeof val === 'string') {
      normalized[trimmedKey] = { value: val };
    } else {
      normalized[trimmedKey] = val;
    }
  }

  return StoreSecretValueTypeApiInputSchema.parse(normalized);
}

/**
 * 脱敏 `headerSecret` 预览，避免 `--dry-run` 输出明文凭据。
 */
export function redactHeaderSecretPreview(
  headerSecret?: Record<string, unknown>
): Record<string, Record<string, unknown>> | undefined {
  if (!headerSecret) return undefined;
  const masked: Record<string, Record<string, unknown>> = {};
  for (const [key, val] of Object.entries(headerSecret)) {
    if (isPlainObject(val)) {
      masked[key] = {
        ...val,
        ...('value' in val && val.value ? { value: '[REDACTED]' } : {}),
        ...('secret' in val && val.secret ? { secret: '[REDACTED]' } : {})
      };
    } else {
      masked[key] = { value: '[REDACTED]' };
    }
  }
  return masked;
}

/**
 * 读取指定应用详情并校验其 `type` 属于预期工具类型，防止跨资源类型误改或误删。
 */
export async function fetchAndAssertAppType({
  client,
  appId,
  allowedTypes,
  resourceLabel
}: {
  client: FastGptHttpClient;
  appId: string;
  allowedTypes: readonly AppTypeEnum[];
  resourceLabel: string;
}): Promise<GetAppDetailResponseType> {
  const validatedQuery = GetAppDetailQuerySchema.parse({
    appId: trimIfString(appId)
  });

  const detail = await client.request<GetAppDetailResponseType>({
    method: 'GET',
    path: '/core/app/detail',
    query: validatedQuery
  });

  if (!allowedTypes.includes(detail.type as AppTypeEnum)) {
    throw new CliArgumentError(
      `Resource "${validatedQuery.appId}" has type "${detail.type}", expected ${resourceLabel} (${allowedTypes.join(' or ')}).`
    );
  }

  return detail;
}

/**
 * 构造并校验工具/目录的基础元信息更新载荷（`PUT /core/app/update`）。
 */
export function parseToolMetadataUpdate(input: {
  name?: unknown;
  intro?: unknown;
  avatar?: unknown;
  parentId?: unknown;
}): UpdateAppBodyType | undefined {
  const raw: Record<string, unknown> = {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.intro !== undefined ? { intro: input.intro } : {}),
    ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
    ...(input.parentId !== undefined ? { parentId: input.parentId } : {})
  };
  if (Object.keys(raw).length === 0) {
    return undefined;
  }
  return UpdateAppBodySchema.parse(raw);
}
