import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { HttpToolTypeEnum } from '@fastgpt/global/core/app/tool/httpTool/constants';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/tool/httpTool/type';
import {
  DeleteAppQuerySchema,
  ListAppV2BodySchema,
  UpdateAppQuerySchema,
  type CreateAppResponseType,
  type DeleteAppResponseType,
  type GetAppDetailResponseType,
  type ListAppV2ResponseType,
  type UpdateAppResponseType
} from '@fastgpt/global/openapi/core/app/common/api';
import {
  CreateHttpToolsBodySchema,
  GetApiSchemaByUrlBodySchema,
  RunHttpToolBodySchema,
  UpdateHttpToolsBodySchema,
  type GetApiSchemaByUrlResponseType,
  type RunHttpToolResponseType,
  type UpdateHttpToolsResponseType
} from '@fastgpt/global/openapi/core/app/httpTools/api';
import {
  ListToolSetV2BodySchema,
  type ListToolSetV2ResponseType
} from '@fastgpt/global/openapi/core/app/toolSet/api';
import type { FastGptHttpClient } from '../../infra/http/fastgpt-http-client';
import { CliApiError, CliArgumentError } from '../../shared/errors';
import { buildPaginationMeta, isPlainObject, trimIfString } from '../../shared/input';
import { createChangedResult, createDryRunResult, createSuccessResult } from '../../shared/result';
import type { CliResult } from '../../shared/types';
import {
  fetchAndAssertAppType,
  hasSavedCredentials,
  isSameToolEndpoint,
  normalizeHeaderSecretInput,
  parseToolMetadataUpdate,
  redactCustomHeadersPreview,
  redactHeaderSecretPreview,
  redactStaticHeadersPreview,
  sanitizeHttpToolListPreview,
  validateHttpToolPath,
  validateToolEndpointUrl,
  wrapPartialWriteError
} from './tool-shared';

const HTTP_TOOL_APP_TYPES = [AppTypeEnum.httpToolSet, AppTypeEnum.httpPlugin] as const;
const PLACEHOLDER_OBJECT_ID = '000000000000000000000000';

type ExtractedHttpConfig = {
  baseUrl?: string;
  apiSchemaStr?: string;
  customHeaders?: string;
  headerSecret?: Record<string, unknown>;
  toolList?: HttpToolConfigType[];
};

function extractHttpToolSetConfig(detail: GetAppDetailResponseType): ExtractedHttpConfig {
  const rootNode = Array.isArray(detail.nodes) ? detail.nodes[0] : undefined;
  const httpToolSet = isPlainObject(rootNode?.toolConfig)
    ? (rootNode.toolConfig as Record<string, unknown>).httpToolSet
    : undefined;
  if (!isPlainObject(httpToolSet)) {
    return {};
  }
  return {
    baseUrl: typeof httpToolSet.baseUrl === 'string' ? httpToolSet.baseUrl : undefined,
    apiSchemaStr:
      typeof httpToolSet.apiSchemaStr === 'string' ? httpToolSet.apiSchemaStr : undefined,
    customHeaders:
      typeof httpToolSet.customHeaders === 'string' ? httpToolSet.customHeaders : undefined,
    headerSecret: isPlainObject(httpToolSet.headerSecret) ? httpToolSet.headerSecret : undefined,
    toolList: Array.isArray(httpToolSet.toolList)
      ? (httpToolSet.toolList as HttpToolConfigType[])
      : undefined
  };
}

function normalizeCustomHeadersString(raw: unknown): string | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw === 'string') return raw;
  if (isPlainObject(raw)) return JSON.stringify(raw);
  throw new CliArgumentError('customHeaders must be a JSON string or plain object.');
}

function normalizeHttpToolListSecrets(toolList: unknown): unknown {
  if (!Array.isArray(toolList)) return toolList;
  return toolList.map((item) => {
    if (!isPlainObject(item) || item.headerSecret === undefined || item.headerSecret === null) {
      return item;
    }
    return {
      ...item,
      headerSecret: normalizeHeaderSecretInput(item.headerSecret)
    };
  });
}

export type HttpToolConfigPatch = {
  baseUrl?: string;
  apiSchemaStr?: string;
  toolList?: unknown;
  headerSecret?: unknown;
  customHeaders?: unknown;
};

export type HttpToolService = {
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
  }) => Promise<CliResult<GetAppDetailResponseType & { httpConfig: ExtractedHttpConfig }>>;
  listChildren: (params: {
    client: FastGptHttpClient;
    input: {
      appId: string;
      searchKey?: string;
      page?: number;
      pageSize?: number;
    };
  }) => Promise<CliResult<ListToolSetV2ResponseType>>;
  parse: (params: {
    client: FastGptHttpClient;
    url: string;
  }) => Promise<CliResult<GetApiSchemaByUrlResponseType>>;
  create: (params: {
    client: FastGptHttpClient;
    input: {
      name: string;
      createType?: string;
      intro?: string;
      avatar?: string;
      parentId?: string | null;
      inheritPermission?: boolean;
    };
    config?: HttpToolConfigPatch;
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
    config: HttpToolConfigPatch;
    dryRun?: boolean;
  }) => Promise<CliResult>;
  run: (params: {
    client: FastGptHttpClient;
    input: {
      appId?: string;
      baseUrl?: string;
      toolPath: string;
      method?: string;
      params?: Record<string, unknown>;
      apiSchemaStr?: string;
      customHeaders?: Record<string, string | number | boolean>;
      headerSecret?: unknown;
      staticParams?: unknown;
      staticHeaders?: unknown;
      staticBody?: unknown;
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
 * FastGPT HTTP 工具集领域服务：封装列表、详情、子工具、OpenAPI 解析、创建、更新、在线调用与删除。
 */
export function createHttpToolService(): HttpToolService {
  return {
    list: async ({ client, input }) => {
      const validatedBody = ListAppV2BodySchema.parse({
        type: [...HTTP_TOOL_APP_TYPES],
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

    getDetail: async ({ client, appId }) => {
      const detail = await fetchAndAssertAppType({
        client,
        appId,
        allowedTypes: HTTP_TOOL_APP_TYPES,
        resourceLabel: 'HTTP toolset'
      });
      const httpConfig = extractHttpToolSetConfig(detail);

      return createSuccessResult({
        data: {
          ...detail,
          httpConfig
        }
      });
    },

    listChildren: async ({ client, input }) => {
      const validatedBody = ListToolSetV2BodySchema.parse({
        parentId: trimIfString(input.appId),
        ...(input.searchKey !== undefined ? { searchKey: input.searchKey } : {}),
        ...(input.page !== undefined ? { pageNum: input.page } : {}),
        ...(input.pageSize !== undefined ? { pageSize: input.pageSize } : {})
      });

      const data = await client.request<ListToolSetV2ResponseType>({
        method: 'POST',
        path: '/core/app/toolSet/listV2',
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

    parse: async ({ client, url }) => {
      const trimmedUrl = trimIfString(url);
      if (!trimmedUrl) {
        throw new CliArgumentError('OpenAPI schema URL is required.', undefined, 'Pass <url>.');
      }

      const validatedBody = GetApiSchemaByUrlBodySchema.parse({ url: trimmedUrl });
      const data = await client.request<GetApiSchemaByUrlResponseType>({
        method: 'POST',
        path: '/core/app/httpTools/getApiSchemaByUrl',
        body: validatedBody
      });

      return createSuccessResult({ data });
    },

    create: async ({ client, input, config, dryRun }) => {
      const name = trimIfString(input.name);
      if (!name) {
        throw new CliArgumentError('HTTP toolset name is required.', undefined, 'Pass --name.');
      }

      const createType =
        input.createType ??
        (config?.apiSchemaStr !== undefined ? HttpToolTypeEnum.batch : HttpToolTypeEnum.manual);

      const validatedCreateBody = CreateHttpToolsBodySchema.parse({
        name,
        createType,
        ...(input.intro !== undefined ? { intro: input.intro } : {}),
        ...(input.avatar !== undefined ? { avatar: input.avatar } : {}),
        ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
        ...(input.inheritPermission !== undefined
          ? { inheritPermission: input.inheritPermission }
          : {})
      });

      const normalizedHeaders = normalizeHeaderSecretInput(config?.headerSecret);
      const customHeaders = normalizeCustomHeadersString(config?.customHeaders);
      const hasConfig =
        config !== undefined &&
        (config.baseUrl !== undefined ||
          config.apiSchemaStr !== undefined ||
          config.toolList !== undefined ||
          normalizedHeaders !== undefined ||
          customHeaders !== undefined);

      const validatedBaseUrl =
        config?.baseUrl !== undefined
          ? validateToolEndpointUrl(config.baseUrl, 'HTTP target URL')
          : undefined;

      const validatedConfigPreview = hasConfig
        ? UpdateHttpToolsBodySchema.parse({
            appId: PLACEHOLDER_OBJECT_ID,
            toolList: normalizeHttpToolListSecrets(config?.toolList ?? []),
            ...(validatedBaseUrl !== undefined ? { baseUrl: validatedBaseUrl } : {}),
            ...(config?.apiSchemaStr !== undefined ? { apiSchemaStr: config.apiSchemaStr } : {}),
            ...(normalizedHeaders !== undefined ? { headerSecret: normalizedHeaders } : {}),
            ...(customHeaders !== undefined ? { customHeaders } : {})
          })
        : undefined;

      if (dryRun) {
        return createDryRunResult({
          operation: 'tool http create',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/app/httpTools/create',
            payload: validatedCreateBody,
            ...(validatedConfigPreview
              ? {
                  followUpUpdate: {
                    method: 'PUT',
                    path: '/core/app/httpTools/update',
                    payload: {
                      appId: '<createdAppId>',
                      ...(validatedConfigPreview.baseUrl !== undefined
                        ? { baseUrl: validatedConfigPreview.baseUrl }
                        : {}),
                      ...(validatedConfigPreview.apiSchemaStr !== undefined
                        ? { apiSchemaStrLength: validatedConfigPreview.apiSchemaStr.length }
                        : {}),
                      ...(validatedConfigPreview.headerSecret !== undefined
                        ? {
                            headerSecret: redactHeaderSecretPreview(
                              validatedConfigPreview.headerSecret
                            )
                          }
                        : {}),
                      ...(validatedConfigPreview.customHeaders !== undefined
                        ? {
                            customHeaders: redactCustomHeadersPreview(
                              validatedConfigPreview.customHeaders
                            )
                          }
                        : {}),
                      toolCount: validatedConfigPreview.toolList.length,
                      tools: sanitizeHttpToolListPreview(validatedConfigPreview.toolList)
                    }
                  }
                }
              : {})
          }
        });
      }

      const appId = await client.request<CreateAppResponseType>({
        method: 'POST',
        path: '/core/app/httpTools/create',
        body: validatedCreateBody
      });

      if (validatedConfigPreview) {
        try {
          await client.request<UpdateHttpToolsResponseType>({
            method: 'PUT',
            path: '/core/app/httpTools/update',
            body: {
              ...validatedConfigPreview,
              appId
            }
          });
        } catch (error) {
          throw wrapPartialWriteError({
            error,
            operation: 'tool http create',
            appId,
            completedSteps: ['create'],
            failedStep: 'configure',
            recoveryHint: `HTTP toolset was created (${appId}) without config. Resume by running: fastgpt tool http update ${appId} ...`
          });
        }
      }

      return createChangedResult({
        data: {
          appId,
          name: validatedCreateBody.name,
          createType: validatedCreateBody.createType,
          configured: Boolean(validatedConfigPreview),
          ...(validatedConfigPreview ? { toolCount: validatedConfigPreview.toolList.length } : {}),
          ...(validatedCreateBody.parentId !== undefined
            ? { parentId: validatedCreateBody.parentId }
            : {})
        },
        message: `HTTP toolset "${validatedCreateBody.name}" created (${appId}).`
      });
    },

    update: async ({ client, appId, metadata, config, dryRun }) => {
      const validatedQuery = UpdateAppQuerySchema.parse({
        appId: trimIfString(appId)
      });
      const metadataBody = parseToolMetadataUpdate(metadata);
      const normalizedHeaders = normalizeHeaderSecretInput(config.headerSecret);
      const customHeaders = normalizeCustomHeadersString(config.customHeaders);
      const validatedBaseUrl =
        config.baseUrl !== undefined
          ? validateToolEndpointUrl(config.baseUrl, 'HTTP target URL')
          : undefined;
      const hasConfigUpdate =
        validatedBaseUrl !== undefined ||
        config.apiSchemaStr !== undefined ||
        config.toolList !== undefined ||
        normalizedHeaders !== undefined ||
        customHeaders !== undefined;

      if (!metadataBody && !hasConfigUpdate) {
        throw new CliArgumentError(
          'At least one field to update is required.',
          undefined,
          'Pass --name/--intro/--avatar/--parent-id and/or --target-url/--api-schema/--tool-list/--header-secret/--custom-headers.'
        );
      }

      const previewToolList = Array.isArray(config.toolList)
        ? (normalizeHttpToolListSecrets(config.toolList) as HttpToolConfigType[])
        : undefined;

      if (dryRun) {
        return createDryRunResult({
          operation: 'tool http update',
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
                    path: '/core/app/httpTools/update',
                    payload: {
                      appId: validatedQuery.appId,
                      ...(validatedBaseUrl !== undefined ? { baseUrl: validatedBaseUrl } : {}),
                      ...(config.apiSchemaStr !== undefined
                        ? { apiSchemaStrLength: config.apiSchemaStr.length }
                        : {}),
                      ...(normalizedHeaders !== undefined
                        ? { headerSecret: redactHeaderSecretPreview(normalizedHeaders) }
                        : {}),
                      ...(customHeaders !== undefined
                        ? { customHeaders: redactCustomHeadersPreview(customHeaders) }
                        : {}),
                      ...(previewToolList !== undefined
                        ? {
                            toolCount: previewToolList.length,
                            tools: sanitizeHttpToolListPreview(previewToolList)
                          }
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
        allowedTypes: HTTP_TOOL_APP_TYPES,
        resourceLabel: 'HTTP toolset'
      });

      // 先完成全部本地契约与改址凭据校验，再执行首次写库。
      let mergedConfigBody: ReturnType<typeof UpdateHttpToolsBodySchema.parse> | undefined;
      if (hasConfigUpdate) {
        const existing = extractHttpToolSetConfig(detail);
        if (
          validatedBaseUrl !== undefined &&
          existing.baseUrl &&
          !isSameToolEndpoint(validatedBaseUrl, existing.baseUrl)
        ) {
          const reusingSavedHeaderSecret =
            hasSavedCredentials(existing.headerSecret) && normalizedHeaders === undefined;
          const reusingSavedCustomHeaders =
            hasSavedCredentials(existing.customHeaders) && customHeaders === undefined;
          if (reusingSavedHeaderSecret || reusingSavedCustomHeaders) {
            throw new CliArgumentError(
              `Refusing to forward saved HTTP headers/credentials from "${existing.baseUrl}" to new target URL "${validatedBaseUrl}".`,
              undefined,
              'Pass --header-secret / --custom-headers explicitly for the new target URL (or "{}" to clear).'
            );
          }
        }

        mergedConfigBody = UpdateHttpToolsBodySchema.parse({
          appId: validatedQuery.appId,
          toolList: normalizeHttpToolListSecrets(config.toolList ?? existing.toolList ?? []),
          ...(validatedBaseUrl !== undefined
            ? { baseUrl: validatedBaseUrl }
            : existing.baseUrl !== undefined
              ? { baseUrl: existing.baseUrl }
              : {}),
          ...(config.apiSchemaStr !== undefined
            ? { apiSchemaStr: config.apiSchemaStr }
            : existing.apiSchemaStr !== undefined
              ? { apiSchemaStr: existing.apiSchemaStr }
              : {}),
          ...(normalizedHeaders !== undefined
            ? { headerSecret: normalizedHeaders }
            : existing.headerSecret
              ? { headerSecret: normalizeHeaderSecretInput(existing.headerSecret) }
              : {}),
          ...(customHeaders !== undefined
            ? { customHeaders }
            : existing.customHeaders !== undefined
              ? { customHeaders: existing.customHeaders }
              : {})
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

      let updatedToolCount: number | undefined;
      if (mergedConfigBody) {
        try {
          await client.request<UpdateHttpToolsResponseType>({
            method: 'PUT',
            path: '/core/app/httpTools/update',
            body: mergedConfigBody
          });
        } catch (error) {
          if (metadataBody) {
            throw wrapPartialWriteError({
              error,
              operation: 'tool http update',
              appId: validatedQuery.appId,
              completedSteps: ['metadata'],
              failedStep: 'config',
              recoveryHint: `Metadata was updated for ${validatedQuery.appId}. Fix the HTTP config and re-run: fastgpt tool http update ${validatedQuery.appId} ...`
            });
          }
          throw error;
        }
        updatedToolCount = mergedConfigBody.toolList.length;
      }

      return createChangedResult({
        data: {
          updated: true,
          appId: validatedQuery.appId,
          updatedMetadata: Boolean(metadataBody),
          updatedConfig: hasConfigUpdate,
          ...(metadataBody ?? {}),
          ...(updatedToolCount !== undefined ? { toolCount: updatedToolCount } : {})
        },
        message: `HTTP toolset "${validatedQuery.appId}" updated.`
      });
    },

    run: async ({ client, input, dryRun }) => {
      const appId = trimIfString(input.appId);
      const explicitBaseUrlRaw = trimIfString(input.baseUrl);
      const explicitBaseUrl = explicitBaseUrlRaw
        ? validateToolEndpointUrl(explicitBaseUrlRaw, 'HTTP target URL')
        : '';
      const rawToolPath = validateHttpToolPath(input.toolPath);
      const explicitMethod = input.method ? trimIfString(input.method).toUpperCase() : undefined;
      const normalizedHeaders = normalizeHeaderSecretInput(input.headerSecret);

      if (!explicitBaseUrl && !appId) {
        throw new CliArgumentError(
          'Either --id <appId> or --target-url <url> is required.',
          undefined,
          'Pass --id <httpToolsetId> to reuse saved config, or --target-url <url>.'
        );
      }

      if (dryRun) {
        return createDryRunResult({
          operation: 'tool http run',
          risk: 'write',
          preview: {
            method: 'POST',
            path: '/core/app/httpTools/runTool',
            payload: {
              ...(appId ? { appId, resolveFromToolset: !explicitBaseUrl } : {}),
              ...(explicitBaseUrl ? { baseUrl: explicitBaseUrl } : {}),
              toolPath: rawToolPath,
              method: explicitMethod ?? (appId ? '<resolvedFromTool>' : 'POST'),
              params: input.params ?? {},
              ...(input.apiSchemaStr !== undefined
                ? { apiSchemaStrLength: input.apiSchemaStr.length }
                : {}),
              ...(input.customHeaders !== undefined
                ? { customHeaders: redactCustomHeadersPreview(input.customHeaders) }
                : {}),
              ...(normalizedHeaders !== undefined
                ? { headerSecret: redactHeaderSecretPreview(normalizedHeaders) }
                : {}),
              ...(input.staticHeaders !== undefined
                ? { staticHeaders: redactStaticHeadersPreview(input.staticHeaders) }
                : {})
            }
          }
        });
      }

      const existingConfig = appId
        ? extractHttpToolSetConfig(
            await fetchAndAssertAppType({
              client,
              appId,
              allowedTypes: HTTP_TOOL_APP_TYPES,
              resourceLabel: 'HTTP toolset'
            })
          )
        : undefined;

      // 按 --id 试调用时优先匹配已保存的子工具配置（继承 method / 子工具凭据 / staticParams / staticHeaders / staticBody）。
      const matchedTool = (() => {
        const list = existingConfig?.toolList;
        if (!Array.isArray(list) || list.length === 0) return undefined;
        const byPath = list.filter((item) => item.path === rawToolPath);
        if (byPath.length > 0) {
          if (explicitMethod) {
            return (
              byPath.find((item) => item.method?.toUpperCase() === explicitMethod) ?? byPath[0]
            );
          }
          return byPath[0];
        }
        return list.find((item) => item.name === rawToolPath);
      })();

      const resolvedToolPath = validateHttpToolPath(matchedTool?.path ?? rawToolPath);
      const resolvedMethod = explicitMethod ?? matchedTool?.method?.toUpperCase() ?? 'POST';
      const resolvedBaseUrl = explicitBaseUrl || existingConfig?.baseUrl || '';
      if (!resolvedBaseUrl) {
        throw new CliArgumentError(
          'Unable to resolve HTTP target URL from toolset.',
          undefined,
          'Pass --target-url explicitly.'
        );
      }
      validateToolEndpointUrl(resolvedBaseUrl, 'HTTP target URL');

      const savedHeaderSecret = matchedTool?.headerSecret ?? existingConfig?.headerSecret;
      const savedStaticHeaders = matchedTool?.staticHeaders;

      // 防止通过 --id 加载已保存工具集/子工具凭据后被 --target-url 覆盖发送到未授权地址。
      if (
        appId &&
        explicitBaseUrl &&
        existingConfig?.baseUrl &&
        !isSameToolEndpoint(explicitBaseUrl, existingConfig.baseUrl)
      ) {
        const wouldLeakHeaderSecret =
          hasSavedCredentials(savedHeaderSecret) && normalizedHeaders === undefined;
        const wouldLeakCustomHeaders =
          hasSavedCredentials(existingConfig.customHeaders) && input.customHeaders === undefined;
        const wouldLeakStaticHeaders =
          Array.isArray(savedStaticHeaders) &&
          savedStaticHeaders.length > 0 &&
          input.staticHeaders === undefined;
        if (wouldLeakHeaderSecret || wouldLeakCustomHeaders || wouldLeakStaticHeaders) {
          throw new CliArgumentError(
            `Refusing to send saved credentials/headers from HTTP toolset "${appId}" to overridden target URL "${explicitBaseUrl}".`,
            undefined,
            'Omit --target-url to invoke the saved endpoint, or pass credentials/headers explicitly for the new URL.'
          );
        }
      }

      const resolvedCustomHeaders = (() => {
        if (input.customHeaders !== undefined) return input.customHeaders;
        if (!existingConfig?.customHeaders) return undefined;
        try {
          const parsed = JSON.parse(existingConfig.customHeaders);
          return isPlainObject(parsed)
            ? (parsed as Record<string, string | number | boolean>)
            : undefined;
        } catch {
          return undefined;
        }
      })();

      const resolvedHeaders =
        normalizedHeaders ??
        (savedHeaderSecret ? normalizeHeaderSecretInput(savedHeaderSecret) : undefined);

      const resolvedStaticParams = input.staticParams ?? matchedTool?.staticParams;
      const resolvedStaticHeaders = input.staticHeaders ?? savedStaticHeaders;
      const resolvedStaticBody = input.staticBody ?? matchedTool?.staticBody;

      const validatedBody = RunHttpToolBodySchema.parse({
        baseUrl: resolvedBaseUrl,
        toolPath: resolvedToolPath,
        method: resolvedMethod,
        params: input.params ?? {},
        ...(input.apiSchemaStr !== undefined
          ? { apiSchemaStr: input.apiSchemaStr }
          : existingConfig?.apiSchemaStr !== undefined
            ? { apiSchemaStr: existingConfig.apiSchemaStr }
            : {}),
        ...(resolvedCustomHeaders !== undefined ? { customHeaders: resolvedCustomHeaders } : {}),
        ...(resolvedHeaders !== undefined ? { headerSecret: resolvedHeaders } : {}),
        ...(resolvedStaticParams !== undefined ? { staticParams: resolvedStaticParams } : {}),
        ...(resolvedStaticHeaders !== undefined ? { staticHeaders: resolvedStaticHeaders } : {}),
        ...(resolvedStaticBody !== undefined ? { staticBody: resolvedStaticBody } : {})
      });

      const data = await client.request<RunHttpToolResponseType>({
        method: 'POST',
        path: '/core/app/httpTools/runTool',
        body: validatedBody
      });

      if (typeof data?.errorMsg === 'string' && data.errorMsg.trim().length > 0) {
        throw new CliApiError({
          message: data.errorMsg.trim(),
          details: data
        });
      }

      return createChangedResult({
        data,
        message: `HTTP tool "${validatedBody.method} ${validatedBody.toolPath}" executed.`
      });
    },

    delete: async ({ client, appId, dryRun }) => {
      const validatedQuery = DeleteAppQuerySchema.parse({
        appId: trimIfString(appId)
      });

      if (dryRun) {
        return createDryRunResult({
          operation: 'tool http delete',
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
        allowedTypes: HTTP_TOOL_APP_TYPES,
        resourceLabel: 'HTTP toolset'
      });

      const deletedAppIds = await client.request<DeleteAppResponseType>({
        method: 'DELETE',
        path: '/core/app/del',
        query: validatedQuery
      });

      return createChangedResult({
        data: {
          deleted: true,
          appId: validatedQuery.appId,
          deletedAppIds
        },
        message: `HTTP toolset "${validatedQuery.appId}" deleted.`
      });
    }
  };
}
