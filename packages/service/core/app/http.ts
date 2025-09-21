import type { AppSchema } from '@fastgpt/global/core/app/type';
import { PluginSourceEnum } from '@fastgpt/global/core/app/plugin/constants';
import { MongoApp } from './schema';
import { addLog } from '../../common/system/log';
import { type StoreSecretValueType } from '@fastgpt/global/common/secret/type';
import { getSecretValue } from '../../common/secret/utils';
import axios from 'axios';

export type RunHTTPToolParams = {
  baseUrl: string;
  toolPath: string;
  method: string;
  params: Record<string, any>;
  headerSecret?: StoreSecretValueType;
  customHeaders?: Record<string, string>;
};

export type RunHTTPToolResult = {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError: boolean;
  message?: string;
};

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

    const response = await axios({
      method: method.toUpperCase(),
      url: `https://${baseUrl}${toolPath}`,
      headers,
      data: params,
      params,
      timeout: 300000,
      httpsAgent: new (require('https').Agent)({
        rejectUnauthorized: false
      })
    });

    return {
      content: [
        {
          type: 'text',
          text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
        }
      ],
      isError: false
    };
  } catch (error: any) {
    addLog.error(`[HTTP Tool] Failed to call tool:`, error);
    return {
      content: [],
      isError: true,
      message: error.response?.data?.message || error.message || 'HTTP request failed'
    };
  }
}
