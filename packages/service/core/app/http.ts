import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { getSecretValue } from '../../common/secret/utils';
import axios from 'axios';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';
import type { HttpToolConfigType } from '@fastgpt/global/core/app/type';

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

const buildHeaders = ({
  customHeaders,
  headerSecret,
  staticHeaders,
  contentType,
  formDataHeaders
}: {
  customHeaders?: Record<string, string>;
  headerSecret?: StoreSecretValueType;
  staticHeaders?: Array<{ key: string; value: string }>;
  contentType?: string;
  formDataHeaders?: Record<string, string>;
}) => {
  const baseHeaders = {
    'Content-Type': 'application/json',
    ...(customHeaders || {}),
    ...(headerSecret ? getSecretValue({ storeSecret: headerSecret }) : {})
  };

  const staticHeadersObj = staticHeaders?.reduce(
    (acc, { key, value }) => {
      acc[key] = value;
      return acc;
    },
    {} as Record<string, string>
  );

  const headers = {
    ...baseHeaders,
    ...(staticHeadersObj || {}),
    ...(formDataHeaders || {})
  };

  if (contentType) {
    headers['Content-Type'] = contentType;
  }

  return headers;
};

const buildRequestBody = ({
  staticBody,
  params,
  method
}: {
  staticBody?: HttpToolConfigType['staticBody'];
  params: Record<string, any>;
  method: string;
}): {
  body: any;
  contentType?: string;
  formDataHeaders?: Record<string, string>;
} => {
  if (!staticBody || staticBody.type === 'none') {
    if (['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      return { body: params };
    }
    return { body: undefined };
  }

  if (staticBody.type === 'json') {
    const body = staticBody.content ? JSON.parse(staticBody.content) : {};
    return { body: { ...body, ...params } };
  }

  if (staticBody.type === 'form-data') {
    const formData = new (require('form-data'))();
    staticBody.formData?.forEach(({ key, value }) => {
      formData.append(key, value);
    });
    Object.entries(params).forEach(([key, value]) => {
      formData.append(key, value);
    });
    return {
      body: formData,
      formDataHeaders: formData.getHeaders()
    };
  }

  if (staticBody.type === 'x-www-form-urlencoded') {
    const urlencoded = new URLSearchParams();
    staticBody.formData?.forEach(({ key, value }) => {
      urlencoded.append(key, value);
    });
    Object.entries(params).forEach(([key, value]) => {
      urlencoded.append(key, String(value));
    });
    return {
      body: urlencoded.toString(),
      contentType: 'application/x-www-form-urlencoded'
    };
  }

  if (staticBody.type === 'xml' || staticBody.type === 'raw') {
    return {
      body: staticBody.content || '',
      contentType: staticBody.type === 'xml' ? 'application/xml' : 'text/plain'
    };
  }

  return { body: undefined };
};

const buildQueryParams = ({
  staticParams,
  params,
  method
}: {
  staticParams?: Array<{ key: string; value: string }>;
  params: Record<string, any>;
  method: string;
}): Record<string, any> | undefined => {
  const queryParams: Record<string, any> = {};

  staticParams?.forEach(({ key, value }) => {
    queryParams[key] = value;
  });

  if (method.toUpperCase() === 'GET' || staticParams) {
    Object.assign(queryParams, params);
  }

  return Object.keys(queryParams).length > 0 ? queryParams : undefined;
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
    const { body, contentType, formDataHeaders } = buildRequestBody({
      staticBody,
      params,
      method
    });

    const headers = buildHeaders({
      customHeaders,
      headerSecret,
      staticHeaders,
      contentType,
      formDataHeaders
    });

    const queryParams = buildQueryParams({
      staticParams,
      params,
      method
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
    console.log(error);
    return { errorMsg: getErrText(error) };
  }
};
