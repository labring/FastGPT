import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { getSecretValue } from '../../common/secret/utils';
import axios from 'axios';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/type';
import { contentTypeMap, ContentTypes } from '@fastgpt/global/core/workflow/constants';

export type RunHTTPToolParams = {
  baseUrl: string;
  toolPath: string;
  method: string;
  params: Record<string, any>;
  headerSecret?: StoreSecretValueType;
  customHeaders?: Record<string, string>;
  staticParams?: HttpToolConfigType['staticParams'];
  staticHeaders?: HttpToolConfigType['staticHeaders'];
  staticBody?: HttpToolConfigType['staticBody'];
};

export type RunHTTPToolResult = RequireOnlyOne<{
  data?: any;
  errorMsg?: string;
}>;

const buildHttpRequest = ({
  method,
  params,
  headerSecret,
  customHeaders,
  staticParams,
  staticHeaders,
  staticBody
}: Omit<RunHTTPToolParams, 'baseUrl' | 'toolPath'>) => {
  const body = (() => {
    if (!staticBody || staticBody.type === ContentTypes.none) {
      return ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase()) ? params : undefined;
    }

    if (staticBody.type === ContentTypes.json) {
      const staticContent = staticBody.content ? JSON.parse(staticBody.content) : {};
      return { ...staticContent, ...params };
    }

    if (staticBody.type === ContentTypes.formData) {
      const formData = new (require('form-data'))();
      staticBody.formData?.forEach(({ key, value }) => {
        formData.append(key, value);
      });
      Object.entries(params).forEach(([key, value]) => {
        formData.append(key, value);
      });
      return formData;
    }

    if (staticBody.type === ContentTypes.xWwwFormUrlencoded) {
      const urlencoded = new URLSearchParams();
      staticBody.formData?.forEach(({ key, value }) => {
        urlencoded.append(key, value);
      });
      Object.entries(params).forEach(([key, value]) => {
        urlencoded.append(key, String(value));
      });
      return urlencoded.toString();
    }

    if (staticBody.type === ContentTypes.xml || staticBody.type === ContentTypes.raw) {
      return staticBody.content || '';
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
        acc[key] = value;
        return acc;
      },
      {} as Record<string, string>
    ) || {})
  };

  const queryParams = (() => {
    const staticParamsObj =
      staticParams?.reduce(
        (acc, { key, value }) => {
          acc[key] = value;
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

export const runHTTPTool = async ({
  baseUrl,
  toolPath,
  method = 'POST',
  params,
  headerSecret,
  customHeaders,
  staticParams,
  staticHeaders,
  staticBody
}: RunHTTPToolParams): Promise<RunHTTPToolResult> => {
  try {
    const { headers, body, queryParams } = buildHttpRequest({
      method,
      params,
      headerSecret,
      customHeaders,
      staticParams,
      staticHeaders,
      staticBody
    });

    const { data } = await axios({
      method: method.toUpperCase(),
      baseURL: baseUrl.startsWith('https://') ? baseUrl : `https://${baseUrl}`,
      url: toolPath,
      headers,
      data: body,
      params: queryParams,
      timeout: 300000,
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
      })
    });

    return { data };
  } catch (error: any) {
    return { errorMsg: getErrText(error) };
  }
};
