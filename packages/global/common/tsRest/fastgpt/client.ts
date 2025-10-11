import { initClient } from '@ts-rest/core';
import { fastgptContract } from './contracts';

export function createFastGPTClient(options: {
  baseUrl: string;
  baseHeaders?: Record<string, string>;
  api?: any;
  credentials?: RequestCredentials;
  throwOnUnknownStatus?: boolean;
  validateResponse?: boolean;
}) {
  return initClient(fastgptContract, options);
}
