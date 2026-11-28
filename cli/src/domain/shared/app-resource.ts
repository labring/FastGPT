import type { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  CreateAppResponseSchema,
  DeleteAppQuerySchema,
  GetAppDetailQuerySchema,
  ListAppV2BodySchema,
  UpdateAppBodySchema,
  UpdateAppQuerySchema,
  type DeleteAppResponseType,
  type GetAppDetailResponseType,
  type ListAppV2ResponseType,
  type UpdateAppBodyType,
  type UpdateAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliArgumentError, CliNetworkError } from '../../shared/errors';
import { buildPaginationMeta, trimIfString } from '../../shared/input';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';

export type AppListInput = {
  searchKey?: string;
  parentId?: string | null;
  page?: number;
  pageSize?: number;
};

export type AppMetadataUpdateInput = {
  name?: unknown;
  intro?: unknown;
  avatar?: unknown;
  parentId?: unknown;
};

/**
 * 统一的 App 资源树列表查询原语（`POST /core/app/listV2`），供 Agent、工具集与目录树共用。
 */
export async function listAppResources({
  client,
  types,
  input
}: {
  client: FastGptHttpClient;
  types: readonly AppTypeEnum[];
  input: AppListInput;
}): Promise<CliResult<ListAppV2ResponseType>> {
  const validatedBody = ListAppV2BodySchema.parse({
    type: [...types],
    ...(input.searchKey !== undefined ? { searchKey: input.searchKey } : {}),
    ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
    ...(input.page !== undefined ? { pageNum: input.page } : {}),
    ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {})
  });

  const data = await client.request<ListAppV2ResponseType>({
    method: 'POST',
    path: '/core/app/listV2',
    body: validatedBody
  });

  return createSuccessResult({
    data,
    meta: buildPaginationMeta({
      validatedBody: validatedBody as Record<string, unknown>,
      total: data.total,
      count: data.list.length
    })
  });
}

/**
 * 读取指定应用详情并校验其 `type` 属于预期资源类型，防止跨资源树误改或误删。
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
 * 校验创建接口返回的 App / 工具集 / 目录 ID；服务端未返回合法 ObjectId 时视为写入确认缺失（outcome: "unknown"）。
 */
export function parseCreatedAppId(raw: unknown, resourceLabel: string): string {
  const parsed = CreateAppResponseSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }
  throw new CliNetworkError(
    `Creating ${resourceLabel} did not return a valid resource ID; write outcome is unknown.`,
    'List existing resources on the server to confirm whether it was created before retrying.',
    { outcome: 'unknown', phase: 'invalid_response' }
  );
}

/**
 * 构造并校验 App 基础元信息更新载荷（`PUT /core/app/update`）。
 */
export function parseAppMetadataUpdate(
  input: AppMetadataUpdateInput
): UpdateAppBodyType | undefined {
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

/**
 * 统一的 App 基础元信息更新流程：入参校验 → dry-run 预览 → 类型守卫 → `PUT /core/app/update`。
 */
export async function updateAppMetadataResource({
  client,
  appId,
  input,
  allowedTypes,
  resourceLabel,
  capitalizedLabel,
  idField,
  operation,
  dryRun
}: {
  client: FastGptHttpClient;
  appId: string;
  input: AppMetadataUpdateInput;
  allowedTypes: readonly AppTypeEnum[];
  resourceLabel: string;
  capitalizedLabel: string;
  idField: 'agentId' | 'folderId' | 'appId';
  operation: string;
  dryRun?: boolean;
}): Promise<CliResult> {
  const validatedQuery = UpdateAppQuerySchema.parse({
    appId: trimIfString(appId)
  });
  const validatedBody = parseAppMetadataUpdate(input);

  if (!validatedBody) {
    throw new CliArgumentError(
      'At least one field to update is required.',
      undefined,
      'Provide --name, --intro, --avatar, or --parent-id.'
    );
  }

  if (dryRun) {
    return createDryRunResult({
      operation,
      risk: 'write',
      preview: {
        method: 'PUT',
        path: '/core/app/update',
        query: validatedQuery,
        payload: validatedBody
      }
    });
  }

  await fetchAndAssertAppType({
    client,
    appId: validatedQuery.appId,
    allowedTypes,
    resourceLabel
  });

  await client.request<UpdateAppResponseType>({
    method: 'PUT',
    path: '/core/app/update',
    query: validatedQuery,
    body: validatedBody
  });

  return createChangedResult({
    data: {
      updated: true,
      [idField]: validatedQuery.appId,
      ...validatedBody
    },
    message: `${capitalizedLabel} "${validatedQuery.appId}" updated.`
  });
}

/**
 * 统一的 App 资源删除流程：入参校验 → dry-run 预览 → 类型守卫 → `DELETE /core/app/del`。
 */
export async function deleteAppResource({
  client,
  appId,
  allowedTypes,
  resourceLabel,
  capitalizedLabel,
  idField,
  operation,
  recursive = false,
  dryRun
}: {
  client: FastGptHttpClient;
  appId: string;
  allowedTypes: readonly AppTypeEnum[];
  resourceLabel: string;
  capitalizedLabel: string;
  idField: 'agentId' | 'folderId' | 'appId';
  operation: string;
  recursive?: boolean;
  dryRun?: boolean;
}): Promise<CliResult> {
  const validatedQuery = DeleteAppQuerySchema.parse({
    appId: trimIfString(appId)
  });

  if (dryRun) {
    return createDryRunResult({
      operation,
      risk: 'destructive',
      preview: {
        method: 'DELETE',
        path: '/core/app/del',
        query: validatedQuery,
        ...(recursive ? { recursive: true } : {})
      }
    });
  }

  await fetchAndAssertAppType({
    client,
    appId: validatedQuery.appId,
    allowedTypes,
    resourceLabel
  });

  const deletedAppIds = await client.request<DeleteAppResponseType>({
    method: 'DELETE',
    path: '/core/app/del',
    query: validatedQuery
  });

  return createChangedResult({
    data: {
      deleted: true,
      [idField]: validatedQuery.appId,
      deletedAppIds
    },
    message: `${capitalizedLabel} "${validatedQuery.appId}" deleted.`
  });
}
