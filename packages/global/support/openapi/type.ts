import type { ApiKeyTypeEnum } from './constants';

export type OpenApiSchema = {
  _id: string;
  teamId: string;
  tmbId: string;
  createTime: Date;
  lastUsedTime?: Date;
  apiKey: string;
  type: ApiKeyTypeEnum;
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
