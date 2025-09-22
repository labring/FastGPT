import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { getSecretValue } from '../../common/secret/utils';
import axios from 'axios';
import { getErrText } from '@fastgpt/global/common/error/utils';
import type { RequireOnlyOne } from '@fastgpt/global/common/type/utils';

export type RunHTTPToolParams = {
  baseUrl: string;
  toolPath: string;
  method: string;
  params: Record<string, any>;
  headerSecret?: StoreSecretValueType;
  customHeaders?: Record<string, string>;
};

export type RunHTTPToolResult = RequireOnlyOne<{
  data?: any;
  errorMsg?: string;
}>;

export async function runHTTPTool({
  baseUrl,
  toolPath,
  method = 'POST',
  params,
  headerSecret,
  customHeaders
}: RunHTTPToolParams): Promise<RunHTTPToolResult> {
  try {
    const headers = {
      'Content-Type': 'application/json',
      ...(customHeaders || {}),
      ...(headerSecret ? getSecretValue({ storeSecret: headerSecret }) : {})
    };

    const { data } = await axios({
      method: method.toUpperCase(),
      baseURL: baseUrl.startsWith('https://') ? baseUrl : `https://${baseUrl}`,
      url: toolPath,
      headers,
      data: params,
      params,
      timeout: 300000,
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
      })
    });

    return {
      data
    };
  } catch (error: any) {
    console.log(error);
    return {
      errorMsg: getErrText(error)
    };
  }
}
