import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  CreateAppRequestBodySchema,
  DeleteAppQuerySchema,
  ListAppV2BodySchema,
  UpdateAppQuerySchema,
  type CreateAppResponseType,
  type DeleteAppResponseType,
  type ListAppV2ResponseType,
  type UpdateAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliArgumentError } from '../../shared/errors';
import { buildPaginationMeta, trimIfString } from '../../shared/input';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';
import { fetchAndAssertAppType, parseToolMetadataUpdate } from './tool-shared';

export type ToolFolderService = {
  list: (params: {
    client: FastGptHttpClient;
    input: {
      searchKey?: string;
      parentId?: string | null;
      page?: number;
      pageSize?: number;
    };
  }) => Promise<CliResult<ListAppV2ResponseType>>;
  create: (params: {
    client: FastGptHttpClient;
    input: {
      name: string;
      intro?: string;
      avatar?: string;
      parentId?: string | null;
      inheritPermission?: boolean;
    };
    dryRun?: boolean;
  }) => Promise<CliResult>;
  update: (params: {
    client: FastGptHttpClient;
    folderId: string;
    input: {
      name?: string;
      intro?: string;
      avatar?: string;
      parentId?: string | null;
    };
    dryRun?: boolean;
  }) => Promise<CliResult>;
  delete: (params: {
    client: FastGptHttpClient;
    folderId: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
};

/**
 * FastGPT 工具目录领域服务：封装 `toolFolder` 目录树的列表、创建、更新与删除。
 */
export function createToolFolderService(): ToolFolderService {
  return {
    list: async ({ client, input }) => {
      const validatedBody = ListAppV2BodySchema.parse({
        type: [AppTypeEnum.toolFolder],
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
    },

    create: async ({ client, input, dryRun }) => {
      const name = trimIfString(input.name);
      if (!name) {
        throw new CliArgumentError(
          'Tool folder name is required.',
          undefined,
          'Pass --name "<folderName>".'
        );
      }

      const validatedBody = CreateAppRequestBodySchema.parse({
        name,
        type: AppTypeEnum.toolFolder,
        avatar: input.avatar ?? FolderImgUrl,
        ...(input.intro !== undefined ? { intro: input.intro } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.inheritPermission !== undefined
          ? { inheritPermission: input.inheritPermission }
          : {})
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'tool folder create',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/app/create',
            payload: validatedBody
          }
        });
      }

      const folderId = await client.request<CreateAppResponseType>({
        method: 'POST',
        path: '/core/app/create',
        body: validatedBody
      });

      return createChangedResult({
        data: {
          folderId,
          name: validatedBody.name,
          ...(validatedBody.parentId !== undefined ? { parentId: validatedBody.parentId } : {})
        },
        message: `Tool folder "${validatedBody.name}" created (${folderId}).`
      });
    },

    update: async ({ client, folderId, input, dryRun }) => {
      const validatedQuery = UpdateAppQuerySchema.parse({
        appId: trimIfString(folderId)
      });
      const validatedBody = parseToolMetadataUpdate(input);

      if (!validatedBody) {
        throw new CliArgumentError(
          'At least one field to update is required.',
          undefined,
          'Provide --name, --intro, --avatar, or --parent-id.'
        );
      }

      if (dryRun) {
        return createDryRunResult({
          operation: 'tool folder update',
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
        allowedTypes: [AppTypeEnum.toolFolder],
        resourceLabel: 'tool folder'
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
          folderId: validatedQuery.appId,
          ...validatedBody
        },
        message: `Tool folder "${validatedQuery.appId}" updated.`
      });
    },

    delete: async ({ client, folderId, dryRun }) => {
      const validatedQuery = DeleteAppQuerySchema.parse({
        appId: trimIfString(folderId)
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'tool folder delete',
          risk: 'destructive',
          preview: {
            method: 'DELETE',
            path: '/core/app/del',
            query: validatedQuery
          }
        });
      }

      await fetchAndAssertAppType({
        client,
        appId: validatedQuery.appId,
        allowedTypes: [AppTypeEnum.toolFolder],
        resourceLabel: 'tool folder'
      });

      const deletedAppIds = await client.request<DeleteAppResponseType>({
        method: 'DELETE',
        path: '/core/app/del',
        query: validatedQuery
      });

      return createChangedResult({
        data: {
          deleted: true,
          folderId: validatedQuery.appId,
          deletedAppIds
        },
        message: `Tool folder "${validatedQuery.appId}" deleted.`
      });
    }
  };
}
