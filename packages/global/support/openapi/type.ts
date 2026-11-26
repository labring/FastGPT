import type { ApiKeyTypeEnum } from './constants';

export type OpenApiSchema = {
  _id: string;
  teamId: string;
  tmbId: string;
  createTime: Date;
  lastUsedTime?: Date;
  apiKey: string;
  type: ApiKeyTypeEnum;
  /** personal 的历史默认应用或 app 的强绑定；权限判断必须先解析密钥类型。 */
  appId?: string;
  appName?: string;
  tagIds?: string[];
  authProxy?: boolean;
  name: string;
  usagePoints: number;
  limit?: {
    expiredTime?: Date;
    maxUsagePoints: number;
  };
};
