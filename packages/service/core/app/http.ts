import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { getSecretValue } from '../../common/secret/utils';
import { axios } from '../../common/api/axios';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import { AppTypeEnum } from '@fastgpt/global/core/app/constants';
import {
  HttpToolConfigTypeSchema,
  type HttpToolConfigType
} from '@fastgpt/global/core/app/tool/httpTool/type';
import { contentTypeMap, ContentTypes } from '@fastgpt/global/core/workflow/constants';
import { isInternalAddress, PRIVATE_URL_TEXT } from '../../common/system/utils';
import type { AppSchemaType } from '@fastgpt/global/core/app/type';
import { AppToolSourceEnum } from '@fastgpt/global/core/app/tool/constants';
import { replaceEditorVariable } from '../workflow/dispatch/utils/replaceEditorVariable';
import FormData from 'form-data';
import { getLogger, LogCategories } from '../../common/logger';
import { decodeHttpToolSetNodesFromStorage } from './jsonSchemaStorage';
import { buildOpenAPIHttpRequest } from './httpTool/request';
import { str2OpenApiSchema } from '@fastgpt/global/core/app/jsonschema';
import { completeOpenAPIRequestSchema } from '@fastgpt/global/core/app/tool/httpTool/utils';

const logger = getLogger(LogCategories.MODULE.APP.HTTP_TOOLS);

export type RunHTTPToolParams = {
  baseUrl: string;
  toolPath: string;
  method: string;
  params: Record<string, any>;
  apiSchemaStr?: string;
  headerSecret?: StoreSecretValueType | null;
  customHeaders?: Record<string, string>;
  staticParams?: HttpToolConfigType['staticParams'];
  staticHeaders?: HttpToolConfigType['staticHeaders'];
  staticBody?: HttpToolConfigType['staticBody'];
};

export type RunHTTPToolResult = RequireOnlyOne<{
  data?: any;
  errorMsg?: string;
}>;

/** 按手动工具模板构造请求；缺失模板仍保持原有空 Body 行为，不自动透传 params。 */
const buildHttpRequest = ({
  method,
  params,
  headerSecret,
  customHeaders,
  staticParams,
  staticHeaders,
  staticBody
}: Omit<RunHTTPToolParams, 'baseUrl' | 'toolPath'>) => {
  const replaceVariables = (text: string) => {
    return replaceEditorVariable({
      text,
      nodesMap: new Map(),
      variables: params
    });
  };

  const body = (() => {
    if (!staticBody || staticBody.type === ContentTypes.none) {
      return ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) ? {} : undefined;
    }

    if (staticBody.type === ContentTypes.json) {
      const contentWithReplacedVars = staticBody.content
        ? replaceVariables(staticBody.content)
        : '{}';
      const staticContent = JSON.parse(contentWithReplacedVars);
      return { ...staticContent };
    }

    if (staticBody.type === ContentTypes.formData) {
      const formData = new FormData();
      staticBody.formData?.forEach(({ key, value }) => {
        const replacedKey = replaceVariables(key);
        const replacedValue = replaceVariables(value);
        formData.append(replacedKey, replacedValue);
      });
      return formData;
    }

    if (staticBody.type === ContentTypes.xWwwFormUrlencoded) {
      const urlencoded = new URLSearchParams();
      staticBody.formData?.forEach(({ key, value }) => {
        const replacedKey = replaceVariables(key);
        const replacedValue = replaceVariables(value);
        urlencoded.append(replacedKey, replacedValue);
      });
      return urlencoded.toString();
    }

    if (staticBody.type === ContentTypes.xml || staticBody.type === ContentTypes.raw) {
      return replaceVariables(staticBody.content || '');
    }

    return undefined;
  })();

  const contentType = contentTypeMap[staticBody?.type || ContentTypes.none];
  const headers = {
    ...(contentType && { 'Content-Type': contentType }),
    ...(customHeaders || {}),
    ...(headerSecret ? getSecretValue({ storeSecret: headerSecret }) : {}),
    ...(staticHeaders?.reduce(
      (acc, { key, value }) => {
        const replacedKey = replaceVariables(key);
        const replacedValue = replaceVariables(value);
        acc[replacedKey] = replacedValue;
        return acc;
      },
      {} as Record<string, string>
    ) || {})
  };

  const queryParams = (() => {
    const staticParamsObj =
      staticParams?.reduce(
        (acc, { key, value }) => {
          const replacedKey = replaceVariables(key);
          const replacedValue = replaceVariables(value);
          acc[replacedKey] = replacedValue;
          return acc;
        },
        {} as Record<string, any>
      ) || {};

    const mergedParams =
      method.toUpperCase() === 'GET' || staticParams
        ? { ...staticParamsObj, ...params }
        : staticParamsObj;

    return Object.keys(mergedParams).length > 0 ? mergedParams : undefined;
  })();

  return {
    headers,
    body,
    queryParams
  };
};

/**
 * HTTP 工具统一执行入口。导入工具从 OpenAPI 原文恢复参数位置，手动工具使用显式模板。
 * 鉴权配置优先于动态 Header，并在路径参数编码后验证最终 URL；失败返回 errorMsg。
 */
export const runHTTPTool = async ({
  baseUrl,
  toolPath,
  method = 'POST',
  params,
  headerSecret,
  customHeaders,
  staticParams,
  staticHeaders,
  staticBody,
  apiSchemaStr
}: RunHTTPToolParams): Promise<RunHTTPToolResult> => {
  try {
    // OpenAPI 与手动工具共用发送层，但参数来源不同；不能用 staticBody 缺失来猜测来源。
    const openApiSchema = apiSchemaStr?.trim();
    const manualRequest = buildHttpRequest({
      method,
      params,
      headerSecret,
      customHeaders,
      staticParams,
      staticHeaders,
      staticBody: openApiSchema ? undefined : staticBody
    });
    const request = openApiSchema
      ? await buildOpenAPIHttpRequest({ apiSchemaStr: openApiSchema, toolPath, method, params })
      : { ...manualRequest, toolPath };
    const headers = { ...request.headers, ...manualRequest.headers };
    // Construct full base URL
    const fullBaseUrl = !baseUrl
      ? ''
      : baseUrl.startsWith('http://') || baseUrl.startsWith('https://')
        ? baseUrl
        : `https://${baseUrl}`;

    // SSRF Protection: Validate URL before making request
    // When baseUrl is empty, toolPath must be a complete URL
    const fullUrl = fullBaseUrl
      ? new URL(request.toolPath, fullBaseUrl).toString()
      : new URL(request.toolPath).toString();

    if (await isInternalAddress(fullUrl)) {
      return { errorMsg: PRIVATE_URL_TEXT };
    }

    const { data } = await axios({
      method: method.toUpperCase(),
      baseURL: fullBaseUrl,
      url: request.toolPath,
      headers,
      data: request.body,
      params: request.queryParams,
      timeout: 300000
    });

    return { data };
  } catch (error) {
    logger.warn('HTTP tool request failed', { error });
    return { errorMsg: getErrText(error) };
  }
};

/** Read the current HTTP tool list from a toolset app. */
export const getHTTPToolList = async (app: AppSchemaType) => {
  if (app.type !== AppTypeEnum.httpToolSet) return [];

  const modules = decodeHttpToolSetNodesFromStorage(app.modules);
  const toolSet = modules[0]?.toolConfig?.httpToolSet;
  const toolList = HttpToolConfigTypeSchema.array().safeParse(
    toolSet && 'toolList' in toolSet ? toolSet.toolList : undefined
  ).data;
  // 只有导入工具有 OpenAPI 原文；历史 Body-only Schema 只补原文明示的非 Body 参数。
  const apiSchemaStr = toolSet && 'apiSchemaStr' in toolSet ? toolSet.apiSchemaStr : undefined;
  const pathData =
    toolList?.length && apiSchemaStr?.trim()
      ? // 读取旧配置时，无法解析原文就不猜测补字段，保留存储契约供编辑修复。
        // 真正发送请求时 buildOpenAPIHttpRequest 仍严格校验原文，不会静默发送空请求。
        ((await str2OpenApiSchema(apiSchemaStr).catch(() => undefined))?.pathData ?? [])
      : [];

  return (
    toolList?.map((item) => {
      const operation = pathData.find(
        (path) => path.path === item.path && path.method.toUpperCase() === item.method.toUpperCase()
      );
      const bodySchema = operation?.request?.content?.['application/json']?.schema;
      return {
        ...item,
        ...(bodySchema
          ? {
              requestSchema: completeOpenAPIRequestSchema({
                requestSchema: item.requestSchema ?? bodySchema,
                parameters: operation?.params
              })
            }
          : {}),
        id: `${AppToolSourceEnum.http}-${String(app._id)}/${item.name}`,
        avatar: app.avatar
      };
    }) ?? []
  );
};
