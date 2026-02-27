import { SandboxCodeTypeEnum } from '@fastgpt/global/core/workflow/template/system/sandbox/constants';
import type { AxiosInstance } from 'axios';
import axios from 'axios';

export type SanndboxPackagesResponse = {
  js: string[];
  python: string[];
  builtinGlobals: string[];
};

export class CodeSandbox {
  private readonly client: AxiosInstance;

  constructor() {
    const baseUrl = process.env.SANDBOX_URL;
    const token = process.env.SANDBOX_TOKEN;

    this.client = axios.create({
      baseURL: `${baseUrl.replace(/\/$/, '')}/sandbox`,
      timeout: 180000,
      headers: {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : undefined
      }
    });

    this.client.interceptors.response.use(
      (response) => {
        const data = response.data;
        if (!data.success) {
          return Promise.reject(new Error(data.message || 'Request code sandbox failed'));
        }
        return response.data;
      },
      (error) => {
        return Promise.reject(error);
      }
    );
  }

  async getPackages() {
    const { data } = await this.client.get<SanndboxPackagesResponse>('/modules');
    return data;
  }

  async runCode({
    codeType,
    code,
    variables
  }: {
    codeType: string;
    code: string;
    variables: Record<string, any>;
  }) {
    const url = (() => {
      if (codeType == SandboxCodeTypeEnum.py) {
        return `/python`;
      } else {
        return `/js`;
      }
    })();

    const { data } = await this.client.post<{
      codeReturn: Record<string, any>;
      log: string;
    }>(url, { code, variables });

    return data;
  }
}

export const codeSandbox = new CodeSandbox();
