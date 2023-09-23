export type OpenApiSchema = {
  _id: string;
  userId: string;
  createTime: Date;
  lastUsedTime?: Date;
  apiKey: string;
  appId?: string;
  name: string;
  usage: number;
  limit?: {
    expiredTime?: Date;
    credit?: number;
  };
};
