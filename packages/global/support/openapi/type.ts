import type { ApiKeyTypeEnum } from './constants';

export type OpenApiSchema = {
  _id: string;
  teamId: string;
  tmbId: string;
  createTime: Date;
  lastUsedTime?: Date;
  apiKey: string;
  /** 历史记录可能缺失；必须按 appId 判定，不能默认降级为个人密钥。 */
  type?: ApiKeyTypeEnum;
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
