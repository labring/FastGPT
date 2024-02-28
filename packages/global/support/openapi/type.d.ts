export type OpenApiSchema = {
  _id: string;
  teamId: string;
  tmbId: string;
  createTime: Date;
  lastUsedTime?: Date;
  apiKey: string;
  appId?: string;
  name: string;
  usagePoints: number;
  limit?: {
    expiredTime?: Date;
    maxUsagePoints: number;
  };
};
