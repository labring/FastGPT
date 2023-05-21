import { POST } from './request';
import type { TextPluginRequestParams } from '@/types/plugin';

export const sensitiveCheck = (data: TextPluginRequestParams) =>
  POST('/openapi/text/sensitiveCheck', data);
