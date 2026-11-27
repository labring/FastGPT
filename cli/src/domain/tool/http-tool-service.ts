import z from 'zod';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import { HttpToolTypeEnum } from '@fastgpt/global/core/app/tool/httpTool/constants';
import {
  HttpToolConfigTypeSchema,
  type HttpToolConfigType
} from '@fastgpt/global/core/app/tool/httpTool/type';
import {
  UpdateAppQuerySchema,
  type CreateAppResponseType,
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
  deleteAppResource,
  fetchAndAssertAppType,
  listAppResources,
  parseAppMetadataUpdate,
  parseCreatedAppId
} from '../shared/app-resource';
import {
  assertCredentialTargetUnchanged,
  hasConfiguredHeaders,
  isAbsoluteHttpUrl,
  isSameToolEndpoint,
  isUrlWithinBasePrefix,
  normalizeHeaderSecretInput,
  parseHttpUrl,
  resolveHttpOutboundUrl,
  runToolWriteStep,
  sanitizeHttpToolListPreview,
  summarizeHeaders,
  validateRelativeToolPath
} from './tool-shared';

const HTTP_TOOL_APP_TYPES = [AppTypeEnum.httpToolSet, AppTypeEnum.httpPlugin] as const;
const PLACEHOLDER_OBJECT_ID = '000000000000000000000000';

// 详情读边界：兼容历史上缺失 description 的已保存 HTTP 子工具记录，避免未校验断言。
const SavedHttpToolItemReadSchema = HttpToolConfigTypeSchema.extend({
  description: z.string().optional().default('')
});

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
  const parsedToolList = Array.isArray(httpToolSet.toolList)
    ? httpToolSet.toolList.flatMap((item) => {
        const parsed = SavedHttpToolItemReadSchema.safeParse(item);
        return parsed.success ? [parsed.data] : [];
      })
    : undefined;
  return {
    baseUrl: typeof httpToolSet.baseUrl === 'string' ? httpToolSet.baseUrl : undefined,
    apiSchemaStr:
      typeof httpToolSet.apiSchemaStr === 'string' ? httpToolSet.apiSchemaStr : undefined,
    customHeaders:
      typeof httpToolSet.customHeaders === 'string' ? httpToolSet.customHeaders : undefined,
    headerSecret: isPlainObject(httpToolSet.headerSecret) ? httpToolSet.headerSecret : undefined,
    toolList: parsedToolList
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

function pickSingleToolMatch({
  candidates,
  explicitMethod,
  label,
  selector
}: {
  candidates: readonly HttpToolConfigType[];
  explicitMethod?: string;
  label: 'name' | 'path';
  selector: string;
}): HttpToolConfigType {
  const matched = explicitMethod
    ? candidates.filter((item) => item.method.toUpperCase() === explicitMethod)
    : candidates;

  if (matched.length === 1) {
    return matched[0];
  }
  if (matched.length === 0) {
    const available = candidates.map((t) => `${t.method.toUpperCase()} (${t.name})`).join(', ');
    throw new CliArgumentError(
      `No HTTP tool matching ${label} "${selector}" uses method "${explicitMethod}". Available: ${available}.`,
      undefined,
      'Pass a matching --method or specify the unique tool name in --tool-path.'
    );
  }
  const summary = matched.map((t) => `${t.method.toUpperCase()} (${t.name})`).join(', ');
  throw new CliArgumentError(
    `Multiple HTTP tools share ${label} "${selector}" (${summary}).`,
    undefined,
    explicitMethod
      ? 'Pass the unique tool name to --tool-path.'
      : 'Pass --method or specify the unique tool name in --tool-path.'
  );
}

/**
 * 在已保存的 HTTP 子工具列表中唯一定位目标子工具（先按工具名、再按路径精确匹配；有歧义或方法不匹配直接报错）。
 */
function resolveSavedHttpTool({
  toolList,
  selector,
  explicitMethod
}: {
  toolList?: readonly HttpToolConfigType[];
  selector: string;
  explicitMethod?: string;
}): HttpToolConfigType | undefined {
  if (!Array.isArray(toolList) || toolList.length === 0) {
    return undefined;
  }

  const byName = toolList.filter((item) => item.name === selector);
  if (byName.length > 0) {
    return pickSingleToolMatch({ candidates: byName, explicitMethod, label: 'name', selector });
  }

  const byPath = toolList.filter((item) => item.path === selector);
  if (byPath.length > 0) {
    return pickSingleToolMatch({ candidates: byPath, explicitMethod, label: 'path', selector });
  }

  return undefined;
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
    list: ({ client, input }) =>
      listAppResources({
        client,
        types: HTTP_TOOL_APP_TYPES,
        input
      }),

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
        config?.baseUrl !== undefined ? parseHttpUrl(config.baseUrl, 'HTTP target URL') : undefined;

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
                            headerSecret: summarizeHeaders(validatedConfigPreview.headerSecret)
                          }
                        : {}),
                      ...(validatedConfigPreview.customHeaders !== undefined
                        ? {
                            customHeaders: summarizeHeaders(validatedConfigPreview.customHeaders)
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

      const rawAppId = await client.request<CreateAppResponseType>({
        method: 'POST',
        path: '/core/app/httpTools/create',
        body: validatedCreateBody
      });
      const appId = parseCreatedAppId(rawAppId, 'HTTP toolset');

      if (validatedConfigPreview) {
        await runToolWriteStep({
          operation: 'tool http create',
          appId,
          resourceCmd: 'tool http',
          completedSteps: ['create'],
          step: 'configure',
          expectEmpty: true,
          run: () =>
            client.request<UpdateHttpToolsResponseType>({
              method: 'PUT',
              path: '/core/app/httpTools/update',
              body: {
                ...validatedConfigPreview,
                appId
              }
            })
        });
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
      const metadataBody = parseAppMetadataUpdate(metadata);
      const normalizedHeaders = normalizeHeaderSecretInput(config.headerSecret);
      const customHeaders = normalizeCustomHeadersString(config.customHeaders);
      const validatedBaseUrl =
        config.baseUrl !== undefined ? parseHttpUrl(config.baseUrl, 'HTTP target URL') : undefined;
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

      const validatedExplicitToolList =
        config.toolList !== undefined
          ? UpdateHttpToolsBodySchema.shape.toolList.parse(
              normalizeHttpToolListSecrets(config.toolList)
            )
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
                        ? { headerSecret: summarizeHeaders(normalizedHeaders) }
                        : {}),
                      ...(customHeaders !== undefined
                        ? { customHeaders: summarizeHeaders(customHeaders) }
                        : {}),
                      ...(validatedExplicitToolList !== undefined
                        ? {
                            toolCount: validatedExplicitToolList.length,
                            tools: sanitizeHttpToolListPreview(validatedExplicitToolList)
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

      // 先完成全部本地契约与改址凭据隔离校验（含集级与继承相对路径子工具），再执行首次写库。
      let mergedConfigBody: ReturnType<typeof UpdateHttpToolsBodySchema.parse> | undefined;
      if (hasConfigUpdate) {
        const existing = extractHttpToolSetConfig(detail);
        if (validatedBaseUrl !== undefined && existing.baseUrl) {
          assertCredentialTargetUnchanged({
            fromUrl: existing.baseUrl,
            toUrl: validatedBaseUrl,
            hasSavedCredentials:
              (hasConfiguredHeaders(existing.headerSecret) && normalizedHeaders === undefined) ||
              (hasConfiguredHeaders(existing.customHeaders) && customHeaders === undefined),
            hasOverride: false,
            message: `Refusing to forward saved HTTP headers/credentials from "${existing.baseUrl}" to new target URL "${validatedBaseUrl}".`,
            hint: 'Pass --header-secret / --custom-headers explicitly for the new target URL (or "{}" to clear).'
          });

          if (validatedExplicitToolList === undefined) {
            const affectedTools = (existing.toolList ?? [])
              .filter(
                (tool) =>
                  !isAbsoluteHttpUrl(tool.path) &&
                  hasConfiguredHeaders(tool.headerSecret, tool.staticHeaders)
              )
              .map((tool) => tool.name || tool.path);

            assertCredentialTargetUnchanged({
              fromUrl: existing.baseUrl,
              toUrl: validatedBaseUrl,
              hasSavedCredentials: affectedTools.length > 0,
              hasOverride: false,
              message: `Refusing to retain saved sub-tool headerSecret/staticHeaders for [${affectedTools.join(', ')}] after changing target URL to "${validatedBaseUrl}".`,
              hint: 'Pass --tool-list explicitly with updated or cleared sub-tool headerSecret/staticHeaders for the new target URL.'
            });
          }
        }

        mergedConfigBody = UpdateHttpToolsBodySchema.parse({
          appId: validatedQuery.appId,
          toolList:
            validatedExplicitToolList ?? normalizeHttpToolListSecrets(existing.toolList ?? []),
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
        await runToolWriteStep({
          operation: 'tool http update',
          appId: validatedQuery.appId,
          resourceCmd: 'tool http',
          step: 'metadata',
          expectEmpty: true,
          run: () =>
            client.request<UpdateAppResponseType>({
              method: 'PUT',
              path: '/core/app/update',
              query: validatedQuery,
              body: metadataBody
            })
        });
      }

      let updatedToolCount: number | undefined;
      if (mergedConfigBody) {
        await runToolWriteStep({
          operation: 'tool http update',
          appId: validatedQuery.appId,
          resourceCmd: 'tool http',
          completedSteps: metadataBody ? ['metadata'] : [],
          step: 'config',
          expectEmpty: true,
          run: () =>
            client.request<UpdateHttpToolsResponseType>({
              method: 'PUT',
              path: '/core/app/httpTools/update',
              body: mergedConfigBody
            })
        });
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
        ? parseHttpUrl(explicitBaseUrlRaw, 'HTTP target URL')
        : '';
      const rawToolSelector = trimIfString(input.toolPath);
      if (!rawToolSelector) {
        throw new CliArgumentError('HTTP tool path is required.', undefined, 'Pass --tool-path.');
      }

      const explicitMethod = input.method ? trimIfString(input.method).toUpperCase() : undefined;
      const normalizedHeaders = normalizeHeaderSecretInput(input.headerSecret);

      if (!appId) {
        if (explicitBaseUrl) {
          validateRelativeToolPath(rawToolSelector);
        } else if (isAbsoluteHttpUrl(rawToolSelector)) {
          parseHttpUrl(rawToolSelector, 'HTTP tool URL');
        } else {
          throw new CliArgumentError(
            'Either --id <appId> or --target-url <url> is required.',
            undefined,
            'Pass --id <httpToolsetId> to reuse saved config, or --target-url <url>.'
          );
        }
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
              toolPath: rawToolSelector,
              method: explicitMethod ?? (appId ? '<resolvedFromTool>' : 'POST'),
              params: input.params ?? {},
              ...(input.apiSchemaStr !== undefined
                ? { apiSchemaStrLength: input.apiSchemaStr.length }
                : {}),
              ...(input.customHeaders !== undefined
                ? { customHeaders: summarizeHeaders(input.customHeaders) }
                : {}),
              ...(normalizedHeaders !== undefined
                ? { headerSecret: summarizeHeaders(normalizedHeaders) }
                : {}),
              ...(input.staticHeaders !== undefined
                ? { staticHeaders: summarizeHeaders(input.staticHeaders) }
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

      const matchedTool = resolveSavedHttpTool({
        toolList: existingConfig?.toolList,
        selector: rawToolSelector,
        explicitMethod
      });
      const resolvedMethod = explicitMethod ?? matchedTool?.method.toUpperCase() ?? 'POST';
      const savedBaseUrl = existingConfig?.baseUrl?.trim() ?? '';
      const candidatePath = matchedTool ? matchedTool.path.trim() : rawToolSelector;
      const savedHeaderSecret = matchedTool?.headerSecret ?? existingConfig?.headerSecret;
      const savedStaticHeaders = matchedTool?.staticHeaders;

      // 1. 先按服务端请求语义解析最终出站目标（兼容手动完整 URL 子工具及换基址覆盖）。
      const { resolvedBaseUrl, resolvedToolPath } = (() => {
        if (!explicitBaseUrl && isAbsoluteHttpUrl(candidatePath)) {
          return {
            resolvedBaseUrl: '',
            resolvedToolPath: parseHttpUrl(candidatePath, 'HTTP tool URL')
          };
        }
        const base =
          explicitBaseUrl ||
          (savedBaseUrl
            ? parseHttpUrl(savedBaseUrl, 'HTTP target URL', { allowSchemeLess: true })
            : '');
        if (!base) {
          throw new CliArgumentError(
            'Unable to resolve HTTP target URL from toolset.',
            undefined,
            'Pass --target-url explicitly.'
          );
        }
        const relativePath =
          explicitBaseUrl && matchedTool && isAbsoluteHttpUrl(candidatePath)
            ? (() => {
                const parsed = new URL(parseHttpUrl(candidatePath, 'HTTP tool URL'));
                return `${parsed.pathname}${parsed.search}`;
              })()
            : candidatePath;
        return {
          resolvedBaseUrl: base,
          resolvedToolPath: validateRelativeToolPath(relativePath)
        };
      })();

      // 2. 基于最终出站 URL 统一校验已保存凭据授权，防止通过绝对 URL、换基址或越界路径泄漏请求头。
      if (appId) {
        const hasUnoverriddenCreds =
          (hasConfiguredHeaders(savedHeaderSecret) && normalizedHeaders === undefined) ||
          (hasConfiguredHeaders(existingConfig?.customHeaders) &&
            input.customHeaders === undefined) ||
          (hasConfiguredHeaders(savedStaticHeaders) && input.staticHeaders === undefined);

        if (hasUnoverriddenCreds) {
          const actualOutboundUrl = resolveHttpOutboundUrl(resolvedBaseUrl, resolvedToolPath);
          const authorized = matchedTool
            ? isSameToolEndpoint(
                actualOutboundUrl,
                resolveHttpOutboundUrl(savedBaseUrl, matchedTool.path)
              )
            : Boolean(savedBaseUrl && isUrlWithinBasePrefix(actualOutboundUrl, savedBaseUrl));

          if (!authorized) {
            throw new CliArgumentError(
              `Refusing to send saved credentials/headers from HTTP toolset "${appId}" to unauthorized target URL "${actualOutboundUrl}".`,
              undefined,
              'Omit --target-url to invoke the saved endpoint, or pass credentials/headers explicitly for the new URL.'
            );
          }
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
          details: isPlainObject(data) ? data : { rawResponse: data }
        });
      }

      return createChangedResult({
        data,
        message: `HTTP tool "${validatedBody.method} ${validatedBody.toolPath}" executed.`
      });
    },

    delete: ({ client, appId, dryRun }) =>
      deleteAppResource({
        client,
        appId,
        allowedTypes: HTTP_TOOL_APP_TYPES,
        resourceLabel: 'HTTP toolset',
        capitalizedLabel: 'HTTP toolset',
        idField: 'appId',
        operation: 'tool http delete',
        dryRun
      })
  };
}
