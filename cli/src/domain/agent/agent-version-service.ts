import {
  AppVersionListBodySchema,
  GetAppVersionDetailQuerySchema,
  GetLatestAppVersionQuerySchema,
  UpdateAppVersionBodySchema,
  type AppVersionListResponseType,
  type GetAppVersionDetailResponseType,
  type GetLatestAppVersionResponseType,
  type UpdateAppVersionResponseType
} from '@fastgpt/global/openapi/core/app/version/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { buildPaginationMeta, trimIfString } from '../../shared/input';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';

export type AgentVersionService = {
  list: (params: {
    client: FastGptHttpClient;
    input: {
      appId: string;
      isPublish?: boolean;
      page?: number;
      pageSize?: number;
    };
  }) => Promise<CliResult<AppVersionListResponseType>>;
  getDetail: (params: {
    client: FastGptHttpClient;
    appId: string;
    versionId?: string;
  }) => Promise<CliResult<GetAppVersionDetailResponseType | GetLatestAppVersionResponseType>>;
  update: (params: {
    client: FastGptHttpClient;
    input: {
      appId: string;
      versionId: string;
      versionName: string;
    };
    dryRun?: boolean;
  }) => Promise<CliResult>;
};

/**
 * FastGPT Agent 版本历史领域服务：封装版本列表、指定/最新版本详情读取与版本重命名。
 */
export function createAgentVersionService(): AgentVersionService {
  return {
    list: async ({ client, input }) => {
      const validatedBody = AppVersionListBodySchema.parse({
        appId: trimIfString(input.appId),
        ...(input.isPublish !== undefined ? { isPublish: input.isPublish } : {}),
        ...(input.page !== undefined ? { pageNum: input.page } : {}),
        ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {})
      });

      const data = await client.request<AppVersionListResponseType>({
        method: 'POST',
        path: '/core/app/version/list',
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
    },

    getDetail: async ({ client, appId, versionId }) => {
      const trimmedVersionId = trimIfString(versionId);
      if (trimmedVersionId) {
        const validatedQuery = GetAppVersionDetailQuerySchema.parse({
          appId: trimIfString(appId),
          versionId: trimmedVersionId
        });

        const data = await client.request<GetAppVersionDetailResponseType>({
          method: 'GET',
          path: '/core/app/version/detail',
          query: validatedQuery
        });

        return createSuccessResult({ data });
      }

      const validatedQuery = GetLatestAppVersionQuerySchema.parse({
        appId: trimIfString(appId)
      });

      const data = await client.request<GetLatestAppVersionResponseType>({
        method: 'GET',
        path: '/core/app/version/latest',
        query: validatedQuery
      });

      return createSuccessResult({ data });
    },

    update: async ({ client, input, dryRun }) => {
      const validatedBody = UpdateAppVersionBodySchema.parse({
        appId: trimIfString(input.appId),
        versionId: trimIfString(input.versionId),
        versionName: input.versionName
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'agent version update',
          risk: 'write',
          preview: {
            method: 'PUT',
            path: '/core/app/version/update',
            payload: validatedBody
          }
        });
      }

      await client.request<UpdateAppVersionResponseType>({
        method: 'PUT',
        path: '/core/app/version/update',
        body: validatedBody
      });

      return createChangedResult({
        data: {
          updated: true,
          ...validatedBody
        },
        message: `Agent version "${validatedBody.versionId}" renamed to "${validatedBody.versionName}".`
      });
    }
  };
}
