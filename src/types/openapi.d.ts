export interface UserOpenApiKey {
  id: string;
  apiKey: string;
  createTime: Date;
  lastUsedTime?: Date;
}
