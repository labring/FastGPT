import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { getMCPToolErrorText } from '@fastgpt/global/core/app/tool/mcpTool/utils';
import {
  UpdateAppQuerySchema,
  type CreateAppResponseType,
  type GetAppDetailResponseType,
  type ListAppV2ResponseType,
  type UpdateAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import {
  CreateMcpToolsBodySchema,
  GetMcpChildrenQuerySchema,
  GetMcpToolsBodySchema,
  RunMcpToolBodySchema,
  UpdateMcpToolsBodySchema,
  type GetMcpChildrenResponseType,
  type GetMcpToolsResponseType,
  type RunMcpToolResponseType,
  type UpdateMcpToolsResponseType
} from '@fastgpt/global/openapi/core/app/mcpTools/api';
import type { McpToolConfigType } from '@fastgpt/global/core/app/tool/mcpTool/type';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliApiError, CliArgumentError } from '../../shared/errors';
import { isPlainObject, trimIfString } from '../../shared/input';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';
import {
  deleteAppResource,
  fetchAndAssertAppType,
  listAppResources,
  parseAppMetadataUpdate
} from '../shared/app-resource';
import {
  hasSavedCredentials,
  isSameToolEndpoint,
  normalizeHeaderSecretInput,
  redactHeaderSecretPreview,
  validateToolEndpointUrl,
  wrapPartialWriteError
} from './tool-shared';

type ExtractedMcpConfig = {
  url?: string;
  headerSecret?: Record<string, unknown>;
  toolList?: McpToolConfigType[];
};

function extractMcpToolSetConfig(detail: GetAppDetailResponseType): ExtractedMcpConfig {
  const rootNode = Array.isArray(detail.nodes) ? detail.nodes[0] : undefined;
  const mcpToolSet = isPlainObject(rootNode?.toolConfig)
    ? (rootNode.toolConfig as Record<string, unknown>).mcpToolSet
    : undefined;
  if (!isPlainObject(mcpToolSet)) {
    return {};
  }
  return {
    url: typeof mcpToolSet.url === 'string' ? mcpToolSet.url : undefined,
    headerSecret: isPlainObject(mcpToolSet.headerSecret) ? mcpToolSet.headerSecret : undefined,
    toolList: Array.isArray(mcpToolSet.toolList)
      ? (mcpToolSet.toolList as McpToolConfigType[])
      : undefined
  };
}

export type McpToolService = {
  list: (params: {
    client: FastGptHttpClient;
    input: {
      searchKey?: string;
      parentId?: string | null;
      page?: number;
      pageSize?: number;
    };
  }) => Promise<CliResult<ListAppV2ResponseType>>;
  getDetail: (params: {
    client: FastGptHttpClient;
    appId: string;
  }) => Promise<CliResult<GetAppDetailResponseType & { mcpConfig: ExtractedMcpConfig }>>;
  listChildren: (params: {
    client: FastGptHttpClient;
    appId: string;
    searchKey?: string;
  }) => Promise<CliResult<GetMcpChildrenResponseType>>;
  parse: (params: {
    client: FastGptHttpClient;
    url: string;
    headerSecret?: unknown;
  }) => Promise<CliResult<GetMcpToolsResponseType>>;
  create: (params: {
    client: FastGptHttpClient;
    input: {
      name: string;
      url: string;
      intro?: string;
      avatar?: string;
      parentId?: string | null;
      inheritPermission?: boolean;
      headerSecret?: unknown;
      toolList?: unknown;
    };
    dryRun?: boolean;
  }) => Promise<CliResult>;
  update: (params: {
    client: FastGptHttpClient;
    appId: string;
    metadata: {
      name?: string;
      intro?: string;
      avatar?: string;
      parentId?: string | null;
    };
    config: {
      url?: string;
      headerSecret?: unknown;
      toolList?: unknown;
      refresh?: boolean;
    };
    dryRun?: boolean;
  }) => Promise<CliResult>;
  run: (params: {
    client: FastGptHttpClient;
    input: {
      appId?: string;
      url?: string;
      toolName: string;
      params?: Record<string, unknown>;
      headerSecret?: unknown;
    };
    dryRun?: boolean;
  }) => Promise<CliResult>;
  delete: (params: {
    client: FastGptHttpClient;
    appId: string;
    dryRun?: boolean;
  }) => Promise<CliResult>;
};

/**
 * FastGPT 外部 MCP 工具集领域服务：封装列表、详情、子工具、探测、创建、更新、在线调用与删除。
 */
export function createMcpToolService(): McpToolService {
  return {
    list: ({ client, input }) =>
      listAppResources({
        client,
        types: [AppTypeEnum.mcpToolSet],
        input
      }),

    getDetail: async ({ client, appId }) => {
      const detail = await fetchAndAssertAppType({
        client,
        appId,
        allowedTypes: [AppTypeEnum.mcpToolSet],
        resourceLabel: 'MCP toolset'
      });
      const mcpConfig = extractMcpToolSetConfig(detail);

      return createSuccessResult({
        data: {
          ...detail,
          mcpConfig
        }
      });
    },

    listChildren: async ({ client, appId, searchKey }) => {
      const validatedQuery = GetMcpChildrenQuerySchema.parse({
        id: trimIfString(appId),
        ...(searchKey !== undefined ? { searchKey } : {})
      });

      const data = await client.request<GetMcpChildrenResponseType>({
        method: 'GET',
        path: '/core/app/mcpTools/getChildren',
        query: validatedQuery
      });

      return createSuccessResult({
        data,
        meta: { count: data.length }
      });
    },

    parse: async ({ client, url, headerSecret }) => {
      const trimmedUrl = trimIfString(url);
      if (!trimmedUrl) {
        throw new CliArgumentError(
          'MCP server URL is required.',
          undefined,
          'Pass <url> or --url.'
        );
      }
      const normalizedHeaders = normalizeHeaderSecretInput(headerSecret);
      const validatedBody = GetMcpToolsBodySchema.parse({
        url: trimmedUrl,
        ...(normalizedHeaders !== undefined ? { headerSecret: normalizedHeaders } : {})
      });

      const data = await client.request<GetMcpToolsResponseType>({
        method: 'POST',
        path: '/core/app/mcpTools/getTools',
        body: validatedBody
      });

      return createSuccessResult({
        data,
        meta: { count: data.length }
      });
    },

    create: async ({ client, input, dryRun }) => {
      const name = trimIfString(input.name);
      const url = trimIfString(input.url);
      if (!name) {
        throw new CliArgumentError('MCP toolset name is required.', undefined, 'Pass --name.');
      }
      if (!url) {
        throw new CliArgumentError('MCP server URL is required.', undefined, 'Pass --url.');
      }

      const normalizedHeaders = normalizeHeaderSecretInput(input.headerSecret);
      const autoParseTools = input.toolList === undefined;

      // 先校验基础创建参数；未传 toolList 时在 dry-run 阶段用空数组占位校验结构，实际执行时自动调 getTools 解析。
      // 未显式传 avatar 时补齐默认图标，避免旧版服务端 getChildren 校验 avatar: string 报错。
      const previewBody = CreateMcpToolsBodySchema.parse({
        name,
        url,
        avatar: input.avatar ?? 'core/app/type/mcpToolsFill',
        ...(input.intro !== undefined ? { intro: input.intro } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.inheritPermission !== undefined
          ? { inheritPermission: input.inheritPermission }
          : {}),
        ...(normalizedHeaders !== undefined ? { headerSecret: normalizedHeaders } : {}),
        toolList: autoParseTools ? [] : input.toolList
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'tool mcp create',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/app/mcpTools/create',
            autoParseTools,
            payload: {
              ...previewBody,
              ...(previewBody.headerSecret
                ? { headerSecret: redactHeaderSecretPreview(previewBody.headerSecret) }
                : {})
            }
          }
        });
      }

      const resolvedToolList = autoParseTools
        ? await client.request<GetMcpToolsResponseType>({
            method: 'POST',
            path: '/core/app/mcpTools/getTools',
            body: GetMcpToolsBodySchema.parse({
              url,
              ...(normalizedHeaders !== undefined ? { headerSecret: normalizedHeaders } : {})
            })
          })
        : previewBody.toolList;

      const finalBody = CreateMcpToolsBodySchema.parse({
        ...previewBody,
        toolList: resolvedToolList
      });

      const appId = await client.request<CreateAppResponseType>({
        method: 'POST',
        path: '/core/app/mcpTools/create',
        body: finalBody
      });

      return createChangedResult({
        data: {
          appId,
          name: finalBody.name,
          url: finalBody.url,
          toolCount: finalBody.toolList.length,
          ...(finalBody.parentId !== undefined ? { parentId: finalBody.parentId } : {})
        },
        message: `MCP toolset "${finalBody.name}" created (${appId}, ${finalBody.toolList.length} tools).`
      });
    },

    update: async ({ client, appId, metadata, config, dryRun }) => {
      const validatedQuery = UpdateAppQuerySchema.parse({
        appId: trimIfString(appId)
      });
      const metadataBody = parseAppMetadataUpdate(metadata);
      const normalizedHeaders = normalizeHeaderSecretInput(config.headerSecret);
      const hasConfigUpdate =
        config.url !== undefined ||
        normalizedHeaders !== undefined ||
        config.toolList !== undefined ||
        config.refresh === true;

      if (!metadataBody && !hasConfigUpdate) {
        throw new CliArgumentError(
          'At least one field to update is required.',
          undefined,
          'Pass --name/--intro/--avatar/--parent-id and/or --url/--header-secret/--tool-list/--refresh.'
        );
      }

      const validatedUrl =
        config.url !== undefined
          ? validateToolEndpointUrl(config.url, 'MCP server URL')
          : undefined;

      if (dryRun) {
        return createDryRunResult({
          operation: 'tool mcp update',
          risk: 'write',
          preview: {
            appId: validatedQuery.appId,
            ...(metadataBody
              ? {
                  metadataUpdate: {
                    method: 'PUT',
                    path: '/core/app/update',
                    query: validatedQuery,
                    payload: metadataBody
                  }
                }
              : {}),
            ...(hasConfigUpdate
              ? {
                  configUpdate: {
                    method: 'PUT',
                    path: '/core/app/mcpTools/update',
                    refreshTools: config.refresh === true,
                    payload: {
                      appId: validatedQuery.appId,
                      ...(validatedUrl !== undefined ? { url: validatedUrl } : {}),
                      ...(normalizedHeaders !== undefined
                        ? { headerSecret: redactHeaderSecretPreview(normalizedHeaders) }
                        : {}),
                      ...(Array.isArray(config.toolList)
                        ? { toolCount: config.toolList.length }
                        : {})
                    }
                  }
                }
              : {})
          }
        });
      }

      const detail = await fetchAndAssertAppType({
        client,
        appId: validatedQuery.appId,
        allowedTypes: [AppTypeEnum.mcpToolSet],
        resourceLabel: 'MCP toolset'
      });

      // 先完成配置校验、改址凭据隔离检查与（可选）工具探测，确保首次写库前无本地/契约错误。
      let validatedConfigBody: ReturnType<typeof UpdateMcpToolsBodySchema.parse> | undefined;
      if (hasConfigUpdate) {
        const existing = extractMcpToolSetConfig(detail);
        const targetUrl = validatedUrl ?? existing.url ?? '';
        if (!targetUrl) {
          throw new CliArgumentError(
            'Unable to resolve MCP server URL from existing toolset.',
            undefined,
            'Pass --url explicitly.'
          );
        }
        validateToolEndpointUrl(targetUrl, 'MCP server URL');

        if (
          validatedUrl !== undefined &&
          existing.url &&
          !isSameToolEndpoint(validatedUrl, existing.url) &&
          hasSavedCredentials(existing.headerSecret) &&
          normalizedHeaders === undefined
        ) {
          throw new CliArgumentError(
            `Refusing to forward saved headerSecret from "${existing.url}" to new MCP URL "${validatedUrl}".`,
            undefined,
            'Pass --header-secret explicitly for the new URL (or "{}" to clear saved headers).'
          );
        }

        const effectiveHeaderSecret =
          normalizedHeaders !== undefined
            ? normalizedHeaders
            : existing.headerSecret
              ? normalizeHeaderSecretInput(existing.headerSecret)
              : undefined;

        const targetToolList = await (async () => {
          if (config.refresh === true) {
            return client.request<GetMcpToolsResponseType>({
              method: 'POST',
              path: '/core/app/mcpTools/getTools',
              body: GetMcpToolsBodySchema.parse({
                url: targetUrl,
                ...(effectiveHeaderSecret !== undefined
                  ? { headerSecret: effectiveHeaderSecret }
                  : {})
              })
            });
          }
          if (config.toolList !== undefined) {
            return config.toolList;
          }
          return existing.toolList ?? [];
        })();

        validatedConfigBody = UpdateMcpToolsBodySchema.parse({
          appId: validatedQuery.appId,
          url: targetUrl,
          ...(effectiveHeaderSecret !== undefined ? { headerSecret: effectiveHeaderSecret } : {}),
          toolList: targetToolList
        });
      }

      if (metadataBody) {
        await client.request<UpdateAppResponseType>({
          method: 'PUT',
          path: '/core/app/update',
          query: validatedQuery,
          body: metadataBody
        });
      }

      let updatedUrl: string | undefined;
      let updatedToolCount: number | undefined;
      if (validatedConfigBody) {
        try {
          await client.request<UpdateMcpToolsResponseType>({
            method: 'PUT',
            path: '/core/app/mcpTools/update',
            body: validatedConfigBody
          });
        } catch (error) {
          if (metadataBody) {
            throw wrapPartialWriteError({
              error,
              operation: 'tool mcp update',
              appId: validatedQuery.appId,
              completedSteps: ['metadata'],
              failedStep: 'config',
              recoveryHint: `Metadata was updated for ${validatedQuery.appId}. Fix the MCP config and re-run: fastgpt tool mcp update ${validatedQuery.appId} ...`
            });
          }
          throw error;
        }

        updatedUrl = validatedConfigBody.url;
        updatedToolCount = validatedConfigBody.toolList.length;
      }

      return createChangedResult({
        data: {
          updated: true,
          appId: validatedQuery.appId,
          updatedMetadata: Boolean(metadataBody),
          updatedConfig: hasConfigUpdate,
          ...(metadataBody ?? {}),
          ...(updatedUrl !== undefined ? { url: updatedUrl } : {}),
          ...(updatedToolCount !== undefined ? { toolCount: updatedToolCount } : {})
        },
        message: `MCP toolset "${validatedQuery.appId}" updated.`
      });
    },

    run: async ({ client, input, dryRun }) => {
      const appId = trimIfString(input.appId);
      const explicitUrlRaw = trimIfString(input.url);
      const explicitUrl = explicitUrlRaw
        ? validateToolEndpointUrl(explicitUrlRaw, 'MCP server URL')
        : '';
      const toolName = trimIfString(input.toolName);
      const normalizedHeaders = normalizeHeaderSecretInput(input.headerSecret);

      if (!toolName) {
        throw new CliArgumentError('MCP tool name is required.', undefined, 'Pass --tool.');
      }
      if (!explicitUrl && !appId) {
        throw new CliArgumentError(
          'Either --id <appId> or --url <url> is required.',
          undefined,
          'Pass --id <mcpToolsetId> to reuse saved config, or --url <url>.'
        );
      }

      if (dryRun) {
        const previewPayload = {
          ...(appId ? { appId, resolveFromToolset: !explicitUrl } : {}),
          ...(explicitUrl ? { url: explicitUrl } : {}),
          toolName,
          params: input.params ?? {},
          ...(normalizedHeaders !== undefined
            ? { headerSecret: redactHeaderSecretPreview(normalizedHeaders) }
            : {})
        };
        return createDryRunResult({
          operation: 'tool mcp run',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/app/mcpTools/runTool',
            payload: previewPayload
          }
        });
      }

      const existingConfig = appId
        ? extractMcpToolSetConfig(
            await fetchAndAssertAppType({
              client,
              appId,
              allowedTypes: [AppTypeEnum.mcpToolSet],
              resourceLabel: 'MCP toolset'
            })
          )
        : undefined;

      const resolvedUrl = explicitUrl || existingConfig?.url || '';
      if (!resolvedUrl) {
        throw new CliArgumentError(
          'Unable to resolve MCP server URL from toolset.',
          undefined,
          'Pass --url explicitly.'
        );
      }
      validateToolEndpointUrl(resolvedUrl, 'MCP server URL');

      // 防止通过 --id 加载已保存凭据后被 --url 覆盖发送到未授权地址。
      if (
        appId &&
        explicitUrl &&
        existingConfig?.url &&
        !isSameToolEndpoint(explicitUrl, existingConfig.url) &&
        hasSavedCredentials(existingConfig.headerSecret) &&
        normalizedHeaders === undefined
      ) {
        throw new CliArgumentError(
          `Refusing to send saved headerSecret from MCP toolset "${appId}" to overridden URL "${explicitUrl}".`,
          undefined,
          'Omit --url to invoke the saved endpoint, or pass --header-secret explicitly for the new URL.'
        );
      }

      const resolvedHeaders =
        normalizedHeaders ??
        (existingConfig?.headerSecret
          ? normalizeHeaderSecretInput(existingConfig.headerSecret)
          : undefined);

      const validatedBody = RunMcpToolBodySchema.parse({
        url: resolvedUrl,
        toolName,
        params: input.params ?? {},
        ...(resolvedHeaders !== undefined ? { headerSecret: resolvedHeaders } : {})
      });

      const data = await client.request<RunMcpToolResponseType>({
        method: 'POST',
        path: '/core/app/mcpTools/runTool',
        body: validatedBody
      });

      const mcpErrorText = isPlainObject(data)
        ? getMCPToolErrorText(
            data as { isError?: boolean; content?: Array<{ type: string; text?: string }> }
          )
        : undefined;
      if (mcpErrorText) {
        throw new CliApiError({
          message: mcpErrorText,
          details: data
        });
      }

      return createChangedResult({
        data,
        message: `MCP tool "${validatedBody.toolName}" executed.`
      });
    },

    delete: ({ client, appId, dryRun }) =>
      deleteAppResource({
        client,
        appId,
        allowedTypes: [AppTypeEnum.mcpToolSet],
        resourceLabel: 'MCP toolset',
        capitalizedLabel: 'MCP toolset',
        idField: 'appId',
        operation: 'tool mcp delete',
        dryRun
      })
  };
}
