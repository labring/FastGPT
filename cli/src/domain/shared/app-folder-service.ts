import { FolderImgUrl } from '@fastgpt/global/common/file/image/constants';
import type { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  CreateAppRequestBodySchema,
  type CreateAppResponseType,
  type ListAppV2ResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliArgumentError } from '../../shared/errors';
import { trimIfString } from '../../shared/input';
import { createChangedResult, createDryRunResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';
import {
  deleteAppResource,
  listAppResources,
  parseCreatedAppId,
  updateAppMetadataResource,
  type AppListInput
} from './app-resource';

export type AppFolderService = {
  list: (params: {
    client: FastGptHttpClient;
    input: AppListInput;
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
 * 统一的 App 目录树领域服务工厂，供 `agent folder`（`folder`）与 `tool folder`（`toolFolder`）共用同一套 CRUD 与类型校验逻辑。
 */
export function createAppFolderService({
  folderType,
  commandPrefix,
  label,
  capitalizedLabel
}: {
  folderType: AppTypeEnum.folder | AppTypeEnum.toolFolder;
  commandPrefix: string;
  label: string;
  capitalizedLabel: string;
}): AppFolderService {
  return {
    list: ({ client, input }) =>
      listAppResources({
        client,
        types: [folderType],
        input
      }),

    create: async ({ client, input, dryRun }) => {
      const name = trimIfString(input.name);
      if (!name) {
        throw new CliArgumentError(
          `${capitalizedLabel} name is required.`,
          undefined,
          'Pass --name "<folderName>".'
        );
      }

      const validatedBody = CreateAppRequestBodySchema.parse({
        name,
        type: folderType,
        avatar: input.avatar ?? FolderImgUrl,
        ...(input.intro !== undefined ? { intro: input.intro } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.inheritPermission !== undefined
          ? { inheritPermission: input.inheritPermission }
          : {})
      });

      if (dryRun) {
        return createDryRunResult({
          operation: `${commandPrefix} create`,
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/app/create',
            payload: validatedBody
          }
        });
      }

      const rawFolderId = await client.request<CreateAppResponseType>({
        method: 'POST',
        path: '/core/app/create',
        body: validatedBody
      });
      const folderId = parseCreatedAppId(rawFolderId, label);

      return createChangedResult({
        data: {
          folderId,
          name: validatedBody.name,
          ...(validatedBody.parentId !== undefined ? { parentId: validatedBody.parentId } : {})
        },
        message: `${capitalizedLabel} "${validatedBody.name}" created (${folderId}).`
      });
    },

    update: ({ client, folderId, input, dryRun }) =>
      updateAppMetadataResource({
        client,
        appId: folderId,
        input,
        allowedTypes: [folderType],
        resourceLabel: label,
        capitalizedLabel,
        idField: 'folderId',
        operation: `${commandPrefix} update`,
        dryRun
      }),

    delete: ({ client, folderId, dryRun }) =>
      deleteAppResource({
        client,
        appId: folderId,
        allowedTypes: [folderType],
        resourceLabel: label,
        capitalizedLabel,
        idField: 'folderId',
        operation: `${commandPrefix} delete`,
        recursive: true,
        dryRun
      })
  };
}
