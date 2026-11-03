import { SandboxCodeTypeEnum } from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import type { AxiosInstance } from 'axios';
import { createProxyAxios } from '../../common/api/axios';
import { getLogger, LogCategories } from '../../common/logger';
import { getSystemInstanceConfig } from '../../common/system/systemInstanceConfig/runtime';
const logger = getLogger(LogCategories.MODULE.WORKFLOW.CODE_SANDBOX);

export type SanndboxPackagesResponse = {
  js: string[];
  python: string[];
  builtinGlobals: string[];
};

export class CodeSandbox {
  private client: AxiosInstance | undefined;
  private currentBaseUrl = '';
  private currentToken = '';

  private getClient(): AxiosInstance {
    const { baseUrl, token } = getSystemInstanceConfig().subservice.codeSandbox;

    if (!this.client || this.currentBaseUrl !== baseUrl || this.currentToken !== token) {
      this.currentBaseUrl = baseUrl;
      this.currentToken = token;

      this.client = createProxyAxios(
        {
          baseURL: `${baseUrl}/sandbox`,
          timeout: 180000,
          headers: {
            'Content-Type': 'application/json',
            Authorization: token ? `Bearer ${token}` : undefined
          }
        },
        false
      );

      this.client.interceptors.response.use(
        (response) => {
          const data = response.data;
          if (!data.success) {
            logger.warn('Request code sandbox failed', { data });
            return Promise.reject(new Error(data.message || 'Request code sandbox failed'));
          }
          return response.data;
        },
        (error) => {
          const message = error?.response?.data?.message;
          if (typeof message === 'string' && message) {
            return Promise.reject(new Error(message));
          }
          return Promise.reject(error);
        }
      );
    }

    return this.client;
  }

  async getPackages() {
    const { data } = await this.getClient().get<SanndboxPackagesResponse>('/modules');
    return data;
  }

  async runCode({
    codeType,
    code,
    variables,
    queueId
  }: {
    codeType: string;
    code: string;
    variables: Record<string, any>;
    queueId?: string;
  }) {
    const url = (() => {
      if (codeType == SandboxCodeTypeEnum.py) {
        return `/python`;
      } else {
        return `/js`;
      }
    })();

    const { data } = await this.getClient().post<{
      codeReturn: Record<string, any>;
      log: string;
    }>(url, { code, variables, queueId });

    return data;
  }
}

export const codeSandbox = new CodeSandbox();
